// §5 types: the spec's built-in vocabulary, and which nodes and relationships a graph's schema types.
'use strict';

// §5 types. The spec's own vocabulary is built in, because a page has no store to read it from; the spec's meta-schema
// declares it as data, and the spec's trace check proves this copy equals it.
// @3, 16 Oct 2026: W3C PROV is normative for provenance (§11, §12, §24): the agent types, and USED, HAD_PLAN and
// WAS_ATTRIBUTED_TO. A Model is acceptable wherever a SoftwareAgent is, but is a type a graph declares for itself.
// the spec's own schema, by name and version: @3 is the PROV change above
const SPEC_SCHEMA = 'graph-spec@3';
// the schema's own node types, left out of views
const SPEC_SCHEMA_NODES = ['GraphMeta', 'ElementType', 'Meta', 'Cardinality', 'Coverage'];
// W3C PROV's agent types (§11, §24): what an attribution may go to
const SPEC_AGENTS = ['Person', 'Organization', 'SoftwareAgent'];
// every node type built in: the schema's own and the agents
const SPEC_NODES = [...SPEC_SCHEMA_NODES, ...SPEC_AGENTS];
// marks a schema node; never types a node by itself
const SPEC_MARKERS = ['Meta'];
// the relationship types built in: the schema's DECLARES, and PROV's USED, HAD_PLAN and WAS_ATTRIBUTED_TO
const SPEC_EDGES = ['DECLARES', 'USED', 'HAD_PLAN', 'WAS_ATTRIBUTED_TO'];
// §5: an ElementType types only when the graph's GraphMeta DECLARES it
const declaredIn = (graph) =>
  graph
    .labelled('ElementType')
    .filter((i) => graph.inc(i, 'DECLARES').some((e) => graph.has(e[0], 'GraphMeta')))
    .map((i) => graph.p(i));
// §5: [node types, edge types, edge types declared without both readings] — from the graph's own schema, else the
// shared one given — with the spec's built-in vocabulary unless builtin is false. A marker is taken out of the node
// types, so a node labelled only with a marker is untyped.
function types(g, shared, builtin = true) {
  // a graph's own schema, where it has one, or the shared one it names
  const elementTypes = g.labelled('ElementType').length ? declaredIn(g) : shared ? declaredIn(shared) : [];
  const nodes = new Set([
    ...elementTypes.filter((t) => t.kind === 'node').map((t) => t.name),
    ...(builtin ? SPEC_NODES : []),
  ]);
  const markers = new Set([
    ...elementTypes.filter((t) => t.kind === 'node' && t.marker === true).map((t) => t.name),
    ...(builtin ? SPEC_MARKERS : []),
  ]);
  markers.forEach((m) => nodes.delete(m)); // a marker never types a node by itself
  return [
    nodes,
    new Set([...elementTypes.filter((t) => t.kind === 'edge').map((t) => t.name), ...(builtin ? SPEC_EDGES : [])]),
    elementTypes.filter((t) => t.kind === 'edge' && !(t.reverse_name && t.reading)),
  ];
}
// §5: whether every node has a declared type, every relationship type is declared, and every declared edge type has
// both readings — the words a view reads it by in each direction.
function typed(g, shared, builtin = true) {
  const [nodes, edges, unrev] = types(g, shared, builtin);
  return (
    !unrev.length &&
    [...g.nodes.values()].every(([labels]) => [...labels].some((x) => nodes.has(x))) &&
    g.edges.every((e) => edges.has(e[1]))
  );
}
// What §5 would refuse, each sorted: node labels used on a node with no declared type, relationship types used but not
// declared, and edge types declared without both readings. typed() says whether; this says what, for the message.
function untyped(g, shared, builtin = true) {
  const [nodes, edges, unrev] = types(g, shared, builtin);
  const labels = new Set();
  for (const [own] of g.nodes.values()) if (![...own].some((x) => nodes.has(x))) own.forEach((x) => labels.add(x));
  return [
    [...labels].sort(),
    [...new Set(g.edges.map((e) => e[1]).filter((t) => !edges.has(t)))].sort(),
    unrev.map((t) => t.name).sort(),
  ];
}

module.exports = {
  SPEC_SCHEMA,
  SPEC_SCHEMA_NODES,
  SPEC_AGENTS,
  SPEC_NODES,
  SPEC_MARKERS,
  SPEC_EDGES,
  types,
  typed,
  untyped,
};
