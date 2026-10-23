// The trail of a massive graph's exploring (editor spec §53, scale_explore_trail). Roger, 22 Oct 2026: keep a trail of
// what the user opened, flew to and filtered. Back and forward steps reach any earlier picture again.
//
// It works as a browser's history does. Each step is a whole picture, kept as it was. Back and forward move along the
// trail and give that picture back. A new step after going back drops the steps ahead of it. The oldest steps go first
// once the trail is full.
//
// Host-free and pure. The trail never makes a picture: the view gives it each one, and draws the one it gives back.

/** The most steps a trail keeps. Past this, the oldest goes. */
export const TRAIL_MOST = 50;

/** The steps taken while exploring, and where along them the view is. */
export class Trail<T> {
  private readonly steps: T[] = [];
  private at = -1;
  private readonly most: number;

  constructor(most = TRAIL_MOST) {
    this.most = Math.max(1, most);
  }

  /** The step the view is at, or undefined before the first. */
  get now(): T | undefined {
    return this.steps[this.at];
  }

  /** Whether there is a step to go back to. */
  get canBack(): boolean {
    return this.at > 0;
  }

  /** Whether there is a step to go forward to. */
  get canForward(): boolean {
    return this.at < this.steps.length - 1;
  }

  /** How many steps it keeps. */
  get length(): number {
    return this.steps.length;
  }

  /** Takes a new step: the steps ahead, if the view went back, are dropped. */
  push(step: T): void {
    this.steps.splice(this.at + 1, Infinity, step);
    if (this.steps.length > this.most) this.steps.splice(0, this.steps.length - this.most);
    this.at = this.steps.length - 1;
  }

  /** Goes one step back and gives that step, or undefined at the start. */
  back(): T | undefined {
    if (!this.canBack) return undefined;
    return this.steps[--this.at];
  }

  /** Goes one step forward and gives that step, or undefined at the end. */
  forward(): T | undefined {
    if (!this.canForward) return undefined;
    return this.steps[++this.at];
  }
}
