// The numbers a rule leaves open (editor spec §41, thresholds_named): where a requirement says "more than a set number",
// "at a pace the user sets" or leaves a limit to the build, the number is named here once, with its default, the
// least and most it may be, its unit and what it governs, and the requirement it serves. Code reads the default from
// here, and a value handed in from a setting or a caller is taken only inside its range, else the default stands.
// Rules of later slices add their own entries as they are built (type_suggestion_bundle, centroid_cycle_guard).

/** One open number: its default, the least and most it may be, its unit, what it governs, and the rule that leaves it open. */
export interface Threshold {
  value: number;
  least: number;
  most: number;
  unit: string;
  said: string;
  requirement: string;
}

/** Every open number, by its name. */
export const THRESHOLDS = {
  busy_hub: {
    value: 12,
    least: 2,
    most: 1000,
    unit: 'links',
    said: 'A thing with more links than this is a busy hub, whose links can be folded into one stub.',
    requirement: 'untangle_hubs',
  },
  path_pace: {
    value: 2000,
    least: 500,
    most: 4000,
    unit: 'milliseconds',
    said: 'How long Play shows each step of a path until the user sets another pace.',
    requirement: 'path_autoplay',
  },
  reread_budget: {
    value: 4_000_000,
    least: 100_000,
    most: 100_000_000,
    unit: 'UTF-16 units',
    said: 'How much of a block may be read again to leave out its unreadable parts one by one before the rest is left out at once.',
    requirement: 'drawn_in_part',
  },
  diff_limit: {
    value: 2000,
    least: 1,
    most: 100_000,
    unit: 'lines',
    said: 'The most lines added and removed that a review compares line by line.',
    requirement: 'github_review_items',
  },
} satisfies Record<string, Threshold>;

/** The name of an open number. */
export type ThresholdName = keyof typeof THRESHOLDS;

/** The value to use for `name`: `given` when it is a finite number inside the range, else the default. */
export function thresholdValue(name: ThresholdName, given?: unknown): number {
  const t: Threshold = THRESHOLDS[name];
  return typeof given === 'number' && Number.isFinite(given) && given >= t.least && given <= t.most ? given : t.value;
}
