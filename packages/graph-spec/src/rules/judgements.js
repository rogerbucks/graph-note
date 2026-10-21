// §23 judgements: their basis, the review of a decision, the why layers, and the judgement rules.
'use strict';

const { norm } = require('../values/times.js');
const { byKey } = require('../values/order.js');
const { jcs, hash16, basisHash } = require('../hashing/canonical-json.js');
const { NAMED_RULE, digitsOf, unnamedHashes } = require('../hashing/named.js');
const { bandRank } = require('./certainty.js');
const { viewAt, below } = require('./paths.js');
const { lensBuckets } = require('./lenses.js');
const { proposersOf, proposerWarnings: proposerWarningsOf } = require('./proposers.js');

// §23 judgements
const JUDGEMENT_EDGES = ['RESTS_ON', 'ASSUMES', 'UNDER'];
// A Ref followed into the graph it names: [props or null, labels, superseded?]. A missing graph or node is
// [null, empty, false], so a broken pin reads as unresolved rather than throwing.
function resolve(w, ref) {
  const g = w[ref.graph];
  if (!g || !g.nodes.has(ref.ref)) return [null, new Set(), false];
  return [g.p(ref.ref), new Set(g.nodes.get(ref.ref)[0]), g.inc(ref.ref, 'SUPERSEDES').length > 0];
}
function basis(w, jg, d) {
  const g = w[jg];
  return g
    .out(d)
    .filter((e) => g.has(e[2], 'Ref'))
    .map((e) => ({ ty: e[1], e: e[3], ref: g.p(e[2]).ref, graph: g.p(e[2]).graph, rid: e[2] }));
}
function currentDecisions(w, jg) {
  const g = w[jg];
  return g
    .labelled('Decision')
    .filter((d) => !g.inc(d, 'SUPERSEDES').some((e) => g.has(e[0], 'Decision')))
    .sort();
}
// The content hash that seals node `id` of judgement graph jg: its own properties and every link it states, under
// `key`. rule:judgement-hash@1 seals a Decision under 'decision', rule:serving-hash@1 a Serving under 'serving'.
function sealHash(w, jg, id, key) {
  const g = w[jg],
    p = g.p(id),
    own = {};
  for (const [k, v] of Object.entries(p)) if (k !== 'content_hash' && k !== 'review') own[k] = norm(v);
  const edges = g
    .out(id)
    .map(([, t, x, e]) => {
      const o = {};
      for (const k of Object.keys(e).sort()) o[k] = norm(e[k]);
      return [t, x, o];
    })
    .sort(byKey(jcs));
  return hash16({ [key]: own, edges });
}
const judgementHash = (w, jg, d) => sealHash(w, jg, d, 'decision');
// rule:serving-hash@1: the content hash that seals a Serving, over what it records and every item it served
const servingHash = (w, jg, s) => sealHash(w, jg, s, 'serving');
// rule:judgement-review@1: {decision id: sorted reasons} for each current Decision — basis-moved, needs-engine,
// assumption-weakened, shape-changed; an empty list means none. A lens pin whose rule needs an engine gives
// needs-engine — never silence. `sw` switches parts of the rule off ('lens-pins', 'assumption-bands').
function review(w, jg, sw = new Set()) {
  const out = {};
  for (const d of currentDecisions(w, jg)) {
    const why = new Set();
    for (const b of basis(w, jg, d)) {
      if (!JUDGEMENT_EDGES.includes(b.ty)) continue;
      const [p, , sup] = resolve(w, b);
      if (p === null) continue;
      if (b.ty === 'RESTS_ON' && b.e.lens) {
        if (sw.has('lens-pins')) continue;
        const lg = w[b.graph],
          lz = lg.labelled('Lens').find((x) => x === b.e.lens),
          got = lz ? lensBuckets(lg, lg.p(lz).rule_gql) : null;
        if (got === null) why.add('needs-engine');
        else if (got[b.ref] !== b.e.bucket) why.add('basis-moved');
      } else if (b.ty === 'RESTS_ON' && (sup || basisHash(p, b.e.reads) !== digitsOf(b.e.hash))) why.add('basis-moved');
      if (
        b.ty === 'ASSUMES' &&
        (p.status === 'refuted' ||
          (!sw.has('assumption-bands') && bandRank(p.likelihood) < bandRank(b.e.likelihood_then)))
      )
        why.add('assumption-weakened');
      if (b.ty === 'UNDER' && sup) why.add('shape-changed');
    }
    out[d] = [...why].sort();
  }
  return out;
}
// The why layer of a view. It is the current judgements in jg resting on, or assuming, anything shown of path top in
// graph dg at that altitude. It also takes what is folded into it, unless 'why-folded' is switched off. Sorted.
function whyLayer(w, jg, dg, top, level, sw = new Set()) {
  const g = w[dg],
    seen = new Set([top, ...viewAt(g, top, level)]);
  if (!sw.has('why-folded')) below(g, top).forEach((x) => seen.add(x));
  const hits = new Set();
  for (const d of currentDecisions(w, jg))
    if (basis(w, jg, d).some((b) => ['RESTS_ON', 'ASSUMES'].includes(b.ty) && b.graph === dg && seen.has(b.ref)))
      hits.add(d);
  return [...hits].sort();
}
// §23's rules on judgement graph jg, and on the graphs of the world it refers into, as [label, ok] pairs.
function judgementsRules(w, jg) {
  const g = w[jg],
    out = [],
    ds = g.labelled('Decision');
  out.push([
    '§23 rule 1: every judgement is decided by a person, never a model',
    ds.every((d) => {
      const who = basis(w, jg, d)
        .filter((b) => b.ty === 'DECIDED_BY')
        .map((b) => resolve(w, b)[1]);
      return who.length && who.every((labels) => labels.has('Person'));
    }),
  ]);
  out.push([
    '§23 rule 2: every basis pin resolves, says what it read (or which lens bucket), and was read no later than the decision',
    ds.every((d) =>
      basis(w, jg, d)
        .filter((b) => b.ty === 'RESTS_ON')
        .every((b) => {
          const e = b.e,
            said = (e.hash && e.reads) || (e.lens && e.bucket);
          return resolve(w, b)[0] !== null && said && e.as_of && !(e.as_of > g.p(d).at);
        }),
    ),
  ]);
  out.push([
    '§23 rule 3: every assumption is a claim (§20), never a fact',
    ds.every((d) =>
      basis(w, jg, d)
        .filter((b) => b.ty === 'ASSUMES')
        .every((b) => resolve(w, b)[1].has('Claim')),
    ),
  ]);
  const rv = review(w, jg);
  out.push([
    '§23 rule 4: a stored review equals rule:judgement-review@1',
    ds.every((d) => {
      const r = g.p(d).review;
      return r === undefined || r === null || r === ((rv[d] || []).join(', ') || 'none');
    }),
  ]);
  out.push([
    '§23 rule 5: nothing in a data graph links into the judgement graph — judgements stay out of view',
    !Object.entries(w).some(([x, other]) => x !== jg && other.labelled('Ref').some((r) => other.p(r).graph === jg)),
  ]);
  out.push([
    '§23 rule 6: every proposal is attributed to the model that proposed it',
    g.labelled('Proposal').every((p) => {
      const ms = proposersOf(w, g, p, resolve);
      return ms.length && ms.every((m) => m.labels.has('Model'));
    }),
  ]);
  out.push([
    '§23 rule 7: no judgement is edited — each content hash, covering its pins, still matches (rule:judgement-hash@1)',
    ds.every((d) => digitsOf(g.p(d).content_hash) === judgementHash(w, jg, d)),
  ]);
  out.push([NAMED_RULE, !unnamedHashes(g).length]);
  return out;
}

/** The warnings for a proposal whose proposer is named in the old form, through ASSOCIATED_WITH on its activity (§23 rule 6). */
const proposerWarnings = (w, jg) => proposerWarningsOf(w, jg, resolve);

module.exports = { resolve, review, whyLayer, judgementsRules, proposerWarnings, servingHash };
