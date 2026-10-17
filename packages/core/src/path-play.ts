// Play stepping through a walked path on its own (editor spec §7, path_autoplay): from the step it is on, one step at the
// pace the user sets, until the last step, where it stops; paused or stopped at any step, and played on from where it
// was paused. A step taken by hand pauses it. The host hands in its timer (`Scheduler`), so the core never waits on a
// clock and a host clears the timer when its card goes; how the moving highlight is drawn, and that it moves at once
// under reduced motion, is the host's (motion_reduced_respected).
import type { PathPlayer } from './paths.ts';
import { THRESHOLDS, thresholdValue } from './thresholds.ts';

/** The paces Play may step at: how long each step is shown, in milliseconds. */
export const PATH_PACES = [500, 1000, 2000, 4000] as const;

/** The pace Play steps at until the user sets another: two seconds a step, time to read it (`path_pace`). */
export const DEFAULT_PACE = THRESHOLDS.path_pace.value;

/** A host's timer: `after` runs `run` once, `ms` from now, and gives a handle that `cancel` takes back. */
export interface Scheduler {
  after(ms: number, run: () => void): unknown;
  cancel(handle: unknown): void;
}

/** A pace said in words, as a choice of it reads: "Half a second a step", "2 seconds a step". */
export function paceSaid(ms: number): string {
  if (ms === 500) return 'Half a second a step';
  const s = ms / 1000;
  return `${s} second${s === 1 ? '' : 's'} a step`;
}

/** Playing a path on its own, step by step at a pace, around a `PathPlayer` that says each step. */
export class PathAutoplay {
  /** Called after each step taken on its own, so the host marks it and says it. */
  onStep: (() => void) | null = null;
  /** The player that says each step, and which step is on. */
  readonly player: PathPlayer;
  private readonly scheduler: Scheduler;
  private handle: unknown = null;
  private paceMs: number;
  private ended = false;

  constructor(player: PathPlayer, scheduler: Scheduler, pace: number = DEFAULT_PACE) {
    this.player = player;
    this.scheduler = scheduler;
    this.paceMs = thresholdValue('path_pace', pace);
  }

  /** Whether `ms` is a pace inside `path_pace`'s range. */
  private static isPace(ms: number): boolean {
    const { least, most } = THRESHOLDS.path_pace;
    return typeof ms === 'number' && Number.isFinite(ms) && ms >= least && ms <= most;
  }

  /** Whether it is stepping on its own now. */
  get playing(): boolean {
    return this.handle !== null;
  }

  /** Whether it was stopped: then it plays no more. */
  get stopped(): boolean {
    return this.ended;
  }

  /** How long each step is shown, in milliseconds. */
  get pace(): number {
    return this.paceMs;
  }

  /** Sets the pace, taken at once: a step waiting now waits the new pace. A pace that is no length of time is ignored. */
  setPace(ms: number): void {
    if (!PathAutoplay.isPace(ms)) return;
    this.paceMs = ms;
    if (this.playing) this.wait();
  }

  /** Plays on from the step it is on; from the first again when it is on the last. Nothing once stopped. */
  play(): void {
    if (this.ended) return;
    if (this.player.atEnd) this.player.restart();
    if (this.player.atEnd) this.pause();
    else this.wait();
  }

  /** Pauses on the step it is on. */
  pause(): void {
    if (this.handle !== null) this.scheduler.cancel(this.handle);
    this.handle = null;
  }

  /** Stops at the step it is on, for good: the host takes the playing away. */
  stop(): void {
    this.pause();
    this.ended = true;
  }

  /** On to the next step by hand, pausing; false, and no move, at the end. */
  next(): boolean {
    this.pause();
    return this.player.next();
  }

  /** Back a step by hand, pausing; false, and no move, at the start. */
  previous(): boolean {
    this.pause();
    return this.player.previous();
  }

  private wait(): void {
    this.pause();
    this.handle = this.scheduler.after(this.paceMs, () => this.tick());
  }

  private tick(): void {
    this.handle = null;
    if (this.ended || !this.player.next()) return;
    if (!this.player.atEnd) this.wait();
    this.onStep?.();
  }
}
