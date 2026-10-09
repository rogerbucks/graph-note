// The layout engine kept apart from the interface (spec §9, layout_contained): the layout source is written and Graphviz
// run in a worker, behind a time limit and a size limit, so a huge or hostile graph never freezes the page. The core holds
// both sides of the talk — the worker's (serveLayouts) and the page's (LayoutRunner) — and is handed the port between them,
// so it stays host-free: the plugin gives it a Web Worker, a test a fake or a thread. The worker draws with render.ts's
// own steps, so a drawing is byte for byte the same wherever it is laid out (spec §12, layout_byte_identical).
import type { GraphDrawing } from './note-reading.ts';
import { chosen, directions } from './render.ts';
import type { Direction, Drawn, Engine } from './render.ts';

/** How much a graph may be before it is shown as text instead of drawn, and how long its layout may take. */
export interface LayoutLimits {
  things: number;
  links: number;
  /** The most bytes (UTF-8) of layout source handed to Graphviz for one direction. */
  sourceBytes: number;
  /** The most milliseconds a layout may take, from being handed to the worker, before the worker is stopped. */
  ms: number;
}

/**
 * The limits, until a setting changes them. A note's graphs are tens of things; 2,000 things or 5,000 links is far past
 * anything readable as a drawing, and about the most that lays out in a few seconds on a phone, while a graph written by
 * a script to be hostile is caught. 1 MB of layout source is about 2,000 things written at 500 characters each: past it,
 * a graph is text, not a drawing. Five seconds is ten times the half second a 50-thing graph may take (spec §11).
 */
export const LAYOUT_LIMITS: LayoutLimits = { things: 2000, links: 5000, sourceBytes: 1_000_000, ms: 5000 };

/**
 * Why a graph is shown as text instead of drawn: which limit it is over, and the numbers; or how long it was given. A
 * source refused before it was written is counted from its texts alone (`atLeast`): the source would be longer still.
 */
export type Refusal =
  | { reason: 'too-large'; limit: 'things' | 'links'; count: number; most: number }
  | { reason: 'too-large'; limit: 'source'; count: number; most: number; atLeast?: true }
  | { reason: 'timed-out'; ms: number };

/** What the page asks the worker: one drawing laid out, and the most layout source it may write for it. */
export interface LayoutRequest {
  id: number;
  drawing: GraphDrawing;
  sourceBytes: number;
}

/** What the worker answers: the drawing, the source limit it was over, or what went wrong. */
export type LayoutReply =
  { id: number; drawn: Drawn } | { id: number; refusal: Refusal } | { id: number; error: string };

/** The page's end of a worker, shaped as a browser's Worker is. */
export interface LayoutPort {
  postMessage(request: LayoutRequest): void;
  terminate(): void;
  onmessage: ((event: { data: LayoutReply }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

/** The worker's own end, shaped as a Web Worker's `self` is. */
export interface LayoutScope {
  postMessage(reply: LayoutReply): void;
  onmessage: ((event: { data: LayoutRequest }) => void) | null;
}

/** The host's timers: the core has none of its own. */
export interface Clock {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

/** Where to lay out when a worker cannot start at all, and who to tell, once, that it is used. */
export interface Fallback {
  spawn: () => LayoutPort;
  told: (why: unknown) => void;
}

/** The UTF-8 length of a text, in bytes, as Graphviz reads it; with `inked`, only its characters that are not spaces. */
function bytesOf(text: string, inked = false): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inked && (c === 0x20 || (c >= 0x09 && c <= 0x0d))) continue;
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00) {
      n += 4; // a pair of surrogates: one character, four bytes
      i++;
    } else n += 3;
  }
  return n;
}

/** Over the things or links limit, or plainly over the source limit by the boxes' texts alone: all cheap, no source written. */
function counted(drawing: GraphDrawing, limits: LayoutLimits): Refusal | null {
  if (drawing.boxes.length > limits.things)
    return { reason: 'too-large', limit: 'things', count: drawing.boxes.length, most: limits.things };
  if (drawing.links.length > limits.links)
    return { reason: 'too-large', limit: 'links', count: drawing.links.length, most: limits.links };
  // every character of a box's text but its spaces is written into the source, escaped: the source is at least this
  let inked = 0;
  for (const b of drawing.boxes) inked += bytesOf(b.text, true);
  return inked > limits.sourceBytes
    ? { reason: 'too-large', limit: 'source', count: inked, most: limits.sourceBytes, atLeast: true }
    : null;
}

/** Over the source limit, measured exactly on the source written for each direction. */
function measured(laid: Direction[], sourceBytes: number): Refusal | null {
  const count = Math.max(0, ...laid.map((d) => bytesOf(d.dot)));
  return count > sourceBytes ? { reason: 'too-large', limit: 'source', count, most: sourceBytes } : null;
}

/** Whether a drawing is over a size limit, and which: things, then links, then layout source, before any layout. */
export function tooLarge(drawing: GraphDrawing, limits: LayoutLimits): Refusal | null {
  return counted(drawing, limits) ?? measured(directions(drawing), limits.sourceBytes);
}

/**
 * The worker's side: writes each drawing's layout source, refuses one over the source limit, and lays the rest out with
 * the engine `load` starts — started once, on the first layout.
 */
export function serveLayouts(scope: LayoutScope, load: () => Promise<Engine>): void {
  let engine: Promise<Engine> | null = null;
  scope.onmessage = ({ data: { id, drawing, sourceBytes } }) => {
    const answer = async (): Promise<LayoutReply> => {
      const laid = directions(drawing);
      const refusal = measured(laid, sourceBytes);
      if (refusal) return { id, refusal };
      const e = await (engine ??= load());
      return {
        id,
        drawn: chosen(
          laid,
          laid.map((d) => e.render(d.dot)),
        ),
      };
    };
    void answer().then(
      (reply) => scope.postMessage(reply),
      (e: unknown) => scope.postMessage({ id, error: e instanceof Error ? e.message : String(e) }),
    );
  };
}

/** A port to a worker served on this thread, for where no worker can run: the same talk, with no time limit possible. */
export function inThreadPort(serve: (scope: LayoutScope) => void): LayoutPort {
  let open = true;
  const later = (run: () => void) => void Promise.resolve().then(() => open && run());
  const scope: LayoutScope = {
    onmessage: null,
    postMessage: (reply) => later(() => port.onmessage?.({ data: reply })),
  };
  const port: LayoutPort = {
    onmessage: null,
    onerror: null,
    postMessage: (request) => later(() => scope.onmessage?.({ data: request })),
    terminate: () => (open = false),
  };
  serve(scope);
  return port;
}

interface Job {
  drawing: GraphDrawing;
  done: (result: Drawn | Refusal | Error) => void;
  id?: number;
  timer?: unknown;
}

/**
 * The page's side: lays drawings out in one worker, reused, one layout at a time, each given the time limit from when it
 * is handed over — so a layout waiting behind a stuck one is never charged for the wait. A worker past the limit is
 * terminated, and the next layout starts a fresh one.
 */
export class LayoutRunner {
  private spawn: () => LayoutPort;
  private readonly clock: Clock;
  private readonly limits: () => LayoutLimits;
  private fallback: Fallback | undefined;
  private port: LayoutPort | null = null;
  private answered = false;
  private busy: Job | null = null;
  private readonly queue: Job[] = [];
  private next = 1;

  constructor(spawn: () => LayoutPort, clock: Clock, limits?: () => LayoutLimits, fallback?: Fallback) {
    this.spawn = spawn;
    this.clock = clock;
    this.limits = limits ?? (() => LAYOUT_LIMITS);
    this.fallback = fallback;
  }

  /** The drawing, laid out and themed; or why it is not drawn. Rejects when the engine cannot start or lay it out. */
  draw(drawing: GraphDrawing): Promise<Drawn | Refusal> {
    const over = counted(drawing, this.limits());
    if (over) return Promise.resolve(over);
    return new Promise((resolve, reject) => {
      this.queue.push({ drawing, done: (r) => (r instanceof Error ? reject(r) : resolve(r)) });
      this.pump();
    });
  }

  /** Stops the worker, and every layout waiting on it. */
  close(): void {
    const closed = new Error('the layout worker was closed');
    for (const job of this.queue.splice(0)) job.done(closed);
    const busy = this.busy;
    this.busy = null;
    this.drop();
    if (busy) {
      this.clock.clearTimeout(busy.timer);
      busy.done(closed);
    }
  }

  private pump(): void {
    const job = this.busy ? undefined : this.queue.shift();
    if (!job) return;
    this.busy = job;
    let port: LayoutPort;
    try {
      port = this.port ?? this.started();
    } catch (e) {
      this.settle(job, e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const { ms, sourceBytes } = this.limits();
    job.id = this.next++;
    job.timer = this.clock.setTimeout(() => {
      this.drop(); // the worker may be stuck for ever: stop it, and start afresh for the next layout
      this.settle(job, { reason: 'timed-out', ms });
    }, ms);
    port.postMessage({ id: job.id, drawing: job.drawing, sourceBytes });
  }

  private started(): LayoutPort {
    const port = this.spawn();
    this.port = port;
    this.answered = false;
    port.onmessage = ({ data }) => {
      const job = this.busy;
      if (port !== this.port || !job || data.id !== job.id) return;
      this.answered = true;
      this.settle(job, 'drawn' in data ? data.drawn : 'refusal' in data ? data.refusal : new Error(data.error));
    };
    port.onerror = (why) => {
      if (port !== this.port) return;
      const job = this.busy;
      const neverStarted = !this.answered;
      this.drop();
      if (neverStarted && this.fallback) this.fallBack(why, job);
      else if (job) this.settle(job, new Error(`the layout worker failed: ${String(why)}`));
    };
    return port;
  }

  /** A worker that could not start at all: lays out with the fallback from now on, says so once, and retries the layout. */
  private fallBack(why: unknown, job: Job | null): void {
    const { spawn, told } = this.fallback as Fallback;
    this.fallback = undefined;
    this.spawn = spawn;
    told(why);
    if (!job) return;
    this.clock.clearTimeout(job.timer);
    this.busy = null;
    this.queue.unshift(job);
    this.pump();
  }

  private settle(job: Job, result: Drawn | Refusal | Error): void {
    this.clock.clearTimeout(job.timer);
    if (this.busy === job) this.busy = null;
    job.done(result);
    this.pump();
  }

  private drop(): void {
    this.port?.terminate();
    this.port = null;
  }
}
