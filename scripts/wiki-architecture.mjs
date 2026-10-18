// The architecture of ThoughtKnot as a graph note (spec §41, developer_wiki). requirements/architecture.gql is read
// into its layers, parts and interfaces. It is checked against the repository and the requirements, and drawn as
// ThoughtKnot draws a graph. scripts/wiki-developers.mjs puts it on the developer pages.
import { createRequire } from 'node:module';

const { read } = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');

/** The architecture graph: {layers, parts, interfaces}, each part with its layer, offers and implements. */
export function readArchitecture(text) {
  const store = read([text]);
  const graph = store.graph(Object.keys(store.graphs)[0]);
  const of = (label) => new Map([...graph.nodes].filter(([, n]) => n.labels.has(label)));
  const words = (v) =>
    String(v ?? '')
      .split(/\s+/)
      .filter(Boolean);
  const layers = new Map(
    [...of('Layer')].map(([k, n]) => [
      k,
      {
        id: n.props.id,
        order: Number(n.props.order),
        name: String(n.props.name),
        does: String(n.props.does ?? ''),
        uses: [],
      },
    ]),
  );
  const parts = new Map(
    [...of('Part')].map(([k, n]) => [
      k,
      {
        id: n.props.id,
        name: String(n.props.name),
        path: n.props.path === undefined ? undefined : String(n.props.path),
        guide: n.props.guide === undefined ? undefined : String(n.props.guide),
        requirement: n.props.requirement === undefined ? undefined : String(n.props.requirement),
        layer: undefined,
        offers: [],
        implements: [],
      },
    ]),
  );
  const interfaces = new Map(
    [...of('Interface')].map(([k, n]) => [
      k,
      {
        id: n.props.id,
        name: String(n.props.name),
        file: n.props.file === undefined ? undefined : String(n.props.file),
        contract: n.props.contract === undefined ? undefined : String(n.props.contract),
        page: n.props.page === undefined ? undefined : String(n.props.page),
        requirements: words(n.props.requirements),
      },
    ]),
  );
  for (const [from, type, to] of graph.edges) {
    if (type === 'USES' && layers.has(from) && layers.has(to)) layers.get(from).uses.push(layers.get(to).id);
    if (type === 'IN_LAYER' && parts.has(from) && layers.has(to)) parts.get(from).layer = layers.get(to).id;
    if (type === 'OFFERS' && parts.has(from) && interfaces.has(to)) parts.get(from).offers.push(interfaces.get(to).id);
    if (type === 'IMPLEMENTS' && parts.has(from) && interfaces.has(to))
      parts.get(from).implements.push(interfaces.get(to).id);
  }
  return {
    layers: [...layers.values()].sort((a, b) => a.order - b.order),
    parts: [...parts.values()],
    interfaces: [...interfaces.values()],
  };
}

/**
 * Each fault of the architecture graph, as a line naming the thing. A fault is one of these:
 * - a path or file that is not there (`exists(path)` says);
 * - a requirement that is not in the requirements;
 * - a part in no layer, or a part neither built nor planned;
 * - a layer using one above it.
 */
export function architectureProblems(arch, requirements, exists) {
  const known = new Set(requirements.map((r) => r.id));
  const order = new Map(arch.layers.map((l) => [l.id, l.order]));
  const problems = [];
  for (const l of arch.layers)
    for (const u of l.uses)
      if (order.get(u) <= l.order) problems.push(`${l.id}: a layer uses only layers below it, not ${u}`);
  for (const p of arch.parts) {
    if (!p.layer) problems.push(`${p.id}: the part is in no layer: link it to one with IN_LAYER`);
    if (!p.path && !p.requirement) problems.push(`${p.id}: give the part a path, or the requirement that plans it`);
    for (const path of [p.path, p.guide])
      if (path && !exists(path)) problems.push(`${p.id}: no ${path} in the repository`);
    if (p.requirement && !known.has(p.requirement)) problems.push(`${p.id}: no requirement ${p.requirement}`);
  }
  for (const i of arch.interfaces) {
    for (const path of [i.file, i.contract])
      if (path && !exists(path)) problems.push(`${i.id}: no ${path} in the repository`);
    for (const id of i.requirements) if (!known.has(id)) problems.push(`${i.id}: no requirement ${id}`);
  }
  return problems;
}

/** A label as Mermaid reads it inside quotes: no quote, and no bracket it could take for syntax. */
export const label = (text) => String(text).replace(/"/g, "'").replace(/[<>]/g, '');

/**
 * The architecture drawn as ThoughtKnot draws a graph. Each layer is a group, and each part a box with its kind under
 * its name. A part not built yet is dashed, as a suggested thing is. The interfaces go between, each with the parts
 * that offer and implement it.
 */
export function architectureChart(arch) {
  const lines = ['```mermaid', 'flowchart TB'];
  for (const l of arch.layers) {
    lines.push(`  subgraph ${l.id}["${label(l.name)}"]`);
    for (const p of arch.parts.filter((x) => x.layer === l.id))
      lines.push(`    ${p.id}["${label(p.name)}<br/><i>:Part</i>"]`);
    lines.push('  end');
  }
  for (const i of arch.interfaces) lines.push(`  ${i.id}{{"${label(i.name)}<br/><i>:Interface</i>"}}`);
  for (const l of arch.layers) for (const u of l.uses) lines.push(`  ${l.id} -->|uses| ${u}`);
  for (const p of arch.parts) {
    for (const i of p.offers) lines.push(`  ${p.id} -.-|offers| ${i}`);
    for (const i of p.implements) lines.push(`  ${p.id} -->|implements| ${i}`);
  }
  const planned = arch.parts.filter((p) => !p.path).map((p) => p.id);
  lines.push('  classDef planned stroke-dasharray: 5 5,opacity:0.7');
  if (planned.length) lines.push(`  class ${planned.join(',')} planned`);
  lines.push('```');
  return lines.join('\n');
}
