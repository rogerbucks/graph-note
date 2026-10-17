// §21 joins: finishing a joined result — its relationships' claims, its breaches and its hashes.
'use strict';

const { byKey } = require('../values/order.js');
const { sha256hex } = require('../hashing/sha256.js');
const { pystr, vtext, identStr, keystr } = require('./python-text.js');
const { breaches } = require('./validate.js');
const { addClaim } = require('./claims.js');

function edgeClaim(joined, e, docs, extraWhat, props) {
  const id = identStr(e);
  return addClaim(
    joined,
    e[0],
    `${e[1]}-${pystr(e[2])}` + (id ? `/${id}` : '') + (extraWhat || ''),
    docs,
    [
      ['subject', e[0]],
      ['object', e[2]],
    ],
    Object.assign({ claimed_relationship: e[1], edge_ident: id, _key: e, _props: Object.assign({}, props) }, props),
  );
}
// Paradox checks on the joined graph, flags for a person, then findings. A breach is a paradox only when more than one
// document stands behind it: its statements become claims and leave the graph. Duplicates by name and undeclared
// properties are flagged, never changed. Findings confirm and refute claims and apply what they confirm; last, each
// claim's confidence comes from the documents for it and against it.
function finish(
  joined,
  config,
  findings = [],
  checks = ['cycles', 'cardinality', 'constraints', 'determinism', 'flags'],
) {
  const found = breaches(joined.nodes, joined.edges, config, checks).filter(
    (b) =>
      new Set([
        ...b.edges.flatMap((e) => joined.esrc.get(keystr(e)) || []),
        ...b.slots.flatMap(([n, k]) => joined.src.get(n + '\u0000' + k) || []),
      ]).size > 1,
  );
  const goneE = new Set(),
    goneS = [];
  for (const b of found) {
    let ids = [];
    for (const e of b.edges) {
      ids.push(
        edgeClaim(
          joined,
          e,
          joined.esrc.get(keystr(e)),
          '',
          Object.assign({}, (joined.edges.get(keystr(e)) || { props: {} }).props),
        ),
      );
      joined.report.push([b.kind, e[0], e[1], '', `PARADOX — ${b.why}`, 'decide which holds; a finding confirms one']);
      goneE.add(keystr(e));
    }
    for (const [nid, k] of b.slots) {
      const v = joined.nodes.get(nid).props[k];
      ids.push(
        addClaim(
          joined,
          nid,
          `${k}=${vtext(v === undefined ? null : v)}`,
          joined.src.get(nid + '\u0000' + k),
          [['subject', nid]],
          { claimed_property: k, claimed_value: v === undefined ? null : v },
        ),
      );
      joined.report.push([b.kind, nid, k, '', `PARADOX — ${b.why}`, 'decide which holds; a finding confirms one']);
      goneS.push([nid, k]);
    }
    ids = [...new Set(ids)].sort();
    if (ids.length === 2) joined.pairs.push(ids);
    else joined.paradoxes.push(['paradox:join/' + sha256hex(ids.join('|')).slice(0, 10), b.why, ids]);
  }
  for (const e of goneE) joined.edges.delete(e);
  for (const [nid, k] of goneS) delete joined.nodes.get(nid).props[k];
  if (checks.includes('flags')) {
    const byname = new Map();
    for (const [nid, n] of joined.nodes)
      if ('name' in n.props) {
        const key = [...n.labels].sort().join(':') + '\u0000' + pystr(n.props.name);
        (byname.get(key) || byname.set(key, []).get(key)).push(nid);
      }
    for (const ids of byname.values())
      if (ids.length > 1)
        joined.report.push([
          'duplicate',
          ids.join(', '),
          'name',
          '',
          'POSSIBLE DUPLICATE — flagged, never merged by the join',
          'decide; if one thing, declare an id map and re-join',
        ]);
    for (const [nid, n] of joined.nodes) {
      const known = new Set([...n.labels].flatMap((label) => [...(config.vocab[label] || [])]));
      for (const k of Object.keys(n.props))
        if (known.size && !known.has(k))
          joined.report.push([
            'undeclared',
            nid,
            k,
            '',
            'UNDECLARED PROPERTY — flagged',
            'declare a unit map, or fix the source',
          ]);
    }
  }
  for (const f of findings) {
    const c = joined.claims.get(f.confirms);
    c.status = 'confirmed';
    for (const x of f.refutes) joined.claims.get(x).status = 'refuted';
    const s = c._about[0][1];
    if ('claimed_node' in c) {
      if (c.claimed_absent && joined.nodes.has(s)) {
        const nd = joined.nodes.get(s);
        for (const label of [...nd.labels].sort())
          joined.claims.get(
            addClaim(joined, s, `label/${label}`, nd.stated_in, [['subject', s]], { claimed_label: label }),
          ).status = 'refuted';
        for (const k of Object.keys(nd.props).sort())
          if (k !== 'id') {
            const v = nd.props[k];
            joined.claims.get(
              addClaim(
                joined,
                s,
                `${k}=${vtext(v)}`,
                joined.src.get(s + '\u0000' + k) || nd.stated_in,
                [['subject', s]],
                {
                  claimed_property: k,
                  claimed_value: v,
                },
              ),
            ).status = 'refuted';
          }
        for (const [ek, { key: e, props }] of [...joined.edges].filter(([, { key: e }]) => e[0] === s || e[2] === s)) {
          joined.claims.get(edgeClaim(joined, e, joined.esrc.get(ek), '', props)).status = 'refuted';
          joined.edges.delete(ek);
        }
        joined.nodes.delete(s);
      }
    } else if ('claimed_relationship' in c && 'claimed_property' in c) {
      const ek = keystr(c._key);
      if (c.claimed_absent) {
        if (joined.edges.has(ek)) delete joined.edges.get(ek).props[c.claimed_property];
      } else {
        if (!joined.edges.has(ek)) joined.edges.set(ek, { key: c._key, props: {} });
        joined.edges.get(ek).props[c.claimed_property] = c.claimed_value;
      }
    } else if ('claimed_relationship' in c && c.claimed_absent) {
      const ek = keystr(c._key);
      if (joined.edges.has(ek)) {
        joined.claims.get(
          edgeClaim(joined, c._key, joined.esrc.get(ek), '/as-kept', joined.edges.get(ek).props),
        ).status = 'refuted';
        joined.edges.delete(ek);
      }
    } else if ('claimed_relationship' in c && c.kept) {
      /* the relationship stays as it is */
    } else if ('claimed_relationship' in c) {
      joined.edges.set(keystr(c._key), { key: c._key, props: Object.assign({}, c._props) });
      joined.esrc.set(keystr(c._key), c._docs);
    } else if ('claimed_property' in c) {
      if (!c.claimed_absent) joined.nodes.get(s).props[c.claimed_property] = c.claimed_value;
    } else c.claimed_label.split(':').forEach((label) => joined.nodes.get(s).labels.add(label));
  }
  joined.pairs = [...new Map(joined.pairs.map((p) => [p.join('\u0000'), p])).values()].sort(
    byKey((p) => p.join('\u0000')),
  );
  const against = new Map(),
    addTo = (k, ds) => {
      const st = against.get(k) || against.set(k, new Set()).get(k);
      ds.forEach((d) => st.add(d));
    };
  for (const [x, y] of joined.pairs) {
    addTo(x, joined.claims.get(y)._docs);
    addTo(y, joined.claims.get(x)._docs);
  }
  for (const [, , ids] of joined.paradoxes)
    for (const x of ids)
      addTo(
        x,
        ids.filter((y) => y !== x).flatMap((y) => joined.claims.get(y)._docs),
      );
  for (const [cid, c] of joined.claims) {
    const sup = c._docs.length,
      con = [...(against.get(cid) || [])].filter((d) => !c._docs.includes(d)).length;
    c.confidence = sup >= 2 && !con ? 'high' : sup > con ? 'moderate' : 'low';
  }
  return joined;
}

module.exports = { finish };
