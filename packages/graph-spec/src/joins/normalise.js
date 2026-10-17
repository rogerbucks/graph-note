// §21 joins: a document's block read for joining, and normalised under the join's configuration.
'use strict';

const { GTime } = require('../values/times.js');
const { Store } = require('../reader/store.js');
const { pyeq, pyround, keystr } = require('./python-text.js');

// A document's block read for joining: the id, schema, as-of date and revision its header names, its nodes by id
// (labels, and a copy of the properties) and its relationships as [from id, type, to id, properties]. normalise keys
// them.
function parseDoc(block) {
  const m = /document (\S+) · schema (\S+) · as of (\d{4}-\d\d-\d\d)(?: · revision of (\S+))?/.exec(block);
  const st = new Store(),
    g = st.apply(block),
    stored = st.graph(g),
    byk = new Map([...stored.nodes].map(([k, n]) => [k, n.props.id]));
  const nodes = new Map(
    [...stored.nodes.values()].map((n) => [
      n.props.id,
      { labels: new Set(n.labels), props: Object.assign({}, n.props) },
    ]),
  );
  return {
    id: m[1],
    schema: m[2],
    as_of: new GTime('date', m[3]),
    revision_of: m[4] || null,
    nodes,
    raw_edges: stored.edges.map(([a, t, b, p]) => [byk.get(a), t, byk.get(b), Object.assign({}, p)]),
  };
}
function edgesMap(list) {
  const m = new Map();
  for (const [k, p] of list) m.set(keystr(k), { key: k, props: p });
  return m;
}
const ekey = (f, ty, t, p, config) => [
  f,
  ty,
  t,
  (config.edge_keys[ty] || []).map((a) => (p[a] === undefined ? null : p[a])),
];
// Every property a document states, as a Map from node id and key (joined by NUL) to value: the base's, so normalise
// can tell a value copied unchanged from it.
function rawProps(doc) {
  const o = new Map();
  for (const [nid, n] of doc.nodes) for (const [k, v] of Object.entries(n.props)) o.set(nid + '\u0000' + k, v);
  return o;
}
// Restates apparent differences before comparing, in place, logging each: ids by the id map, units by the unit maps
// (rounded as Python rounds), timed properties as relationships, values by the vocabulary maps; then keys each
// relationship. A value copied unchanged from the earlier version keeps that version's date.
function normalise(doc, log, config, base) {
  for (const [old, nu] of Object.entries(config.id_map))
    if (doc.nodes.has(old)) {
      const n = doc.nodes.get(old);
      doc.nodes.delete(old);
      n.props.id = nu;
      doc.nodes.set(nu, n);
      log.push(['id', old, 'id', '', 'identity restated', 'a declared id map: one thing under two ids']);
    }
  doc.raw_edges = doc.raw_edges.map(([f, ty, t, p]) => [config.id_map[f] ?? f, ty, config.id_map[t] ?? t, p]);
  for (const [nid, n] of doc.nodes) {
    for (const [k, [k2, factor]] of Object.entries(config.maps[doc.schema] || {}))
      if (k in n.props) {
        const v = n.props[k];
        delete n.props[k];
        n.props[k2] = pyround(v * factor);
        log.push(['unit', nid, k2, '', 'unit restated', '—']);
      }
    for (const [k, ty] of Object.entries(config.time))
      if (k in n.props) {
        const v = n.props[k];
        delete n.props[k];
        const asOf =
          base && base._raw && base._raw.has(nid + '\u0000' + k) && pyeq(base._raw.get(nid + '\u0000' + k), v)
            ? base.as_of
            : doc.as_of;
        doc.raw_edges.push([nid, ty, v, { as_of: asOf }]);
        log.push(['time', nid, ty, '', 'restated over time', '—']);
      }
  }
  doc.raw_edges.forEach(([f, ty, t, p], i) => {
    for (const vm of config.value_maps)
      if (
        ty === vm.type &&
        p[vm.attribute] !== undefined &&
        Object.prototype.hasOwnProperty.call(vm.map, p[vm.attribute])
      ) {
        const old = p[vm.attribute];
        p = Object.assign({}, p, { [vm.attribute]: vm.map[old] });
        doc.raw_edges[i] = [f, ty, t, p];
        log.push(['vocab', f, `${ty} ${vm.attribute}`, '', 'restated — a declared vocabulary map', '—']);
      }
  });
  doc.edges = edgesMap(doc.raw_edges.map(([f, ty, t, p]) => [ekey(f, ty, t, p, config), p]));
  return doc;
}

module.exports = { parseDoc, rawProps, normalise };
