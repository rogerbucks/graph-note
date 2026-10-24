// Playing a test run in the drawing (editor spec §35, playback_controller). Two modes, one at a time: autoplay, which
// takes each transition at its natural pace, and stepping by hand, forward and back. A step by hand pauses autoplay.
// Play and pause switch between them. A breakpoint pauses autoplay too (process_debugger).
//
// The controller is a thing of its own, a Playback, so a lens can ask about it. Each transition it visits is an
// ephemeral log entry, kept only while it plays. Some visits bear a consequence: a decision, a review, a side effect or
// a certainty change. Each is kept as a VISITED link, the only part that lasts.
//
// The host hands in its timer (`Scheduler`, as path-play.ts takes it), so the core never waits on a clock.
import type { Graph, Value } from '@thoughtknot/graph-spec';
import { DEFAULT_PACE, type Scheduler } from './path-play.ts';
import type { RunPause, TestRun } from './test-runs.ts';

/** One visit: the step, the transition and whether it bears a consequence. Kept only while playing. */
export interface Visit {
  step: number;
  transition: string;
  consequence: boolean;
}

/** What a transition carries that makes a visit to it bear a consequence. */
const CONSEQUENCES = ['decision', 'review', 'do', 'certainty_of'];

/** A transition's natural pace, in milliseconds: its `pace` in ms, or its `duration` in seconds, else the default. */
export function naturalPace(graph: Graph, transition: string | null): number {
  if (transition === null) return DEFAULT_PACE;
  const props: Record<string, Value> = graph.nodes.has(transition)
    ? graph.p(transition)
    : (graph.edges.find((e) => e[1] === 'TRANSITION' && `transition:${e[0]}->${e[2]}` === transition)?.[3] ?? {});
  if (typeof props.pace === 'number' && props.pace > 0) return props.pace;
  if (typeof props.duration === 'number' && props.duration > 0) return props.duration * 1000;
  return DEFAULT_PACE;
}

/** Whether a visit to a transition bears a consequence, given the stop it made. */
function bearsConsequence(graph: Graph, pause: RunPause): boolean {
  const t = pause.transition;
  if (t === null) return false;
  if (pause.certainty.length || pause.stubbed.length) return true;
  const props = graph.nodes.has(t)
    ? graph.p(t)
    : (graph.edges.find((e) => e[1] === 'TRANSITION' && `transition:${e[0]}->${e[2]}` === t)?.[3] ?? {});
  return CONSEQUENCES.some((k) => Object.hasOwn(props, k));
}

/** The player of one test run: autoplay or by hand, its visits and the links that last. */
export class PlaybackController {
  readonly id: string;
  readonly run: TestRun;
  /** Called after each stop, whichever mode made it, so the host draws and says it. */
  onStop: ((pause: RunPause) => void) | null = null;
  #scheduler: Scheduler;
  #handle: unknown = null;
  #visits: Visit[] = [];

  constructor(run: TestRun, scheduler: Scheduler, id = `playback:${run.id}`) {
    this.run = run;
    this.#scheduler = scheduler;
    this.id = id;
  }

  /** The mode it is in: autoplay while a step waits on the clock, else by hand. */
  get mode(): 'autoplay' | 'manual' {
    return this.#handle === null ? 'manual' : 'autoplay';
  }

  /** The controller as a thing, so a lens can find it. */
  get thing(): [Set<string>, Record<string, Value>] {
    return [new Set(['Playback']), { id: this.id, run: this.run.id, mode: this.mode }];
  }

  /** Every visit while it plays, in order: an ephemeral log, never written. */
  get visits(): Visit[] {
    return this.#visits.map((v) => ({ ...v }));
  }

  /** The links that last: a VISITED link for each visit that bore a consequence, none for the rest. */
  lasting(): Graph['edges'] {
    return this.#visits
      .filter((v) => v.consequence)
      .map((v): Graph['edges'][number] => [this.id, 'VISITED', v.transition, { step: v.step }]);
  }

  /** Autoplay from here, each transition at its natural pace, until the end or a breakpoint. */
  play(): void {
    if (this.#handle !== null || this.run.pause.ended) return;
    this.#wait();
  }

  /** Back to stepping by hand: nothing waits on the clock. */
  pause(): void {
    if (this.#handle !== null) this.#scheduler.cancel(this.#handle);
    this.#handle = null;
  }

  /** One transition forward, by hand: autoplay pauses first. */
  forward(): RunPause {
    this.pause();
    return this.#take();
  }

  /** One transition back, by hand: autoplay pauses first, and the visit it undoes goes from the log. */
  back(): RunPause {
    this.pause();
    const pause = this.run.back();
    this.#visits = this.#visits.filter((v) => v.step <= pause.step);
    this.onStop?.(pause);
    return pause;
  }

  /** Stops playing: nothing waits, and the ephemeral log goes. The lasting links were the host's to keep. */
  stop(): void {
    this.pause();
    this.#visits = [];
  }

  #take(): RunPause {
    const pause = this.run.step();
    if (pause.transition !== null)
      this.#visits.push({
        step: pause.step,
        transition: pause.transition,
        consequence: bearsConsequence(this.run.graph(), pause),
      });
    this.onStop?.(pause);
    return pause;
  }

  #wait(): void {
    // each stop is shown for the pace of the transition that made it
    this.#handle = this.#scheduler.after(naturalPace(this.run.graph(), this.run.pause.transition), () => {
      this.#handle = null;
      const pause = this.#take();
      if (!pause.ended && pause.breakpoint === null) this.#wait();
    });
  }
}
