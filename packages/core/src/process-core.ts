// One process core under every process view (editor spec §34, one_process_core). A state machine, a pipeline or any
// other view reads the same core: graph-spec's eight kinds with the view settings kept apart. No view translates into
// another, so an edit made in one view shows in every other.
//
// A view is worked out when first asked for and kept. It is built again only when the core changes. A change to a view
// setting alone, such as where a thing sits, rebuilds nothing (process_views_cached).
import type { Graph, Value } from '@thoughtknot/graph-spec';
import gs from '@thoughtknot/graph-spec';
import { IntentWatch } from './intent-checks.ts';
import { processView, type ProcessView, type ProcessViewKind } from './process-views.ts';

/** A graph read as a process core: the core alone, the view settings kept apart, and the core's hash. */
export interface ProcessCore {
  /** The graph with every view setting taken out. */
  graph: Graph;
  /** The view settings of each thing, such as where it sits, by id. Never part of the core. */
  view: Record<string, Record<string, Value>>;
  /** The canonical hash of the core alone. Two views read the same core when their hashes match. */
  hash: string;
  /** What the eight kinds flag: a ninth kind, a person as a role, an owner as a property. */
  flags: [string, string, string][];
}

/** A plain graph from things and links: each thing's id is kept in its properties, as the reader keeps it. */
export function graphOf(
  nodes: Iterable<[string, Iterable<string>, Record<string, Value>]>,
  edges: Iterable<[string, string, string, Record<string, Value>?]>,
): Graph {
  const map = new Map<string, [Set<string>, Record<string, Value>]>();
  for (const [id, labels, props] of nodes) map.set(id, [new Set(labels), { ...props, id }]);
  return new gs.Graph(
    map,
    [...edges].map(([a, t, b, p]) => [a, t, b, p ?? {}]),
  );
}

/** A graph read as a process core. */
export function processCoreOf(graph: Graph): ProcessCore {
  const eight = gs.coreOfEight(graph);
  const core = graphOf(
    [...graph.nodes].map(([id, [labels]]) => [id, labels, eight.core[id] ?? {}]),
    graph.edges,
  );
  return { graph: core, view: eight.view, hash: gs.canon(core), flags: eight.flags };
}

/** The views of one process, each worked out when first asked for and kept until the core changes. */
export class ProcessViews {
  #core: ProcessCore;
  #kept = new Map<ProcessViewKind, ProcessView>();
  /** How many times a view has been worked out, for a test or a host's own measure. */
  builds = 0;
  /** The process's intents, checked on their own each time the core changes (editor spec §35, intent_checks). */
  readonly intents: IntentWatch;

  constructor(graph: Graph) {
    this.#core = processCoreOf(graph);
    this.intents = new IntentWatch(graph);
  }

  /** The core every view reads. */
  get core(): ProcessCore {
    return this.#core;
  }

  /** A view of the process: the kept one when the core has not changed, or one worked out now. */
  open(kind: ProcessViewKind): ProcessView {
    const kept = this.#kept.get(kind);
    if (kept && kept.core === this.#core.hash) return kept;
    const view = processView(this.#core, kind);
    this.builds += 1;
    this.#kept.set(kind, view);
    return view;
  }

  /**
   * The graph after an edit. Kept views stay while the core is the same, so a view setting alone rebuilds nothing. A
   * change to the core checks the intents at once.
   */
  update(graph: Graph): boolean {
    const next = processCoreOf(graph);
    const changed = next.hash !== this.#core.hash;
    this.#core = next;
    if (changed) {
      this.#kept.clear();
      this.intents.update(graph);
    }
    return changed;
  }
}
