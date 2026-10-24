// Edits made in any process view, written into the one core (editor spec §34, edits_from_any_view). An edit is planned
// first, so the views it changes are listed before anything is saved. Then it is saved into the core.
// - An incomplete edit is saved, and its gaps are shown: a step with no transition, or a link to nothing.
// - What the view hides of the edit is flagged, such as a step that lands inside a folded loop.
// - Removing a thing keeps its links to a resource, listed as dangling, rather than deleting them.
// - A view-only edit, such as where a thing sits, stays in the view settings and leaves the core as it was.
import type { Graph, Value } from '@thoughtknot/graph-spec';
import { graphOf, processCoreOf, type ProcessViews } from './process-core.ts';
import { PROCESS_VIEWS, processView, type ProcessViewKind } from './process-views.ts';

/** An edit made in a view: things added, transitions linked, properties set and things removed. */
export interface ProcessEdit {
  add?: { id: string; kind: string; props?: Record<string, Value> }[];
  /** TRANSITION links, from and to. */
  link?: [string, string][];
  set?: { id: string; props: Record<string, Value> }[];
  remove?: string[];
}

/** An edit planned in a view, ready to save once its affected views are seen. */
export interface EditPlan {
  /** The view the edit was made in. */
  view: ProcessViewKind;
  /** The graph as it will be once saved. */
  graph: Graph;
  /** Whether the core changes. False for an edit to view settings alone. */
  coreChanged: boolean;
  /** The views the edit changes, listed before saving. */
  affected: ProcessViewKind[];
  /** What is incomplete, each as its code and the thing: `unlinked` or `missing`. */
  gaps: [string, string][];
  /** What the view it was made in hides of the edit: the thing and the mark. */
  hidden: [string, string][];
  /** Links to a resource kept when a thing at one end was removed. */
  dangling: [string, string, string][];
  /** Each view setting the edit wrote, kept out of the core: the thing and the setting. */
  viewOnly: [string, string][];
}

/** The things an edit touches. */
function touched(edit: ProcessEdit): Set<string> {
  return new Set([
    ...(edit.add ?? []).map((a) => a.id),
    ...(edit.link ?? []).flat(),
    ...(edit.set ?? []).map((s) => s.id),
  ]);
}

/** The graph with an edit applied, and the resource links it kept. */
function applied(graph: Graph, edit: ProcessEdit): { graph: Graph; dangling: [string, string, string][] } {
  const nodes = new Map(
    [...graph.nodes].map(([id, [labels, props]]) => [id, [new Set(labels), { ...props }]] as const),
  );
  for (const a of edit.add ?? []) nodes.set(a.id, [new Set([a.kind]), { ...(a.props ?? {}) }]);
  for (const s of edit.set ?? []) {
    const n = nodes.get(s.id);
    if (n) Object.assign(n[1], s.props);
  }
  const removed = new Set(edit.remove ?? []);
  const isResource = (id: string) => graph.has(id, 'Resource');
  const dangling: [string, string, string][] = [];
  const edges = graph.edges.filter(([a, t, b]) => {
    if (!removed.has(a) && !removed.has(b)) return true;
    if (isResource(a) || isResource(b)) {
      dangling.push([a, t, b]);
      return true;
    }
    return false;
  });
  for (const id of removed) nodes.delete(id);
  for (const [a, b] of edit.link ?? []) edges.push([a, 'TRANSITION', b, {}]);
  return {
    graph: graphOf(
      [...nodes].map(([id, [labels, props]]) => [id, labels, props]),
      edges,
    ),
    dangling,
  };
}

/** An edit made in a view, planned: what it changes and what it leaves incomplete, before anything is saved. */
export function planEdit(views: ProcessViews, view: ProcessViewKind, edit: ProcessEdit): EditPlan {
  const before = views.core;
  // the view settings go back beside the core first, so the plan's graph keeps both
  const { graph: withView, dangling } = applied(withSettings(before.graph, before.view), edit);
  const after = processCoreOf(withView);
  const coreChanged = after.hash !== before.hash;
  const affected = coreChanged
    ? PROCESS_VIEWS.filter((k) => shape(processView(before, k)) !== shape(processView(after, k)))
    : [];
  const ids = new Set(after.graph.nodes.keys());
  const linked = new Set(after.graph.edges.filter((e) => e[1] === 'TRANSITION').flatMap((e) => [e[0], e[2]]));
  const gaps: [string, string][] = [];
  for (const id of [...touched(edit)].sort()) {
    if (!ids.has(id)) gaps.push(['missing', id]);
    else if (!linked.has(id) && !after.graph.has(id, 'Resource')) gaps.push(['unlinked', id]);
  }
  const shown = processView(after, view);
  const hidden: [string, string][] = [];
  for (const n of shown.nodes)
    for (const id of n.hides.length ? n.hides : [n.id])
      if (touched(edit).has(id)) for (const mark of n.marks) hidden.push([id, mark]);
  const viewOnly: [string, string][] = [];
  for (const [id, props] of Object.entries(after.view))
    for (const k of Object.keys(props)) if (before.view[id]?.[k] !== props[k]) viewOnly.push([id, k]);
  return { view, graph: withView, coreChanged, affected, gaps, hidden, dangling, viewOnly: viewOnly.sort() };
}

/** A planned edit saved into the core, so every view shows it. Returns whether the core changed. */
export function saveEdit(views: ProcessViews, plan: EditPlan): boolean {
  return views.update(plan.graph);
}

/** A core graph with its view settings put back, so an edit keeps both. */
function withSettings(core: Graph, view: Record<string, Record<string, Value>>): Graph {
  return graphOf(
    [...core.nodes].map(([id, [labels, props]]) => [id, labels, { ...props, ...(view[id] ?? {}) }]),
    core.edges,
  );
}

/** A view's nodes and links as text, to see whether an edit changes it. */
function shape(v: { nodes: unknown; links: unknown }): string {
  return JSON.stringify([v.nodes, v.links]);
}
