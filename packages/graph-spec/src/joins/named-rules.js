// §21 joins: the named rules a configuration refers to (graph_spec.py RULES), checked with no engine.
'use strict';

const { byKey } = require('../values/order.js');
const { pystr, keystr } = require('./python-text.js');

// the named rules a configuration refers to (graph_spec.py RULES) — what checks constraints with no engine
const nodeP = (nodes, id) => (nodes.get(id) || { props: {} }).props;
function flowParents(nodes, edges) {
  const m = new Map();
  for (const { key: k } of edges.values())
    if (k[1] === 'DETAILED_IN' && nodes.has(k[2])) m.set(nodeP(nodes, k[2]).flow, k[0]);
  return m;
}
function ancestors(state, nodes, edges) {
  const par = flowParents(nodes, edges),
    out = [];
  let f = nodeP(nodes, state).flow;
  while (par.has(f) && !out.includes(par.get(f)) && par.get(f) !== state) {
    out.push(par.get(f));
    f = nodeP(nodes, par.get(f)).flow;
  }
  return out;
}
function elseOver(nodes, edges, above) {
  const out = [];
  for (const { key: k, props: p } of edges.values())
    if (k[1] === 'TRANSITION' && p.guard === 'else') {
      const ab = above(k[0]),
        pe = [...edges.values()]
          .filter(({ key: e, props: q }) => ab.includes(e[0]) && e[1] === 'TRANSITION' && q.event === p.event)
          .map((e) => e.key);
      if (pe.length) out.push({ edges: [k].concat(pe.sort(byKey(keystr))) });
    }
  return out;
}
// Each named rule, by name, as (nodes, edges) -> its breaches {slots, edges}: what a configuration's constraints
// name. A constraint written in GQL runs as the rule its reference names, so a join checks constraints with no engine.
const RULES = {
  'repaid-after-drawn': (nodes, edges) =>
    [...edges.values()]
      .filter(
        ({ key: k }) =>
          k[1] === 'REPAYS' &&
          'at' in nodeP(nodes, k[0]) &&
          'drawn_at' in nodeP(nodes, k[2]) &&
          nodeP(nodes, k[0]).at < nodeP(nodes, k[2]).drawn_at,
      )
      .map(({ key: k }) => ({
        slots: [
          [k[0], 'at'],
          [k[2], 'drawn_at'],
        ],
      })),
  'one-start': (nodes) => {
    const by = new Map();
    for (const [nid, n] of nodes)
      if (n.props.initial) {
        const f = keystr(n.props.flow ?? null);
        (by.get(f) || by.set(f, []).get(f)).push(nid);
      }
    return [...by.values()]
      .filter((xs) => xs.length > 1)
      .map((xs) => ({
        slots: xs
          .slice()
          .sort()
          .map((x) => [x, 'initial']),
      }));
  },
  'final-is-final': (nodes, edges) =>
    [...edges.values()]
      .filter(({ key: k }) => k[1] === 'TRANSITION' && nodeP(nodes, k[0]).final)
      .map(({ key: k }) => ({ slots: [[k[0], 'final']], edges: [k] })),
  'else-over-ancestor': (nodes, edges) => elseOver(nodes, edges, (s) => ancestors(s, nodes, edges)),
  'else-over-parent': (nodes, edges) => {
    const par = flowParents(nodes, edges);
    return elseOver(nodes, edges, (s) => (par.has(nodeP(nodes, s).flow) ? [par.get(nodeP(nodes, s).flow)] : []));
  },
  'subflow-needs-done': (nodes, edges) => {
    const out = [];
    for (const [fl, p] of flowParents(nodes, edges)) {
      const ends = [...edges.values()]
        .filter(({ key: k }) => k[1] === 'TRANSITION' && nodeP(nodes, k[2]).flow === fl && nodeP(nodes, k[2]).final)
        .map((e) => e.key);
      if (ends.length && ![...edges.values()].some(({ key: k, props }) => k[0] === p && props.event === 'done'))
        out.push({ edges: ends });
    }
    return out;
  },
  'subflow-nesting-acyclic': (nodes, edges) => {
    const into = new Map();
    for (const { key: k } of edges.values())
      if (k[1] === 'DETAILED_IN' && nodes.has(k[0]) && nodes.has(k[2])) {
        const a = nodeP(nodes, k[0]).flow,
          b = nodeP(nodes, k[2]).flow;
        (into.get(a) || into.set(a, new Set()).get(a)).add(b);
      }
    let loop = null;
    outer: for (const start of [...into.keys()].sort(byKey((x) => pystr(x)))) {
      const stack = [[start, [start]]];
      while (stack.length) {
        const [f, path] = stack.pop();
        for (const g of [...(into.get(f) || [])].sort(byKey((x) => pystr(x)))) {
          if (g === start) {
            loop = path.concat([g]);
            break outer;
          }
          if (!path.includes(g)) stack.push([g, path.concat([g])]);
        }
      }
    }
    if (!loop) return [];
    const pairs = new Set(loop.slice(0, -1).map((a, i) => a + '\u0000' + loop[i + 1]));
    return [
      {
        edges: [...edges.values()]
          .map((e) => e.key)
          .filter(
            (k) =>
              k[1] === 'DETAILED_IN' &&
              nodes.has(k[0]) &&
              nodes.has(k[2]) &&
              pairs.has(nodeP(nodes, k[0]).flow + '\u0000' + nodeP(nodes, k[2]).flow),
          )
          .sort(byKey(keystr)),
      },
    ];
  },
};

module.exports = { RULES };
