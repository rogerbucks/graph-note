// The plain graph the rules run on (graph_rules.py), the world made from a store, and a graph's canonical hash.
'use strict';

const { cnorm } = require('../values/times.js');
const { byKey } = require('../values/order.js');
const { sha256hex } = require('../hashing/sha256.js');
const { jcs } = require('../hashing/canonical-json.js');

// ── the plain graph (graph_rules.py) ────────────────────────────────────────────────────────────
class Graph {
  constructor(nodes, edges) {
    this.nodes = nodes;
    this.edges = edges;
    this._out = new Map();
    this._in = new Map(); // nodes: Map id -> [Set labels, props]
    for (const e of edges) {
      (this._out.get(e[0]) || this._out.set(e[0], []).get(e[0])).push(e);
      (this._in.get(e[2]) || this._in.set(e[2], []).get(e[2])).push(e);
    }
  }
  labelled(label) {
    const o = [];
    for (const [i, [labels]] of this.nodes) if (labels.has(label)) o.push(i);
    return o;
  }
  p(i) {
    return this.nodes.has(i) ? this.nodes.get(i)[1] : {};
  }
  has(i, label) {
    return this.nodes.has(i) && this.nodes.get(i)[0].has(label);
  }
  out(i, t) {
    return (this._out.get(i) || []).filter((e) => t === undefined || e[1] === t);
  }
  inc(i, t) {
    return (this._in.get(i) || []).filter((e) => t === undefined || e[1] === t);
  }
}
/** The world of a store: each graph by its name, in a table holding nothing but its graphs, so a graph called
 * `constructor` or `toString` is found as any other, and a name no graph has finds nothing. */
function worldFromStore(store) {
  const out = Object.create(null);
  for (const [g, stored] of Object.entries(store.graphs)) {
    const byk = new Map([...stored.nodes].map(([k, n]) => [k, n.props.id]));
    out[g] = new Graph(
      new Map([...stored.nodes.values()].map((n) => [n.props.id, [new Set(n.labels), Object.assign({}, n.props)]])),
      stored.edges.map(([s, t, d, p]) => [byk.get(s), t, byk.get(d), Object.assign({}, p)]),
    );
  }
  const schemas = Object.create(null); // shared schemas (§5) travel with the world but are not graphs in it — kept out of every listing
  for (const [name, g] of Object.entries(store.schemas || {}))
    if (g in out) {
      schemas[name] = out[g];
      delete out[g];
    }
  Object.defineProperty(out, '__schemas', { value: schemas, enumerable: false });
  Object.defineProperty(out, '__named', {
    value: Object.assign(Object.create(null), store.named || {}),
    enumerable: false,
  });
  return out;
}
/** Graph g's shared schema (§5): the name its header gives, and the schema of that name; undefined for each it lacks. */
const schemaFor = (w, g) => {
  const own = (table, key) => (table && Object.hasOwn(table, key) ? table[key] : undefined);
  const name = own(w.__named, g);
  return [name, name ? own(w.__schemas, name) : undefined];
};
/** sha-256 of the RFC 8785 JSON of the graph: nodes by id, relationships by their own canonical text, a null
 * property left out and an instant with its +00:00, so the hash is the same in every language. */
function canon(g) {
  const pr = (p) => {
    const o = {};
    for (const [k, v] of Object.entries(p)) if (v !== null && v !== undefined) o[k] = cnorm(v);
    return o;
  };
  const nodes = [...g.nodes.values()].map(([labels, p]) => [[...labels].sort(), pr(p)]).sort(byKey((x) => x[1].id));
  const edges = g.edges.map(([s, t, d, p]) => [s, t, d, pr(p)]).sort(byKey(jcs));
  return sha256hex(jcs(nodes.concat(edges)));
}

module.exports = { Graph, worldFromStore, schemaFor, canon };
