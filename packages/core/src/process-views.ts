// The views of a process core, and what each cannot show (editor spec §34, views_declare_limits). The core takes loops,
// parallel steps and timing in one form. Each view says which of them it cannot show, and folds or marks them. A view
// that cannot show something is incomplete. The core stays valid, as nothing is changed to fit a view.
// - A loop the view cannot show is folded into one node, marked as hiding it.
// - Parallel steps or timing the view cannot show stay as they are, each node marked with what it hides.
import type { ProcessTransition } from '@thoughtknot/graph-spec';
import gs from '@thoughtknot/graph-spec';
import type { ProcessCore } from './process-core.ts';

/** The views of one process core. None is a translation of another. */
export const PROCESS_VIEWS = [
  'state-machine',
  'workflow',
  'pipeline',
  'event-flow',
  'decision-table',
  'petri-net',
  'actor-model',
  'schedule',
] as const;
/** One of the process views. */
export type ProcessViewKind = (typeof PROCESS_VIEWS)[number];

/** What a process may hold that some views cannot show. */
export type ProcessFeature = 'loops' | 'parallel' | 'timing';

/** What each view cannot show. A view not listed for a feature shows it as it is. */
export const PROCESS_VIEW_LIMITS: Readonly<Record<ProcessViewKind, readonly ProcessFeature[]>> = {
  'state-machine': ['timing'],
  workflow: [],
  pipeline: ['loops'],
  'event-flow': ['timing'],
  'decision-table': ['loops', 'parallel', 'timing'],
  'petri-net': ['timing'],
  'actor-model': ['loops', 'timing'],
  schedule: ['loops'],
};

/** The kinds a process view draws as its nodes; the others (actors, artefacts, resources) sit beside them. */
const NODE_KINDS = ['Step', 'Event', 'Decision', 'Condition'];
/** The properties that hold a thing's timing. */
const TIMING = ['duration', 'starts', 'ends', 'due', 'after', 'every'];

/** One node of a view, with the marks for what the view hides there. */
export interface ProcessViewNode {
  id: string;
  /** The core kind, or `State` for a state. A fold has the kind `Loop`. */
  kind: string;
  /** For a fold, the things it hides. */
  hides: string[];
  /** Each mark, such as `loop-hidden`, `parallel-hidden` or `timing-hidden`: codes a host says in words. */
  marks: string[];
}

/** A view of a process core. */
export interface ProcessView {
  kind: ProcessViewKind;
  /** The hash of the core it was worked out from. */
  core: string;
  /** What this view cannot show. */
  cannot: readonly ProcessFeature[];
  nodes: ProcessViewNode[];
  links: [string, string][];
  /** True when the view folds or marks anything: it does not show the whole core. */
  incomplete: boolean;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The loops of the transitions: each group of two or more things that reach each other, and each step to itself. */
export function loopsOf(ids: readonly string[], links: readonly [string, string][]): string[][] {
  const next = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [a, b] of links) next.get(a)?.push(b);
  const reach = (from: string) => {
    const seen = new Set<string>(),
      todo = [...(next.get(from) ?? [])];
    while (todo.length) {
      const id = todo.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      todo.push(...(next.get(id) ?? []));
    }
    return seen;
  };
  const reached = new Map(ids.map((id) => [id, reach(id)]));
  const placed = new Set<string>(),
    loops: string[][] = [];
  for (const id of [...ids].sort(byText)) {
    if (placed.has(id) || !reached.get(id)?.has(id)) continue;
    const loop = ids.filter((o) => reached.get(id)?.has(o) && reached.get(o)?.has(id)).sort(byText);
    for (const o of loop) placed.add(o);
    loops.push(loop);
  }
  return loops;
}

/** A thing's kind as a view draws it, or null when the view draws it beside the nodes. */
function nodeKind(core: ProcessCore, id: string, kinds: Record<string, string>): string | null {
  const k = kinds[id];
  if (k && NODE_KINDS.includes(k)) return k;
  return core.graph.has(id, 'State') ? 'State' : null;
}

/** Whether a thing starts parallel steps: it says so, or two or more of its transitions are marked parallel. */
function startsParallel(
  core: ProcessCore,
  id: string,
  links: readonly (ProcessTransition & { parallel: boolean })[],
): boolean {
  if (core.graph.p(id).split === 'parallel') return true;
  return links.filter((t) => t.from === id && t.parallel).length >= 2;
}

/** A view of a process core, folding or marking what it cannot show. */
export function processView(core: ProcessCore, kind: ProcessViewKind): ProcessView {
  const cannot = PROCESS_VIEW_LIMITS[kind];
  const { kind: kinds } = gs.coreOfEight(core.graph);
  const ids = [...core.graph.nodes.keys()].filter((id) => nodeKind(core, id, kinds) !== null).sort(byText);
  const transitions = gs.transitionsOf(core.graph).map((t) => ({ ...t, parallel: transitionParallel(core, t) }));
  let links = transitions
    .filter((t): t is typeof t & { from: string; to: string } => t.from !== null && t.to !== null)
    .map((t): [string, string] => [t.from, t.to]);
  const nodes = new Map<string, ProcessViewNode>(
    ids.map((id) => [id, { id, kind: nodeKind(core, id, kinds) as string, hides: [], marks: [] }]),
  );
  for (const id of ids) {
    const n = nodes.get(id) as ProcessViewNode;
    if (cannot.includes('parallel') && startsParallel(core, id, transitions)) n.marks.push('parallel-hidden');
    if (cannot.includes('timing') && TIMING.some((p) => Object.hasOwn(core.graph.p(id), p)))
      n.marks.push('timing-hidden');
  }
  if (cannot.includes('loops')) {
    for (const loop of loopsOf(ids, links)) {
      const fold = `loop:${loop[0]}`;
      for (const id of loop) nodes.delete(id);
      nodes.set(fold, { id: fold, kind: 'Loop', hides: loop, marks: ['loop-hidden'] });
      const at = (id: string) => (loop.includes(id) ? fold : id);
      links = links.map(([a, b]): [string, string] => [at(a), at(b)]).filter(([a, b]) => !(a === fold && b === fold));
    }
  }
  const seen = new Set<string>();
  links = links.filter(([a, b]) => !seen.has(`${a}\u0000${b}`) && seen.add(`${a}\u0000${b}`));
  const list = [...nodes.values()].sort((x, y) => byText(x.id, y.id));
  return {
    kind,
    core: core.hash,
    cannot,
    nodes: list,
    links: links.sort((x, y) => byText(x.join('\u0000'), y.join('\u0000'))),
    incomplete: list.some((n) => n.marks.length > 0),
  };
}

/** Whether a transition is marked as one of parallel steps. */
function transitionParallel(core: ProcessCore, t: ProcessTransition): boolean {
  if (t.promoted) return core.graph.p(t.id).parallel === true;
  const edge = core.graph.edges.find((e) => e[1] === 'TRANSITION' && e[0] === t.from && e[2] === t.to);
  return edge?.[3].parallel === true;
}
