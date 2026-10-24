// A run animated in the drawing, driven by the query engine (editor spec §36, drawing_follows_engine). The drawing
// never plays a canned sequence. Each frame asks the live graph which state the run is in now, from its log. Scrubbing
// back asks the same log for an earlier state, so history is the graph's own, never a recording the drawing kept.
import type { Graph } from '@thoughtknot/graph-spec';
import gs from '@thoughtknot/graph-spec';

/** What the drawing marks for a run at one point of its log: the states it is in and the entry it is at. */
export interface RunFrame {
  /** The log entry this frame is at; 0 before the first. */
  seq: number;
  /** The states the run is in, outermost first. */
  states: string[];
  /** The last state entered by then, which the drawing outlines as the step now on; null before any. */
  entered: string | null;
}

/** The frame of a run as its log stands up to `seq`, asked of the graph; the whole log when `seq` is not given. */
export function runFrame(graph: Graph, run: string, seq: number | null = null): RunFrame {
  const log = gs.runLog(graph, run).filter((e) => seq === null || e.seq <= seq);
  const now: string[] = [];
  for (const e of log) {
    const i = now.indexOf(e.state);
    if (e.did === 'entered' && i < 0) now.push(e.state);
    if (e.did === 'left' && i >= 0) now.splice(i, 1);
  }
  const entered = log.filter((e) => e.did === 'entered').at(-1)?.state ?? null;
  return { seq: log.at(-1)?.seq ?? 0, states: now, entered };
}

/** A run as the drawing follows it: every frame asked of the live graph when it is drawn, never kept. */
export class RunAnimation {
  readonly run: string;
  #live: () => Graph;

  /** `live` gives the graph as it is now, each time it is asked. */
  constructor(live: () => Graph, run: string) {
    this.#live = live;
    this.run = run;
  }

  /** The frame now: the run's states as the live graph holds them at this moment. */
  now(): RunFrame {
    return runFrame(this.#live(), this.run);
  }

  /** An earlier frame, asked of the run's log in the live graph: how it stood after entry `seq`. */
  at(seq: number): RunFrame {
    return runFrame(this.#live(), this.run, seq);
  }

  /** The points a scrubber can stop at: each entry of the log, in order, from the graph as it is now. */
  stops(): number[] {
    return gs.runLog(this.#live(), this.run).map((e) => e.seq);
  }
}
