// Intent checks (editor spec §35, intent_checks; §58, intent_checks_folded). An intent is a condition the process should
// keep. It is held in the
// core as graph data: an Intent thing saying it in words, with a test in the guard language. The checks run on their own
// whenever the process changes, with no step by the user. Each break is reported, so the user fixes the change or
// updates the intent. Nothing is refused: a break is said, never enforced.
//
// A test reads the process's facts by name (`processFacts`). They count the states and transitions, the initial and
// final states, the states no run reaches, the dead ends, guards and side effects.
import type { Graph } from '@thoughtknot/graph-spec';
import gs from '@thoughtknot/graph-spec';

/** What an intent's test reads: counts of the process's parts. */
export interface ProcessFacts {
  states: number;
  transitions: number;
  initial: number;
  final: number;
  /** States that no transition reaches from an initial state. */
  unreachable: number;
  /** States that are not final and have no way out. */
  dead_ends: number;
  guards: number;
  /** Transitions that carry a side effect (`do`). */
  side_effects: number;
  /** Side effects on transitions with no guard. */
  unguarded_side_effects: number;
}

/** One intent: its id, its words and its test. */
export interface Intent {
  id: string;
  says: string;
  test: string;
}

/** One intent broken: which, its words, its test and why — `fails`, or `refused` when its test could not be read. */
export interface IntentBreak extends Intent {
  why: 'fails' | 'refused';
  detail?: string;
}

/** The facts of a process an intent's test reads. */
export function processFacts(graph: Graph): ProcessFacts {
  const states = graph.labelled('State');
  const transitions = gs.transitionsOf(graph);
  const initial = states.filter((s) => graph.p(s).initial === true);
  const isFinal = (s: string): boolean => graph.p(s).final === true;
  const next = new Map<string, string[]>();
  for (const t of transitions)
    if (t.from !== null && t.to !== null) next.set(t.from, [...(next.get(t.from) ?? []), t.to]);
  // entering a state enters what it holds, so what it holds counts as reached
  for (const [a, type, b] of graph.edges) if (type === 'CONTAINS') next.set(a, [...(next.get(a) ?? []), b]);
  const reached = new Set(initial),
    queue = [...initial];
  while (queue.length)
    for (const n of next.get(queue.shift() as string) ?? [])
      if (!reached.has(n)) {
        reached.add(n);
        queue.push(n);
      }
  const out = new Set(transitions.map((t) => t.from));
  const effects = transitions.filter((t) => t.carries.includes('do'));
  return {
    states: states.length,
    transitions: transitions.length,
    initial: initial.length,
    final: states.filter(isFinal).length,
    unreachable: states.filter((s) => !reached.has(s)).length,
    dead_ends: states.filter((s) => !isFinal(s) && !out.has(s) && !graph.out(s, 'CONTAINS').length).length,
    guards: graph.labelled('Guard').length,
    side_effects: effects.length,
    unguarded_side_effects: effects.filter((t) => !gs.guardOf(graph, t.id)).length,
  };
}

/**
 * The intent checks of a graph: each Intent thing with a test, in the order written (§58, intent_checks_folded). An
 * intent attached to a process by a CHECKS link checks that process. One attached to none checks the graph's process.
 * An intent with no test says what is meant, and is not checked.
 */
export function intentsOf(graph: Graph, process: string | null = null): Intent[] {
  return graph.labelled('Intent').flatMap((id) => {
    const p = graph.p(id);
    if (typeof p.test !== 'string') return [];
    const on = graph.out(id, 'CHECKS').map((e) => e[2]);
    if (process !== null && on.length && !on.includes(process)) return [];
    return [{ id, says: typeof p.says === 'string' ? p.says : id, test: p.test }];
  });
}

/** Every intent check the graph holds, or those of one process, checked against the process: the ones broken. */
export function checkIntents(graph: Graph, process: string | null = null): IntentBreak[] {
  const facts = processFacts(graph) as unknown as Record<string, unknown>;
  return intentsOf(graph, process).flatMap((intent): IntentBreak[] => {
    try {
      return gs.guardAllows({ id: intent.id, expression: intent.test, shown: intent.test }, facts)
        ? []
        : [{ ...intent, why: 'fails' }];
    } catch (e) {
      return [{ ...intent, why: 'refused', detail: e instanceof Error ? e.message : String(e) }];
    }
  });
}

/**
 * The intents of one process, checked on their own each time it changes. A host gives each new graph to `update`.
 * When the process changed, every intent is checked, and each break goes to `onBreaks` with no step by the user. A
 * graph that did not change is not checked again.
 */
export class IntentWatch {
  #hash: string;
  #breaks: IntentBreak[];
  /** How many times the intents were checked, for a test or a host's own measure. */
  checks = 1;
  onBreaks: ((breaks: IntentBreak[]) => void) | null;

  constructor(graph: Graph, onBreaks: ((breaks: IntentBreak[]) => void) | null = null) {
    this.#hash = gs.canon(graph);
    this.#breaks = checkIntents(graph);
    this.onBreaks = onBreaks;
  }

  /** The intents broken now. */
  get breaks(): IntentBreak[] {
    return this.#breaks;
  }

  /** The process after a change: checked at once when it changed, its breaks reported. */
  update(graph: Graph): IntentBreak[] {
    const hash = gs.canon(graph);
    if (hash === this.#hash) return this.#breaks;
    this.#hash = hash;
    this.checks += 1;
    this.#breaks = checkIntents(graph);
    if (this.#breaks.length) this.onBreaks?.(this.#breaks);
    return this.#breaks;
  }
}
