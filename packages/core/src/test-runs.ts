// Test runs of a process (editor spec §35). A test run steps a process one transition at a time, as a debug or test
// run, never as the real thing.
// - It is its own Run thing, flagged `test`, with its own log. Real history leaves it out unless a lens asks for test
//   runs too (test_runs_flagged).
// - It reads the live graph unless a snapshot or an editable copy is chosen as it starts (test_run_source).
// - It changes no claim's certainty unless it opted in as it started, and then it records that it did
//   (test_runs_leave_certainty).
// - A transition's side effect (its `do`) runs a stub, never the effect: nothing outside is touched
//   (side_effects_stubbed).
// - Each step stops with a pause: the states now, each guard tried with its reason, the artefacts and resources involved
//   and any certainty change. A breakpoint is a thing in the graph, so it is saved, shared and queried like any other
//   (process_debugger).
import type { Graph, ProcessTransition, RunEntry, Value } from '@thoughtknot/graph-spec';
import gs from '@thoughtknot/graph-spec';

/** Where a test run reads from: the live graph, a snapshot pinned as it starts, or an editable copy of its own. */
export type RunSource = 'live' | 'snapshot' | 'copy';
/** The sources a run may read, the first the default. */
export const RUN_SOURCES: readonly RunSource[] = ['live', 'snapshot', 'copy'];

/** How a test run starts. */
export interface TestRunOptions {
  /** The run's id; `test-run` when not given. */
  id?: string;
  /** The process it runs: its only Process thing when not given. */
  process?: string;
  /** Live unless chosen. */
  source?: RunSource;
  /** True to let the run change claims' certainty, which it then records. Off unless chosen. */
  certainty?: boolean;
  /** The values the guards read. */
  inputs?: Record<string, Value>;
  /** The stubs a side effect runs in place of the effect, by its `do`. One not given is stubbed with nothing. */
  stubs?: Record<string, (inputs: Record<string, Value>) => Record<string, Value> | void>;
  /** The guard functions, by name and version, as the process core takes them. */
  functions?: Record<string, Record<string, (ctx: Record<string, unknown>) => unknown>>;
}

/** One guard tried: its transition, the guard (null for none), how it reads, whether it passed and why. */
export interface GuardTried {
  transition: string;
  guard: string | null;
  shown: string;
  passed: boolean;
  /** `holds`, `fails`, `none` (no guard) or `refused` (it could not be read), with the refusal in `detail`. */
  why: 'holds' | 'fails' | 'none' | 'refused';
  detail?: string;
}

/** A claim's certainty a transition sets: from and to its likelihood word, and whether the run applied it. */
export interface CertaintyChange {
  thing: string;
  from: string | null;
  to: string;
  applied: boolean;
}

/** One stop of a test run: where it is, what was tried, and what the step did. */
export interface RunPause {
  /** How many transitions it has taken. */
  step: number;
  /** The states it is in, outermost first. */
  states: string[];
  /** The transition just taken, or null at the start and at the end. */
  transition: string | null;
  /** Each transition out of the states it was in, tried. */
  guards: GuardTried[];
  /** The artefacts and resources joined to where it is or to the transition taken. */
  artefacts: string[];
  resources: string[];
  certainty: CertaintyChange[];
  /** Each side effect stubbed: its `do`. */
  stubbed: string[];
  /** The breakpoint it stopped at, if any. */
  breakpoint: string | null;
  /** True when no transition can be taken. */
  ended: boolean;
}

/** Where a breakpoint stops a run: on a transition, a guard, a step or state, or an event, by the thing it is ON. */
export interface Breakpoint {
  id: string;
  on: string;
}

/** The breakpoints of a graph: each Breakpoint thing and what it is ON, or its `on` property (an event or a link). */
export function breakpointsOf(graph: Graph): Breakpoint[] {
  return graph.labelled('Breakpoint').flatMap((id) => {
    const on = graph.out(id, 'ON').map((e) => e[2]);
    const named = graph.p(id).on;
    if (typeof named === 'string') on.push(named);
    return on.map((at) => ({ id, on: at }));
  });
}

/** The runs and log entries real history shows: test runs and their entries only when the lens includes tests. */
export function historyOf(graph: Graph, lens: { tests?: boolean } = {}): { runs: string[]; entries: string[] } {
  const runs = graph.labelled('Run').filter((r) => lens.tests || graph.p(r).test !== true);
  const shown = new Set(runs);
  const entries = graph.labelled('Entry').filter((e) => shown.has(graph.p(e).run as string));
  return { runs, entries };
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const KEPT_OUT = new Set(['Entry', 'Run']);

/** A graph with more things and links: the base's, then these. */
function plus(base: Graph, nodes: [string, Set<string>, Record<string, Value>][], edges: Graph['edges']): Graph {
  const all = new Map(base.nodes);
  for (const [id, labels, props] of nodes) all.set(id, [labels, props]);
  return new gs.Graph(all, [...base.edges, ...edges]);
}

/** One saved place of a run, so a step back returns to it. */
interface Kept {
  entries: RunEntry[];
  overlay: Map<string, string>;
  pause: RunPause;
}

/** A process run as a test: stepped by hand or by a player, its log its own, thrown away unless kept. */
export class TestRun {
  readonly id: string;
  readonly process: string;
  readonly source: RunSource;
  /** Whether it may change certainty, as chosen when it started. */
  readonly certaintyOptIn: boolean;
  /** The values the guards read now: those it started with, and what each stub gave back. */
  readonly inputs: Record<string, Value>;
  /** The values it started with. */
  readonly startInputs: Readonly<Record<string, Value>>;
  #read: () => Graph;
  #copy: Graph | null = null;
  #entries: RunEntry[] = [];
  #overlay = new Map<string, string>();
  #kept: Kept[] = [];
  #options: TestRunOptions;
  #discarded = false;
  #ended: RunPause | null = null;

  /** `live` gives the graph as it is now, each time it is asked. */
  constructor(live: () => Graph, options: TestRunOptions = {}) {
    this.#options = options;
    this.id = options.id ?? 'test-run';
    this.source = options.source ?? 'live';
    if (!RUN_SOURCES.includes(this.source)) throw new Error(`refused: a run reads live, a snapshot or a copy`);
    this.certaintyOptIn = options.certainty === true;
    this.inputs = { ...(options.inputs ?? {}) };
    this.startInputs = Object.freeze({ ...this.inputs });
    const first = live();
    const processes = first.labelled('Process');
    const process = options.process ?? (processes.length === 1 ? processes[0] : undefined);
    if (process === undefined || !first.has(process, 'Process'))
      throw new Error('refused: name the process to run (editor spec §35)');
    this.process = process;
    if (this.source === 'live') this.#read = live;
    else {
      // pinned as it starts: a snapshot is never changed; a copy changes only by `edit`
      this.#copy = first;
      this.#read = () => this.#copy as Graph;
    }
    const start = this.#startState(first);
    if (start !== null) this.#entries = gs.enterState(this.#withRun(first), this.id, start);
    this.#kept = [{ entries: this.#entries, overlay: new Map(), pause: this.#pause(null, [], [], []) }];
  }

  /** The Run thing: flagged as a test, with its source and, when it opted in, that it may change certainty. */
  get runThing(): [Set<string>, Record<string, Value>] {
    const props: Record<string, Value> = { id: this.id, process: this.process, test: true, source: this.source };
    if (this.certaintyOptIn) props.certainty = 'opted-in';
    return [new Set(['Run']), props];
  }

  /** The graph the run reads now, with any certainty it applied. */
  graph(): Graph {
    const g = this.#read();
    if (!this.#overlay.size) return g;
    const nodes = new Map(g.nodes);
    for (const [thing, to] of this.#overlay) {
      const was = nodes.get(thing);
      if (was) nodes.set(thing, [was[0], { ...was[1], likelihood: to }]);
    }
    return new gs.Graph(nodes, g.edges);
  }

  /** An edit to a run on its own copy. A live run edits the graph itself, and a snapshot is never edited. */
  edit(next: Graph): void {
    if (this.source !== 'copy') throw new Error(`refused: only a run on an editable copy can be edited`);
    this.#copy = next;
  }

  /** The run's log, in order. */
  log(): RunEntry[] {
    return this.#entries.map((e) => ({ ...e }));
  }

  /** The stop it is at now. */
  get pause(): RunPause {
    return this.#ended ?? (this.#kept.at(-1) as Kept).pause;
  }

  /** Whether it can step back. */
  get canGoBack(): boolean {
    return this.#ended !== null || this.#kept.length > 1;
  }

  /** The graph with the run and its log in it, as a host keeps it to show; real history leaves it out (historyOf). */
  record(): Graph {
    if (this.#discarded) throw new Error('refused: this run was thrown away');
    const base = this.#withRun(this.graph());
    const withLog = gs.withEntries(base, this.id, this.#entries);
    const changed = this.certaintyOptIn
      ? this.pausesTaken()
          .flatMap((p) => p.certainty)
          .filter((c) => c.applied)
          .map((c): Graph['edges'][number] => [this.id, 'CHANGED_CERTAINTY', c.thing, { from: c.from, to: c.to }])
      : [];
    return plus(withLog, [], changed);
  }

  /** Every stop it has made, from the start. */
  pausesTaken(): RunPause[] {
    return this.#kept.map((k) => k.pause);
  }

  /** Throws the run away: nothing of it is kept (saved_scenarios, ad hoc runs). */
  discard(): void {
    this.#discarded = true;
    this.#entries = [];
    this.#kept = [];
  }

  get discarded(): boolean {
    return this.#discarded;
  }

  /** Takes the next transition, if one can be taken, and stops after it. */
  step(): RunPause {
    if (this.#discarded) throw new Error('refused: this run was thrown away');
    if (this.#ended) return this.#ended;
    const g = this.#withRun(this.graph());
    const now = gs.currentOf(gs.withEntries(g, this.id, this.#entries), this.id);
    const tried = this.#tryOut(g, now);
    const chosen = this.#choose(g, tried);
    if (!chosen) {
      // the end is a stop of its own but not a step: a step back from it returns to the stop before
      this.#ended = { ...this.#pause(null, tried, [], []), step: this.pause.step, states: now, ended: true };
      return this.#ended;
    }
    const t = gs.transitionsOf(g).find((x) => x.id === chosen) as ProcessTransition;
    const before = gs.withEntries(g, this.id, this.#entries);
    const from = now.includes(t.from as string) ? (t.from as string) : (now.at(-1) as string);
    this.#entries = [...this.#entries, ...gs.moveRun(before, this.id, from, t.to as string)];
    const certainty = this.#certaintyOf(g, t);
    const stubbed = this.#stub(g, t);
    const pause = this.#pause(chosen, tried, certainty, stubbed);
    this.#kept.push({ entries: this.#entries, overlay: new Map(this.#overlay), pause });
    return pause;
  }

  /** Steps back one transition, to the stop before it, undoing any certainty it applied. */
  back(): RunPause {
    if (this.#ended) this.#ended = null;
    else if (this.#kept.length > 1) this.#kept.pop();
    const k = this.#kept.at(-1) as Kept;
    this.#entries = k.entries;
    this.#overlay = new Map(k.overlay);
    return k.pause;
  }

  /** The graph with this run's Run thing in it, so the process core's run functions read it. */
  #withRun(g: Graph): Graph {
    return plus(g, [[this.id, ...this.runThing]], []);
  }

  /** The state the process starts in: its `start`, else its one top-level initial state. */
  #startState(g: Graph): string | null {
    const named = g.p(this.process).start;
    if (typeof named === 'string' && g.has(named, 'State')) return named;
    const tops = g
      .labelled('State')
      .filter((s) => g.p(s).initial === true && !g.inc(s, 'CONTAINS').length)
      .sort(byText);
    return tops[0] ?? null;
  }

  /** Each transition out of the states it is in, innermost state first, its guard tried against the inputs. */
  #tryOut(g: Graph, now: string[]): GuardTried[] {
    const all = gs.transitionsOf(g);
    const functions = this.#options.functions ?? {};
    return [...now].reverse().flatMap((state) =>
      all
        .filter((t) => t.from === state && t.to !== null)
        .map((t): GuardTried => {
          const guard = gs.guardOf(g, t.id);
          if (!guard) return { transition: t.id, guard: null, shown: '', passed: true, why: 'none' };
          try {
            const passed = gs.guardAllows(guard, this.inputs, functions);
            return { transition: t.id, guard: guard.id, shown: guard.shown, passed, why: passed ? 'holds' : 'fails' };
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            return { transition: t.id, guard: guard.id, shown: guard.shown, passed: false, why: 'refused', detail };
          }
        }),
    );
  }

  /** The transition the running rule takes among those whose guards passed: by priority, else the first. */
  #choose(g: Graph, tried: GuardTried[]): string | null {
    const open = tried.filter((t) => t.passed).map((t) => t.transition);
    if (!open.length) return null;
    const rule = g.p(this.process).running_rule;
    if (rule !== 'by-priority') return open[0] as string;
    const priority = (id: string): number => {
      const t = gs.transitionsOf(g).find((x) => x.id === id);
      const p = t?.promoted
        ? g.p(id).priority
        : g.edges.find((e) => e[1] === 'TRANSITION' && t && e[0] === t.from && e[2] === t.to)?.[3].priority;
      return typeof p === 'number' ? p : 0;
    };
    return [...open].sort((a, b) => priority(b) - priority(a))[0] as string;
  }

  /** What a transition carries: a promoted one's properties, or its link's. */
  #carried(g: Graph, t: ProcessTransition): Record<string, Value> {
    if (t.promoted) return g.p(t.id);
    return g.edges.find((e) => e[1] === 'TRANSITION' && e[0] === t.from && e[2] === t.to)?.[3] ?? {};
  }

  /** The certainty a transition sets, applied only when the run opted in. */
  #certaintyOf(g: Graph, t: ProcessTransition): CertaintyChange[] {
    const p = this.#carried(g, t);
    const thing = p.certainty_of,
      to = p.certainty;
    if (typeof thing !== 'string' || typeof to !== 'string' || !g.nodes.has(thing)) return [];
    const was = g.p(thing).likelihood;
    if (this.certaintyOptIn) this.#overlay.set(thing, to);
    return [{ thing, from: typeof was === 'string' ? was : null, to, applied: this.certaintyOptIn }];
  }

  /** A transition's side effect, stubbed: its stub runs, its result read as inputs; the effect itself never does. */
  #stub(g: Graph, t: ProcessTransition): string[] {
    const effect = this.#carried(g, t).do;
    if (typeof effect !== 'string') return [];
    const stub = this.#options.stubs?.[effect];
    const out = stub ? stub({ ...this.inputs }) : undefined;
    if (out) Object.assign(this.inputs, out);
    return [effect];
  }

  /** The stop after a transition: where it is, what was tried and what is joined there. */
  #pause(transition: string | null, guards: GuardTried[], certainty: CertaintyChange[], stubbed: string[]): RunPause {
    const g = this.#withRun(this.graph());
    const states = gs.currentOf(gs.withEntries(g, this.id, this.#entries), this.id);
    const near = new Set<string>();
    for (const at of [...states, ...(transition && g.nodes.has(transition) ? [transition] : [])])
      for (const e of [...g.out(at), ...g.inc(at)]) near.add(e[0] === at ? e[2] : e[0]);
    const kind = (label: string): string[] =>
      [...near].filter((id) => g.has(id, label) && !KEPT_OUT.has(label)).sort(byText);
    const tried = guards.map((x) => x.guard).filter((x): x is string => x !== null);
    const marks = [transition, ...states, ...tried];
    const hit = breakpointsOf(g).find(
      (b) =>
        marks.includes(b.on) ||
        (transition !== null && gs.transitionsOf(g).some((t) => t.id === transition && t.event === b.on)),
    );
    return {
      step: Math.max(0, this.#kept.length),
      states,
      transition,
      guards,
      artefacts: kind('Artefact'),
      resources: kind('Resource'),
      certainty,
      stubbed,
      breakpoint: transition === null && !this.#kept.length ? null : (hit?.id ?? null),
      ended: false,
    };
  }
}
