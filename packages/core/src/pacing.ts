// Pacing worked out from the session (editor spec §39, pacing_automatic). Pacing is read from what happens in this
// session alone, never from elsewhere. Each change has a reason the person can see. It applies at once, with an
// indicator, and one tap overrides it. An override feeds back: the signal that caused it counts for less from then
// on. A change to the profile itself is only ever suggested, and waits for the owner's approval (learning.ts).
import type { LearnedSuggestion } from './learning.ts';
import type { Pacing } from './profiles.ts';

/** What the session shows: stepping back, skipping ahead, or a long pause. */
export type PacingSignal = 'stepped-back' | 'skipped-ahead' | 'paused-long';

/** What each signal asks for when it repeats: slower or faster. */
const ASKS: Record<PacingSignal, Pacing> = { 'stepped-back': 'calm', 'paused-long': 'calm', 'skipped-ahead': 'brisk' };
/** How many times in a row a signal must come before the pace changes. */
export const PACING_SIGNALS_NEEDED = 3;

/** The pace now: what it is, why, and whether it is the person's own or worked out. */
export interface PaceShown {
  pacing: Pacing;
  /** The signal that set it, or null for the profile's own pace. */
  reason: PacingSignal | null;
  overridden: boolean;
}

/** The pace of one session: from the profile, changed by what the session shows, overridden in one tap. */
export class PacingDetector {
  readonly usual: Pacing;
  #shown: PaceShown;
  #run: { signal: PacingSignal; count: number } | null = null;
  /** How many of each signal it now takes, raised each time an override says it was wrong. */
  #needed: Record<PacingSignal, number> = {
    'stepped-back': PACING_SIGNALS_NEEDED,
    'skipped-ahead': PACING_SIGNALS_NEEDED,
    'paused-long': PACING_SIGNALS_NEEDED,
  };
  #suggested = new Set<string>();

  constructor(usual: Pacing) {
    this.usual = usual;
    this.#shown = { pacing: usual, reason: null, overridden: false };
  }

  /** The pace now, with its reason. */
  get shown(): PaceShown {
    return { ...this.#shown };
  }

  /** How many of a signal it takes now. */
  needed(signal: PacingSignal): number {
    return this.#needed[signal];
  }

  /** One signal from the session. Enough in a row change the pace at once, unless the person overrode it. */
  signal(s: PacingSignal): PaceShown {
    this.#run = this.#run?.signal === s ? { signal: s, count: this.#run.count + 1 } : { signal: s, count: 1 };
    if (!this.#shown.overridden && this.#run.count >= this.#needed[s] && ASKS[s] !== this.#shown.pacing)
      this.#shown = { pacing: ASKS[s], reason: s, overridden: false };
    return this.shown;
  }

  /** One tap: back to the usual pace for the session. The signal that changed it counts for less from now on. */
  override(): PaceShown {
    const reason = this.#shown.reason;
    if (reason) this.#needed[reason] += PACING_SIGNALS_NEEDED;
    this.#shown = { pacing: this.usual, reason: null, overridden: true };
    this.#run = null;
    return this.shown;
  }

  /** The change to the profile itself this session suggests, if any: it waits for the owner's approval. */
  suggestion(): LearnedSuggestion | null {
    const { pacing, reason } = this.#shown;
    if (reason === null || pacing === this.usual) return null;
    const id = `pacing:${pacing}:${reason}`;
    if (this.#suggested.has(id)) return null;
    this.#suggested.add(id);
    return { id, setting: 'pacing', value: pacing, why: reason };
  }
}
