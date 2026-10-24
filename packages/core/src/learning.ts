// What is learned about a person over time (editor spec §39, profiles_at_display and learning_review_lens). Nothing
// learned changes a profile on its own: it arrives as a suggestion, and applies only once the owner approves it. A
// private review lens shows everything learned and applied. Each item rolls back in one tap, and clear-all takes them
// all away.
import { composeProfiles, type ProfileSettings } from './profiles.ts';

/** A setting learned: which, the value, and why it was suggested, in the person's terms. */
export interface LearnedSuggestion {
  id: string;
  setting: keyof ProfileSettings;
  value: ProfileSettings[keyof ProfileSettings];
  /** What it was learned from, such as `stepped back often`. */
  why: string;
}

/** One person's learning as kept between sessions. */
export interface LearnedKept {
  waiting: LearnedSuggestion[];
  applied: LearnedSuggestion[];
}

/** One person's learning: what waits on them, and what they approved. Private to them. */
export class ProfileLearning {
  #waiting: LearnedSuggestion[] = [];
  #applied: LearnedSuggestion[] = [];

  /** The learning as it was kept: what waited and what was approved. */
  constructor(kept?: LearnedKept) {
    this.#waiting = (kept?.waiting ?? []).map((s) => ({ ...s }));
    this.#applied = (kept?.applied ?? []).map((s) => ({ ...s }));
  }

  /** What to keep, in the owner's own data, to read the learning back next time. */
  kept(): LearnedKept {
    return { waiting: this.waiting, applied: this.review() };
  }

  /** Something learned: it waits as a suggestion; nothing changes until it is approved. */
  suggest(s: LearnedSuggestion): void {
    if (this.#waiting.some((w) => w.id === s.id) || this.#applied.some((a) => a.id === s.id)) return;
    this.#waiting.push({ ...s });
  }

  /** The suggestions waiting on the owner, in the order learned. */
  get waiting(): LearnedSuggestion[] {
    return this.#waiting.map((s) => ({ ...s }));
  }

  /** The owner approves a suggestion: it is learned, and applies from now on. */
  approve(id: string): boolean {
    const at = this.#waiting.findIndex((s) => s.id === id);
    if (at < 0) return false;
    this.#applied.push(...this.#waiting.splice(at, 1));
    return true;
  }

  /** The owner turns a suggestion down: it goes, and nothing changes. */
  decline(id: string): boolean {
    const was = this.#waiting.length;
    this.#waiting = this.#waiting.filter((s) => s.id !== id);
    return this.#waiting.length < was;
  }

  /** The private review lens: every item learned and applied, in the order approved. */
  review(): LearnedSuggestion[] {
    return this.#applied.map((s) => ({ ...s }));
  }

  /** One learned item taken back. */
  rollback(id: string): boolean {
    const was = this.#applied.length;
    this.#applied = this.#applied.filter((s) => s.id !== id);
    return this.#applied.length < was;
  }

  /** Everything learned taken back at once. */
  clearAll(): void {
    this.#applied = [];
    this.#waiting = [];
  }

  /** The profile with what was learned and approved applied over it. */
  applyTo(profile: ProfileSettings): ProfileSettings {
    return composeProfiles(profile, ...this.#applied.map((s) => ({ [s.setting]: s.value })));
  }
}
