// The layout engine kept apart from the interface (spec §9, layout_contained): the drawing instructions are written and
// Graphviz run in a worker, behind the limits of layout-limits.ts, so a huge or hostile graph never freezes the page. The
// core holds both sides of the talk — the worker's (serveLayouts) and the page's (LayoutRunner) — and is handed the port
// between them, so it stays host-free: the plugin gives it a Web Worker, a test a fake or a thread. The worker draws with
// render.ts's own steps, so a drawing is byte for byte the same wherever it is laid out (spec §12, layout_byte_identical).
import type { GraphDrawing } from './note-reading.ts';
import { chosen, directions } from './render.ts';
import type { Drawn, Engine } from './render.ts';
import { counted, LAYOUT_LIMITS, measured, PAGE_LIMITS } from './layout-limits.ts';
import type { LayoutLimits, Refusal } from './layout-limits.ts';

/** What the page asks the worker: one drawing laid out, and the most drawing instructions it may write for it. */
export interface LayoutRequest {
  id: number;
  drawing: GraphDrawing;
  sourceBytes: number;
}

/**
 * What the worker says: once, as it starts, that its engine is ready or why it failed; then, to each request, the drawing,
 * the source limit it was over, or what went wrong.
 */
export type LayoutReply =
  | { ready: true }
  | { ready: false; error: string }
  | { id: number; drawn: Drawn }
  | { id: number; refusal: Refusal }
  | { id: number; error: string };

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

/** What the runner says once, to be told to a person: that layouts moved to the page, or stopped. */
export type Told = 'on-the-page' | 'stopped';

/** How the runner is set up by its host. */
export interface RunnerOptions {
  /** Starts a worker. Absent, or throwing, where none can run. */
  worker?: () => LayoutPort;
  /** A port to the engine on the page's own thread, for where no worker can run. */
  page: () => LayoutPort;
  clock: Clock;
  /** The limits in a worker, read for each drawing, so a setting can change them. */
  limits?: () => LayoutLimits;
  /** The limits on the page's own thread. */
  pageLimits?: () => LayoutLimits;
  /** Told once when the layout moves to the page, and once when layouts stop. */
  told?: (what: Told, why?: unknown) => void;
}

/** How many layouts in a row may time out before no more workers are started. */
export const TIMEOUTS_BEFORE_STOPPING = 3;

/**
 * The worker's side: starts its engine at once and says when it is ready, or why it failed; then writes each drawing's
 * instructions, refuses one over the source limit, and lays the rest out.
 */
export function serveLayouts(scope: LayoutScope, load: () => Promise<Engine>): void {
  const engine = Promise.resolve().then(load);
  scope.onmessage = ({ data: { id, drawing, sourceBytes } }) => {
    const answer = async (): Promise<LayoutReply> => {
      const laid = directions(drawing);
      const refusal = measured(laid, sourceBytes);
      if (refusal) return { id, refusal };
      const e = await engine;
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
      (e: unknown) => scope.postMessage({ id, error: said(e) }),
    );
  };
  engine.then(
    () => scope.postMessage({ ready: true }),
    (e: unknown) => scope.postMessage({ ready: false, error: said(e) }),
  );
}

const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

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
  owner: object | undefined;
  done: (result: Drawn | Refusal | Error | null) => void;
  id?: number;
  timer?: unknown;
}

/**
 * The page's side: lays drawings out in one worker, reused, one layout at a time. A worker says when its engine is ready,
 * and only then is a layout handed to it, given the time limit from that moment, so neither a cold start nor a wait
 * behind a stuck layout is charged to it. A worker past the limit is terminated, and the next layout starts a fresh one;
 * after TIMEOUTS_BEFORE_STOPPING in a row, none is started again. Only when the first worker cannot start, or its engine
 * fails, do layouts move to the page's own thread — never one already handed to a worker.
 */
export class LayoutRunner {
  private readonly o: RunnerOptions;
  private port: LayoutPort | null = null;
  private ready = false;
  private startTimer: unknown = null;
  private everReady = false;
  private onPage = false;
  /** Layouts in a row that timed out, or whose worker could not start: at TIMEOUTS_BEFORE_STOPPING, none is started. */
  private failures = 0;
  private busy: Job | null = null;
  private readonly queue: Job[] = [];
  private next = 1;

  constructor(options: RunnerOptions) {
    this.o = options;
    if (!options.worker) this.toPage(null);
  }

  private limits(): LayoutLimits {
    return this.onPage ? (this.o.pageLimits?.() ?? PAGE_LIMITS) : (this.o.limits?.() ?? LAYOUT_LIMITS);
  }

  /**
   * The drawing, laid out and themed; or why it is not drawn; or null when it is no longer wanted — superseded by a newer
   * drawing for the same `owner` before its layout started, or the runner closed. Rejects when the engine fails.
   */
  draw(drawing: GraphDrawing, owner?: object): Promise<Drawn | Refusal | null> {
    if (owner)
      for (const old of this.queue.filter((j) => j.owner === owner)) {
        this.queue.splice(this.queue.indexOf(old), 1);
        old.done(null);
      }
    const over = counted(drawing, this.limits());
    if (over) return Promise.resolve(this.paged(over));
    if (this.isStopped()) return Promise.resolve(this.stopped());
    return new Promise((resolve, reject) => {
      this.queue.push({ drawing, owner, done: (r) => (r instanceof Error ? reject(r) : resolve(r)) });
      this.pump();
    });
  }

  /** Stops the worker, and answers every layout waiting on it with null: no longer wanted. */
  close(): void {
    for (const job of this.queue.splice(0)) job.done(null);
    const busy = this.busy;
    this.busy = null;
    this.drop();
    if (busy) {
      this.o.clock.clearTimeout(busy.timer);
      busy.done(null);
    }
  }

  private isStopped(): boolean {
    return !this.onPage && this.failures >= TIMEOUTS_BEFORE_STOPPING;
  }

  private stopped(): Refusal {
    return { reason: 'stopped', failures: this.failures };
  }

  /** A size refusal, marked as the page's when the page's tighter limits applied. */
  private paged(r: Refusal): Refusal {
    return this.onPage && r.reason === 'too-large' ? { ...r, page: true } : r;
  }

  private pump(): void {
    if (this.busy || !this.queue.length || this.isStopped()) return;
    if (!this.port) this.start();
    if (!this.port || !this.ready) return; // a job waits for the engine to be ready: a cold start is not its time
    const job = this.queue.shift() as Job;
    this.busy = job;
    const { ms, sourceBytes } = this.limits();
    job.id = this.next++;
    job.timer = this.o.clock.setTimeout(() => {
      this.drop(); // the worker may be stuck for ever: stop it, and start afresh for the next layout
      this.failed(job, { reason: 'timed-out', ms });
    }, ms);
    this.port.postMessage({ id: job.id, drawing: job.drawing, sourceBytes });
  }

  /** Starts a worker, or the page's port; the first that cannot start sends layouts to the page from then on. */
  private start(): void {
    let port: LayoutPort;
    try {
      port = this.onPage || !this.o.worker ? this.o.page() : this.o.worker();
    } catch (e) {
      this.failedToStart(e);
      return;
    }
    this.port = port;
    this.ready = false;
    this.startTimer = this.o.clock.setTimeout(() => {
      if (port === this.port && !this.ready) this.failedToStart(new Error('the layout engine took too long to start'));
    }, this.limits().startMs);
    port.onmessage = ({ data }) => {
      if (port !== this.port) return;
      if ('ready' in data) {
        this.o.clock.clearTimeout(this.startTimer);
        if (data.ready) {
          this.ready = this.everReady = true;
          this.pump();
        } else this.failedToStart(new Error(data.error));
        return;
      }
      const job = this.busy;
      if (!job || data.id !== job.id) return;
      this.failures = 0;
      this.settle(
        job,
        'drawn' in data ? data.drawn : 'refusal' in data ? this.paged(data.refusal) : new Error(data.error),
      );
    };
    port.onerror = (why) => {
      if (port !== this.port) return;
      if (!this.ready) {
        this.failedToStart(why);
        return;
      }
      // a worker that fails while laying out: its layout fails, never retried anywhere, and the next starts a fresh one
      const job = this.busy;
      this.drop();
      if (job) this.settle(job, new Error(`the layout worker failed: ${said(why)}`));
      else this.pump();
    };
  }

  /**
   * A worker that could not start. The first ever sends layouts to the page from then on: none had been handed to it. A
   * later one, replacing a worker that timed out, fails the layout waiting for it, and counts as a failure in a row; and
   * on the page, the engine's own failure fails the layout waiting, as a loud fallback.
   */
  private failedToStart(why: unknown): void {
    this.o.clock.clearTimeout(this.startTimer);
    this.drop();
    if (!this.everReady && !this.onPage) {
      this.toPage(why);
      this.pump();
      return;
    }
    const job = this.queue.shift();
    const error = new Error(`the layout engine could not start: ${said(why)}`);
    if (this.onPage) {
      if (job) this.settle(job, error);
    } else if (job) this.failed(job, error);
    else if (++this.failures === TIMEOUTS_BEFORE_STOPPING) this.o.told?.('stopped', this.failures);
  }

  private toPage(why: unknown): void {
    this.onPage = true;
    this.o.told?.('on-the-page', why);
  }

  /**
   * A layout that timed out, or whose replacement worker could not start: one more failure in a row. At the last one
   * allowed, no worker is started again, and every layout waiting is told so.
   */
  private failed(job: Job, result: Refusal | Error): void {
    this.failures++;
    if (!this.isStopped()) {
      this.settle(job, result);
      return;
    }
    this.o.clock.clearTimeout(job.timer);
    if (this.busy === job) this.busy = null;
    job.done(result);
    this.o.told?.('stopped', this.failures);
    for (const waiting of this.queue.splice(0)) waiting.done(this.stopped());
  }

  private settle(job: Job, result: Drawn | Refusal | Error | null): void {
    this.o.clock.clearTimeout(job.timer);
    if (this.busy === job) this.busy = null;
    job.done(result);
    this.pump();
  }

  private drop(): void {
    this.o.clock.clearTimeout(this.startTimer); // a worker put away before it was ready is not waited for
    this.port?.terminate();
    this.port = null;
    this.ready = false;
  }
}
