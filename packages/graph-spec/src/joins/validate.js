// §21 joins: a document validated — cycles, cardinality, constraints with their guards, and determinism.
'use strict';

const { byKey } = require('../values/order.js');
const { pyrepr, pystr, pyeq, keystr } = require('./python-text.js');

function guardHolds(g, ctx) {
  // guards as the spec writes them: comparisons joined by and / or / not
  const toks = g.match(/\s*(>=|<=|==|!=|=|<|>|\(|\)|[A-Za-z_]\w*|-?\d+(?:\.\d+)?)/g).map((t) => t.trim());
  let i = 0;
  const truthy = (v) => !(v === false || v === 0 || v === null || v === undefined || v === '');
  const atom = () => {
    const t = toks[i++];
    if (t === '(') {
      const v = or();
      i++;
      return v;
    }
    if (t === 'not') return !truthy(cmp());
    if (t === 'True' || t === 'true') return true;
    if (t === 'False' || t === 'false') return false;
    if (/^-?\d/.test(t)) return Number(t);
    if (!(t in ctx)) throw new Error(`name '${t}' is not defined`);
    return ctx[t];
  };
  const cmp = () => {
    let a = atom();
    while (['=', '==', '!=', '<', '>', '<=', '>='].includes(toks[i])) {
      const op = toks[i++],
        b = atom();
      a = {
        '=': pyeq(a, b),
        '==': pyeq(a, b),
        '!=': !pyeq(a, b),
        '<': a < b,
        '>': a > b,
        '<=': a <= b,
        '>=': a >= b,
      }[op];
    }
    return a;
  };
  const and = () => {
    let a = cmp();
    while (toks[i] === 'and') {
      i++;
      const b = cmp();
      a = truthy(a) ? b : a;
    }
    return a;
  };
  const or = () => {
    let a = and();
    while (toks[i] === 'or') {
      i++;
      const b = and();
      a = truthy(a) ? a : b;
    }
    return a;
  };
  return truthy(or());
}
function cycles(edges, types) {
  const found = new Map();
  for (const ty of types) {
    const ofType = [...edges.values()]
      .map((e) => e.key)
      .filter((k) => k[1] === ty)
      .sort(byKey(keystr));
    for (const e of ofType) {
      const stack = [[e[2], [e]]];
      while (stack.length) {
        const [node, path] = stack.pop();
        if (pyeq(node, e[0])) {
          const c = path.slice().sort(byKey(keystr));
          found.set(keystr(c), c);
          break;
        }
        for (const x of ofType)
          if (pyeq(x[0], node) && !path.some((p) => keystr(p) === keystr(x)) && path.length < ofType.length)
            stack.push([x[2], path.concat([x])]);
      }
    }
  }
  return [...found.entries()].sort(byKey(([k]) => k)).map(([, c]) => c);
}
// The breaches of the configured rules in a graph, each once: cycles, too many of a relationship, constraints and
// nondeterministic transitions, as {kind, why, edges, slots}, each kind only when checks names it. Determinism is
// checked only when the configuration gives guard cases. A GQL constraint with no named twin throws: no engine here.
function breaches(nodes, edges, config, checks) {
  let out = [];
  if (checks.includes('cycles'))
    out = out.concat(
      cycles(edges, config.acyclic).map((c) => ({ kind: 'cycle', why: 'a cycle', edges: c, slots: [] })),
    );
  if (checks.includes('cardinality'))
    for (const r of config.at_most_one) {
      const g = new Map();
      for (const { key: e } of edges.values())
        if (e[1] === r.type) {
          const a = r.side === 'in' ? e[2] : e[0],
            ak = keystr(a);
          (g.get(ak) || g.set(ak, [a, []]).get(ak))[1].push(e);
        }
      for (const [, [, es]] of [...g.entries()].sort(byKey(([k]) => k)))
        if (es.length > 1) out.push({ kind: 'too-many', why: r.rule, edges: es.sort(byKey(keystr)), slots: [] });
    }
  if (checks.includes('constraints'))
    for (const [name, fn] of config.constraints) {
      if (fn === null)
        throw new Error(`the constraint '${name}' is written in GQL with no named twin — it needs an engine`);
      out = out.concat(
        fn(nodes, edges).map((b) => ({ kind: 'constraint', why: name, edges: b.edges || [], slots: b.slots || [] })),
      );
    }
  if (checks.includes('determinism') && Object.keys(config.contexts).length) {
    const by = new Map();
    for (const { key: e, props: p } of edges.values())
      if (e[1] === 'TRANSITION') {
        const k = keystr([e[0], p.event ?? null]);
        (by.get(k) || by.set(k, [e[0], p.event ?? null, []]).get(k))[2].push(e);
      }
    const items = [...by.values()].sort(byKey(([s, ev, es]) => pyrepr([[s, ev], { __list: es }])));
    for (const [, ev, es] of items)
      for (const ctx of config.contexts[ev] || [{}]) {
        const propsOf = (e) => edges.get(keystr(e)).props;
        const plain = es
          .filter(
            (e) =>
              propsOf(e).guard !== undefined &&
              propsOf(e).guard !== null &&
              propsOf(e).guard !== 'else' &&
              guardHolds(propsOf(e).guard, ctx),
          )
          .concat(es.filter((e) => propsOf(e).guard === undefined || propsOf(e).guard === null));
        const en = plain.length ? plain : es.filter((e) => propsOf(e).guard === 'else');
        if (en.length > 1)
          out.push({
            kind: 'nondeterministic',
            why: `two transitions can fire on ${pystr(ev)} ${Object.keys(ctx).length ? pyrepr(ctx) : ''}`.trim(),
            edges: en.sort(byKey(keystr)),
            slots: [],
          });
      }
  }
  const seen = new Set(),
    uniq = [];
  for (const b of out) {
    const k = b.kind + '|' + keystr(b.edges) + '|' + keystr(b.slots);
    if (!seen.has(k)) {
      seen.add(k);
      uniq.push(b);
    }
  }
  return uniq;
}
// A document must keep the rules on its own: what breaks them is removed from it, in place, and logged — excluded,
// never joined.
function validate(doc, log, config, checks = ['cycles', 'cardinality', 'constraints', 'determinism']) {
  for (const b of breaches(doc.nodes, doc.edges, config, checks)) {
    for (const e of b.edges)
      if (doc.edges.has(keystr(e))) {
        doc.edges.delete(keystr(e));
        log.push([
          'invalid',
          e[0],
          e[1],
          '',
          `INVALID IN ONE DOCUMENT — ${b.why}; excluded`,
          'fix the source document',
        ]);
      }
    for (const [nid, k] of b.slots)
      if (doc.nodes.get(nid) && k in doc.nodes.get(nid).props) {
        delete doc.nodes.get(nid).props[k];
        log.push(['invalid', nid, k, '', `INVALID IN ONE DOCUMENT — ${b.why}; excluded`, 'fix the source document']);
      }
  }
}

module.exports = { breaches, validate };
