// The store blocks are read into, graph by graph, and read(): the blocks of a document into one store.
'use strict';

const { ProfileError } = require('./profile-error.js');
const { header, tokens } = require('./tokens.js');
const { Parser } = require('./parser.js');
const { S, N, trim } = require('./whitespace.js');

const SHARED = new RegExp(`·${S}*SCHEMA${S}+(${N}+)`),
  NAMES_SHARED = new RegExp(`·${S}*schema${S}+(${N}+)`);

class Store {
  constructor() {
    this.graphs = {};
    this.k = 0;
    this.schemas = {};
    this.named = {};
    this.commas = [];
    // bares: [{graph, line, written, type}] where a type written without its colon was read as the graph's one type
    // of that name, ignoring case (§3)
    this.bares = [];
  } // commas: [{graph, line}] where a missing comma was read in (§3)   // schema name -> its graph; data graph -> the schema its header names
  /** The relationship types graph g knows so far: written with their colon, declared by an ElementType, or in the
   * shared schema it names. */
  edgeTypes(g) {
    const out = new Set();
    const names = [g, ...(this.named[g] in this.schemas ? [this.schemas[this.named[g]]] : [])];
    for (const name of names) {
      const stored = this.graph(name);
      for (const e of stored.edges) out.add(e[1]);
      for (const n of stored.nodes.values())
        if (n.labels.has('ElementType') && n.props.kind === 'edge' && typeof n.props.name === 'string')
          out.add(n.props.name);
    }
    return out;
  }
  /** A bare type read as the graph's one type of that name, ignoring case — or refused. */
  resolve(g, r) {
    const written = r.type;
    const found = [...this.edgeTypes(g)].filter((t) => t.toLowerCase() === written.toLowerCase()).sort();
    if (!found.length)
      throw new ProfileError(
        r.line,
        `[${written}] has no colon, and graph ${g} has no relationship type called ${written}`,
        `a relationship type is written with its colon: [:${written.toUpperCase()}]`,
      );
    if (found.length > 1)
      throw new ProfileError(
        r.line,
        `[${written}] has no colon, and graph ${g} has relationship types ${found.slice(0, -1).join(', ')} and ${found.at(-1)}, which differ only by case`,
        `write the one meant with its colon, such as [:${found[0]}]`,
      );
    this.bares.push({ graph: g, line: r.line, written, type: found[0] });
    return found[0];
  }
  graph(g) {
    return this.graphs[g] || (this.graphs[g] = { nodes: new Map(), edges: [] });
  }
  find(g, id) {
    for (const [k, n] of this.graph(g).nodes) if (n.props.id === id) return k;
    return null;
  }
  /** Applies a data block whole, or not at all: a block that cannot be read leaves the store as it was, however far
   * its reading got (req:3.engine-gets-corrected). */
  apply(block) {
    const copy = (graph) => ({
      nodes: new Map([...graph.nodes].map(([k, n]) => [k, { labels: new Set(n.labels), props: { ...n.props } }])),
      edges: graph.edges.slice(),
    });
    const kept = {
      graphs: Object.fromEntries(Object.entries(this.graphs).map(([g, graph]) => [g, copy(graph)])),
      k: this.k,
      schemas: { ...this.schemas },
      named: { ...this.named },
      commas: this.commas.slice(),
      bares: this.bares.slice(),
    };
    try {
      return this.applyWhole(block);
    } catch (e) {
      Object.assign(this, kept);
      throw e;
    }
  }

  applyWhole(block) {
    let [g, kind] = header(block);
    if (kind === 'query')
      throw new ProfileError(1, 'this is a query block', 'queries ask questions of a graph; they are not data');
    if (kind === 'excerpt')
      throw new ProfileError(1, 'this is an excerpt', 'an excerpt illustrates part of a graph; it is not data');
    const first = block.split('\n').find((line) => trim(line)) || '';
    if (kind === 'schema') {
      const name = SHARED.exec(first)[1];
      g = 'schema ' + name;
      this.schemas[name] = g;
      delete this.graphs[g];
    } // a shared schema (§5), kept apart under its own name
    else {
      const sm = NAMES_SHARED.exec(first);
      if (sm) this.named[g] = sm[1];
    }
    const toks = tokens(block);
    if (!toks.length) return g;
    const parser = new Parser(toks),
      [matches, paths, sets] = parser.statement();
    for (const line of parser.commas) this.commas.push({ graph: g, line });
    const graph = this.graph(g),
      bound = {};
    // each id's node, the first in order, as find() gives it: indexed once for the block, not searched for each thing,
    // so a block of thousands of things is read in time linear in them (editor spec §9: never freeze)
    let ids = null;
    const found = (id) => {
      if (!ids) {
        ids = new Map();
        for (const [k, n] of graph.nodes) if (!ids.has(n.props.id)) ids.set(n.props.id, k);
      }
      return ids.has(id) ? ids.get(id) : null;
    };
    for (const m of matches) {
      const keys = Object.keys(m.props);
      if (keys.length !== 1 || keys[0] !== 'id')
        throw new ProfileError(m.line, 'MATCH must find a node by its id alone', "write MATCH (v:Label {id: '…'})");
      const k = found(m.props.id);
      if (k === null || !m.labels.every((label) => graph.nodes.get(k).labels.has(label)))
        throw new ProfileError(
          m.line,
          `MATCH finds no ${m.labels.join(':')} with id '${m.props.id}' in graph ${g}`,
          'the node must be written earlier — in this document or one loaded before it',
        );
      bound[m.v] = k;
    }
    const writes = (n) => n.labels.length || Object.keys(n.props).length;
    for (const [nodes, rels] of paths) {
      // left to right, as Grafeo binds them: a name is reused only once its node is written — earlier in the block, earlier in this path, or found by MATCH (§3)
      for (const n of nodes) {
        if (writes(n)) {
          if (n.v in bound)
            throw new ProfileError(n.line, `${n.v} is written twice`, 'give each new node its own variable');
          if (!('id' in n.props)) n.props = Object.assign({ id: n.v }, n.props); // a thing's name is its id (§3, 6 Oct 2026)
          if (found(n.props.id) !== null)
            throw new ProfileError(
              n.line,
              `id '${n.props.id}' is already a node in graph ${g}`,
              'an id names one node (§10) — MATCH it to add to it, or supersede it (§12)',
            );
          const k = 'n' + ++this.k;
          graph.nodes.set(k, { labels: new Set(n.labels), props: Object.assign({}, n.props) });
          if (ids && !ids.has(n.props.id)) ids.set(n.props.id, k);
          bound[n.v] = k;
        } else if (!(n.v in bound)) {
          const later = paths.some(([ns]) => ns.some((m) => m.v === n.v && writes(m)));
          if (later)
            throw new ProfileError(
              n.line,
              `${n.v} is used before it is written`,
              'write the node before any relationship that uses it — GQL binds a name only once its node is written (§3)',
            );
          const k = found(n.v); // a bare name not written in this block names the existing node with that id (§3)
          if (k === null)
            throw new ProfileError(
              n.line,
              `no thing called ${n.v} in graph ${g}`,
              `check the spelling — or write it here with its kind: (${n.v}:Kind {…})`,
            );
          bound[n.v] = k;
        }
      }
      rels.forEach((r, i) =>
        graph.edges.push([
          bound[nodes[i].v],
          r.bare ? this.resolve(g, r) : r.type,
          bound[nodes[i + 1].v],
          Object.assign({}, r.props),
        ]),
      );
    }
    for (const [v, key, val, n] of sets) {
      if (!(v in bound) && found(v) !== null) bound[v] = found(v); // SET name.key names the node with that id (§3)
      if (!(v in bound))
        throw new ProfileError(
          n,
          `SET names ${v}, which is no thing in graph ${g}`,
          'check the spelling — SET names a thing by its id',
        );
      graph.nodes.get(bound[v]).props[key] = val;
      if (key === 'id') ids = null; // an id set anew: indexed again when next asked
    }
    return g;
  }
}
function read(blocks) {
  const s = new Store();
  blocks.forEach((b) => s.apply(b));
  return s;
}

module.exports = { Store, read };
