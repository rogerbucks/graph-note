// §21 joins: trust on joined graphs (req:21.trust-counted, req:21.prefix-owner; editor spec §51, spec_join_trust).
// - A join may name each document's trust: own, trusted or untrusted. One it does not name is untrusted. A join that
//   names none counts every document as own.
// - Only own and trusted documents are joined. What only an untrusted one states is a flagged row. It is left out of
//   the result, and is never a contested claim, until a person raises its level.
// - An id prefix may have an owner. A thing under it from another document is refused, with the owner named, and the
//   relationships to and from it go with it.
'use strict';

const { pyeq } = require('./python-text.js');

// The levels of trust a join may name for a document, most trusted first.
const LEVELS = ['own', 'trusted', 'untrusted'];
const FLAGGED = 'flagged — from an untrusted source, not counted until a person accepts it';

const edgeText = ([from, type, to]) => `${from}-[:${type}]->${to}`;

// The level of each document, by id. A level not in LEVELS is refused.
function levelsOf(docs, trust) {
  const named = trust || {};
  for (const [id, level] of Object.entries(named))
    if (!LEVELS.includes(level)) throw new Error(`The trust of ${id} must be own, trusted or untrusted, not ${level}`);
  const none = Object.keys(named).length === 0;
  return new Map(docs.map((d) => [d.id, none ? 'own' : named[d.id] || 'untrusted']));
}

// Removes from each document the things under a prefix another document owns, and the relationships that touch them.
function refuseForeign(docs, owners, report) {
  for (const d of docs) {
    const refused = new Set();
    for (const nid of [...d.nodes.keys()]) {
      const prefix = nid.includes(':') ? nid.slice(0, nid.indexOf(':')) : null;
      const owner = prefix === null ? undefined : (owners || {})[prefix];
      if (owner === undefined || owner === d.id) continue;
      refused.add(nid);
      d.nodes.delete(nid);
      report.push(['prefix', nid, 'id', '', `refused — the prefix ${prefix} belongs to ${owner}`, d.id]);
    }
    for (const [ks, { key }] of [...d.edges]) if (refused.has(key[0]) || refused.has(key[2])) d.edges.delete(ks);
  }
}

// The documents a join counts, after refusing what is under another's prefix, and the untrusted ones held aside.
function heldByTrust(docs, config, report) {
  refuseForeign(docs, config.owners, report);
  const levels = levelsOf(docs, config.trust);
  return {
    counted: docs.filter((d) => levels.get(d.id) !== 'untrusted'),
    untrusted: docs.filter((d) => levels.get(d.id) === 'untrusted'),
  };
}

// A flagged row on the joined result for each thing, value and relationship an untrusted document states that the
// counted ones do not.
function flagUntrusted(joined, untrusted) {
  const flag = (subject, attribute, by) => joined.report.push(['untrusted', subject, attribute, '', FLAGGED, by]);
  for (const d of untrusted) {
    for (const [nid, n] of [...d.nodes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const counted = joined.nodes.get(nid);
      if (!counted) {
        flag(nid, 'thing', d.id);
        continue;
      }
      for (const k of Object.keys(n.props).sort())
        if (!(k in counted.props) || !pyeq(counted.props[k], n.props[k])) flag(nid, k, d.id);
    }
    for (const [ks, { key }] of d.edges) if (!joined.edges.has(ks)) flag(edgeText(key), 'relationship', d.id);
  }
  return joined;
}

module.exports = { LEVELS, heldByTrust, flagUntrusted };
