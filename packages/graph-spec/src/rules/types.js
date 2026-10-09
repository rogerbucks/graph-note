// §5 types: the spec's built-in vocabulary, and which nodes and relationships a graph's schema types.
'use strict';

// §5 types. The spec's own vocabulary is built in, because a page has no store to read it from; the spec's meta-schema
// declares it as data, and the spec's trace check proves this copy equals it.
const SPEC_SCHEMA = 'graph-spec@2',
  SPEC_NODES = ['GraphMeta', 'ElementType', 'Meta', 'Cardinality', 'Coverage'],
  SPEC_MARKERS = ['Meta'],
  SPEC_EDGES = ['DECLARES'];
// §5: an ElementType types only when the graph's GraphMeta DECLARES it
const declaredIn = (graph) =>
  graph
    .labelled('ElementType')
    .filter((i) => graph.inc(i, 'DECLARES').some((e) => graph.has(e[0], 'GraphMeta')))
    .map((i) => graph.p(i));
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
function typed(g, shared, builtin = true) {
  const [nodes, edges, unrev] = types(g, shared, builtin);
  return (
    !unrev.length &&
    [...g.nodes.values()].every(([labels]) => [...labels].some((x) => nodes.has(x))) &&
    g.edges.every((e) => edges.has(e[1]))
  );
}
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

module.exports = { SPEC_SCHEMA, SPEC_NODES, SPEC_MARKERS, SPEC_EDGES, types, typed, untyped };
