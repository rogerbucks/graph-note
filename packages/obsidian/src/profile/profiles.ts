// The person's own profile in Obsidian (editor spec §39). It is kept with the plugin's data, the personal layer, never
// in a note, so no shared or corporate view can read it. It holds what the person set, and what was learned: waiting
// for approval, or approved. The session holds show-as-shared and the pace of this session; neither is ever saved.
import { PacingDetector, ProfileLearning, SHARED_SETTINGS, composeProfiles, profileOf } from '@thoughtknot/core';
import type { LearnedKept, LearnedSuggestion, ProfileSettings } from '@thoughtknot/core';
import type { ProfileShown } from '@thoughtknot/core/display/graph-view/profile-shown';

/** The profile as kept with the plugin's data. */
export interface KeptProfile {
  settings?: Partial<ProfileSettings>;
  learned?: LearnedKept;
}

/** One person's profile: what they set, what was learned, and this session's switch and pace. */
export class Profiles {
  #set: Partial<ProfileSettings>;
  readonly learning: ProfileLearning;
  /** Show-as-shared: for this session only, never saved, so the next session is adapted again. */
  #shared = false;
  #pacing: PacingDetector;
  /** Draws every card again, once a change to the profile is kept. */
  redraw: () => void = () => undefined;

  constructor(
    kept: KeptProfile | undefined,
    private readonly save: (kept: KeptProfile) => Promise<void>,
  ) {
    this.#set = profileOf(kept?.settings ?? {});
    this.learning = new ProfileLearning(kept?.learned);
    this.#pacing = new PacingDetector(this.settings().pacing);
  }

  /** What the person set, with what they approved of what was learned. */
  settings(): ProfileSettings {
    return this.learning.applyTo(composeProfiles(this.#set));
  }

  /** One setting changed by the person: kept, and every card drawn again. */
  async set(change: Partial<ProfileSettings>): Promise<void> {
    this.#set = profileOf({ ...this.#set, ...change });
    await this.changed();
  }

  /** What was learned, after the person approved, declined, rolled back or cleared: kept, and drawn again. */
  async changed(): Promise<void> {
    this.#pacing = new PacingDetector(this.settings().pacing);
    await this.save({ settings: this.#set, learned: this.learning.kept() });
    this.redraw();
  }

  /** The profile as a card is given it. */
  shown(): ProfileShown {
    const settings = this.settings();
    return {
      settings,
      adapted: JSON.stringify(settings) !== JSON.stringify(composeProfiles(SHARED_SETTINGS)),
      shared: () => this.#shared,
      setShared: (on) => (this.#shared = on),
      pacing: this.#pacing,
      suggest: (s: LearnedSuggestion) => {
        this.learning.suggest(s);
        void this.save({ settings: this.#set, learned: this.learning.kept() });
      },
      today: new Date().toISOString().slice(0, 10),
    };
  }
}
