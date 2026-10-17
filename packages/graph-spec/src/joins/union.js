// §21 joins: the union of documents, with how values refine and agree.
'use strict';

const { byKey } = require('../values/order.js');
const { pystr, pyeq, vtext, identStr } = require('./python-text.js');
const { newJ, addClaim, sortedPair } = require('./claims.js');

const combos = (a) => {
  const o = [];
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) o.push([a[i], a[j]]);
  return o;
};
function groupBy(entries) {
  // [[doc, value]] -> [[value, [docs]]], values compared as Python compares dict keys
  const out = [];
  for (const [d, v] of entries) {
    const hit = out.find(([x]) => pyeq(x, v));
    if (hit) hit[1].push(d);
    else out.push([v, [d]]);
  }
  return out;
}
const refinesV = (a, b) => {
  const m = (v) => (typeof v === 'string' && /^\d{4}(-\d\d){0,2}[?~%]?$/.test(v) ? v.replace(/[?~%]+$/, '') : null);
  return m(a) !== null && m(b) !== null && m(a).length > m(b).length && m(a).startsWith(m(b));
};
const compatibleV = (a, b) => pyeq(a, b) || refinesV(a, b) || refinesV(b, a);
// Two or more documents joined, a document given twice counted once: agreement and addition asserted, real
// differences contested — one claim per distinct statement. Labels that only add to one another, and a date that only
// refines another ('2024-03' of '2024'), are kept and reported as refined, never contested.
function union(docs, config) {
  docs = [...new Map(docs.map((d) => [d.id, d])).values()];
  const joined = newJ();
  for (const nid of [...new Set(docs.flatMap((d) => [...d.nodes.keys()]))].sort()) {
    const sources = docs.filter((d) => d.nodes.has(nid)),
      labelsByDoc = sources.map((d) => [d.id, [...d.nodes.get(nid).labels].sort()]);
    const distinctL = [...new Map(labelsByDoc.map(([, docLabels]) => [docLabels.join(':'), docLabels])).values()];
    const sub = (a, b) => a.every((x) => b.includes(x));
    let labels;
    if (combos(distinctL).every(([a, b]) => sub(a, b) || sub(b, a))) {
      labels = new Set(labelsByDoc.flatMap(([, docLabels]) => docLabels));
      if (distinctL.length > 1)
        joined.report.push(['labels-refine', nid, 'labels', '', 'refined — one adds to the other', '—']);
    } else {
      labels = new Set(distinctL.reduce((a, b) => a.filter((x) => b.includes(x))));
      const by = new Map();
      for (const [d, docLabels] of labelsByDoc)
        (by.get(docLabels.join(':')) || by.set(docLabels.join(':'), [docLabels, []]).get(docLabels.join(':')))[1].push(
          d,
        );
      const ids = new Map(
        [...by].map(([k, [docLabels, ds]]) => {
          const extra = docLabels
            .filter((x) => !labels.has(x))
            .sort()
            .join(':');
          return [k, addClaim(joined, nid, 'label/' + extra, ds, [['subject', nid]], { claimed_label: extra })];
        }),
      );
      for (const [a, b] of combos([...by.keys()])) {
        const labelsA = by.get(a)[0],
          labelsB = by.get(b)[0];
        if (!(sub(labelsA, labelsB) || sub(labelsB, labelsA))) joined.pairs.push(sortedPair(ids.get(a), ids.get(b)));
      }
      joined.report.push([
        'identity',
        nid,
        'labels',
        '',
        'IDENTITY CONFLICT — contested',
        'check what it is — a register or the party itself',
      ]);
    }
    const props = {};
    for (const k of [...new Set(sources.flatMap((d) => Object.keys(d.nodes.get(nid).props)))].sort()) {
      const vals = sources.filter((d) => k in d.nodes.get(nid).props).map((d) => [d.id, d.nodes.get(nid).props[k]]);
      const distinct = groupBy(vals).map(([v]) => v);
      if (distinct.length === 1) {
        props[k] = distinct[0];
        joined.src.set(nid + '\u0000' + k, vals.map((x) => x[0]).sort());
        continue;
      }
      const best = distinct.filter((v) => distinct.every((w) => pyeq(v, w) || refinesV(v, w)));
      if (best.length) {
        props[k] = best[0];
        joined.src.set(
          nid + '\u0000' + k,
          vals
            .filter(([, v]) => pyeq(v, best[0]))
            .map((x) => x[0])
            .sort(),
        );
        joined.report.push(['refine', nid, k, '', 'refined — the more precise is kept', '—']);
        continue;
      }
      const by = groupBy(vals),
        ids = by.map(([v, ds]) =>
          addClaim(joined, nid, `${k}=${vtext(v)}`, ds, [['subject', nid]], {
            claimed_property: k,
            claimed_value: v,
          }),
        );
      combos(by.map((x, i) => i)).forEach(([a, b]) => {
        if (!compatibleV(by[a][0], by[b][0])) joined.pairs.push(sortedPair(ids[a], ids[b]));
      });
      joined.report.push(['value', nid, k, '', 'VALUE CONFLICT — contested', 'find evidence; a finding confirms one']);
    }
    joined.nodes.set(nid, { labels, props, stated_in: sources.map((d) => d.id).sort() });
  }
  const allKeys = new Map();
  for (const d of docs) for (const [ks, { key }] of d.edges) allKeys.set(ks, key);
  for (const [ks, key] of [...allKeys].sort(byKey(([k]) => k))) {
    const sources = docs.filter((d) => d.edges.has(ks)),
      p = {};
    for (const k of [...new Set(sources.flatMap((d) => Object.keys(d.edges.get(ks).props)))].sort()) {
      const vals = sources.filter((d) => k in d.edges.get(ks).props).map((d) => [d.id, d.edges.get(ks).props[k]]),
        by = groupBy(vals);
      if (by.length === 1) {
        p[k] = by[0][0];
        continue;
      }
      const ids = by.map(([v, ds]) =>
        addClaim(
          joined,
          key[0],
          `${key[1]}-${pystr(key[2])}/${identStr(key)}/${k}=${vtext(v)}`,
          ds,
          [
            ['subject', key[0]],
            ['object', key[2]],
          ],
          {
            claimed_relationship: key[1],
            claimed_property: k,
            claimed_value: v,
            edge_ident: identStr(key),
            _key: key,
          },
        ),
      );
      combos(ids).forEach(([a, b]) => joined.pairs.push(sortedPair(a, b)));
      joined.report.push([
        'attribute',
        key[0],
        `${key[1]} ${k}`,
        '',
        'ATTRIBUTE CONFLICT on a shared relationship — contested',
        'find evidence; a finding confirms one',
      ]);
    }
    joined.edges.set(ks, { key, props: p });
    joined.esrc.set(ks, sources.map((d) => d.id).sort());
  }
  return joined;
}

module.exports = { union };
