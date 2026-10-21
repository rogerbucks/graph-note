// §18 the flat projection, and the check that it reads back through the reader to the same graph.
'use strict';

const { isTime } = require('../values/times.js');
const { byKey } = require('../values/order.js');
const { jcs } = require('../hashing/canonical-json.js');
const { Store } = require('../reader/store.js');
const { quote } = require('../reader/tokens.js');
const { worldFromStore, canon } = require('../graph/graph.js');

// §18 the flat projection, rebuilt through the reader
const p2 = (x) => String(x).padStart(2, '0');
function iso(v) {
  // as projected: an instant at UTC+10 (no daylight saving), a day as itself
  if (!isTime(v)) return v;
  if (v.kind === 'date') return v.s;
  const [d, t] = v.s.split('T'),
    [hh, mm, ssf] = t.split(':'),
    [ss, frac] = ssf.split('.');
  const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +hh + 10, +mm, +ss));
  return (
    `${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())}T${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}:${p2(x.getUTCSeconds())}` +
    (frac ? '.' + frac : '') +
    '+10:00'
  );
}
// A key set as the object's own, even `__proto__`, so a name in a graph never changes an object's prototype.
const put = (o, k, v) =>
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
// §18 the flat projection: [blocks, rels].
// - blocks: one per node. Each has id, type (its labels) and attributes. It also has a list of targets per
//   relationship type without properties, keyed by the type in lower case.
// - rels: the relationships with properties, ordered by canonical text. Throws `refused: §18` for a list or a `type`
//   property, which it cannot hold.
function project(g) {
  const blocks = {},
    rels = [];
  for (const i of [...g.nodes.keys()].sort()) {
    const [labels, p] = g.nodes.get(i);
    const b = { id: i, type: [...labels].sort() };
    for (const k of Object.keys(p).sort()) {
      if (Array.isArray(p[k])) throw new Error(`refused: §18 — ${i}.${k} is a list`);
      if (k === 'type')
        throw new Error(
          `refused: §18 — ${i}.type is reserved: the flat projection uses type for a node's labels; rename the property`,
        );
      if (k !== 'id' && p[k] !== null && p[k] !== undefined) put(b, k, iso(p[k]));
    }
    put(blocks, i, b);
  }
  for (const [s, t, d, p] of g.edges) {
    if (Object.keys(p).length) {
      const r = { from: s, relationship: t, to: d };
      for (const k of Object.keys(p).sort()) if (p[k] !== null) put(r, k, iso(p[k]));
      rels.push(r);
      continue;
    }
    const key = t.toLowerCase();
    if (Object.hasOwn(blocks[s], key)) blocks[s][key].push(d);
    else put(blocks[s], key, [d]);
  }
  for (const b of Object.values(blocks))
    for (const [k, v] of Object.entries(b)) if (Array.isArray(v) && k !== 'type') v.sort();
  return [blocks, rels.sort(byKey(jcs))]; // by canonical text, as graph_rules.py orders them
}
function gqlValue(v) {
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT[\d:]+[+-]\d\d:\d\d$/.test(v)) return `DATETIME '${v}'`;
  if (typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v)) return `DATE '${v}'`;
  return quote(String(v));
}
// GQL from the projection alone — a profile data block for graph `name` — so the reader, not this code, decides what
// the projection means. Nodes get fresh variables n0, n1, …; a value that looks like a date or instant is read as one.
function rebuild(name, blocks, rels) {
  const keys = [
    ...new Set(
      Object.values(blocks).flatMap((b) =>
        Object.entries(b)
          .filter(([k, v]) => Array.isArray(v) && k !== 'type')
          .map(([k]) => k),
      ),
    ),
  ].sort();
  const v = {};
  Object.keys(blocks).forEach((i, k) => {
    v[i] = 'n' + k;
  });
  const lines = [];
  for (const [i, b] of Object.entries(blocks))
    lines.push(
      ` (${v[i]}:${b.type.join(':')} {` +
        Object.entries(b)
          .filter(([k, x]) => k !== 'type' && !(keys.includes(k) && Array.isArray(x)))
          .map(([k, x]) => `${k}: ${gqlValue(x)}`)
          .join(', ') +
        '})',
    );
  for (const [i, b] of Object.entries(blocks))
    for (const k of keys)
      for (const t of Array.isArray(b[k]) ? b[k] : []) lines.push(` (${v[i]})-[:${k.toUpperCase()}]->(${v[t]})`);
  for (const e of rels) {
    const pr = Object.entries(e)
      .filter(([k]) => !['from', 'relationship', 'to'].includes(k))
      .map(([k, x]) => `${k}: ${gqlValue(x)}`)
      .join(', ');
    lines.push(` (${v[e.from]})-[:${e.relationship}` + (pr ? ` {${pr}}` : '') + `]->(${v[e.to]})`);
  }
  return `// graph: ${name}\nINSERT\n` + lines.join(',\n');
}
// §18: whether the flat projection, held as text (through JSON) and rebuilt by the profile reader, gives back the same
// graph. Throws project()'s refusal; check() counts that as a failure.
function projectsBack(g, name) {
  if (!g.nodes.size && !g.edges.length) return true; // nothing to project
  let [blocks, rels] = project(g);
  blocks = JSON.parse(JSON.stringify(blocks));
  rels = JSON.parse(JSON.stringify(rels));
  const s = new Store();
  s.apply(rebuild(name, blocks, rels));
  return canon(worldFromStore(s)[name]) === canon(g);
}

module.exports = { project, rebuild, projectsBack };
