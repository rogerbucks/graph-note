// How often and how lately each lens is run (editor spec §33, lens_freshness). A lens is found by how often and how
// recently it was run, and by the topics it touches. One unopened for months shows as dormant. Freshness is kept apart
// from certainty: a dormant lens is no less certain. The recent view shows the five most used. Everything here is
// worked out when asked, from the log of runs, and never stored.
import type { LibraryLens } from './lens-library.ts';

/** One time a lens was run: its id, and when, as an ISO date or time. */
export interface LensRun {
  lens: string;
  at: string;
}

/** How fresh a lens is: how many runs, the last one, and whether it is dormant. It holds no certainty. */
export interface LensFreshness {
  lens: string;
  runs: number;
  last: string | null;
  dormant: boolean;
}

/** A lens unopened for this many days, or never opened, is dormant. */
export const DORMANT_DAYS = 90;
/** How many lenses the recent view shows. */
export const RECENT_COUNT = 5;

const DAY = 24 * 60 * 60 * 1000;

/** How fresh one lens is at `now`. */
export function lensFreshness(lens: string, runs: readonly LensRun[], now: string): LensFreshness {
  const mine = runs.filter((r) => r.lens === lens).map((r) => r.at);
  const last = mine.length ? mine.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null;
  const dormant = last === null || Date.parse(now) - Date.parse(last) > DORMANT_DAYS * DAY;
  return { lens, runs: mine.length, last, dormant };
}

/** The most used lenses, the most used first, then the most recent, then by id. Worked out each time it is asked. */
export function recentLenses(runs: readonly LensRun[], now: string, count = RECENT_COUNT): LensFreshness[] {
  const ids = [...new Set(runs.map((r) => r.lens))];
  return ids
    .map((id) => lensFreshness(id, runs, now))
    .sort(
      (a, b) => b.runs - a.runs || Date.parse(b.last ?? '') - Date.parse(a.last ?? '') || (a.lens < b.lens ? -1 : 1),
    )
    .slice(0, count);
}

/**
 * The library's lenses found by topic, if one is given, and sorted: `often` by how many runs, `recent` by the last
 * run. Each comes with its freshness beside it, never folded into the lens.
 */
export function findLenses(
  library: readonly LibraryLens[],
  runs: readonly LensRun[],
  now: string,
  options: { topic?: string; by?: 'often' | 'recent' } = {},
): { lens: LibraryLens; freshness: LensFreshness }[] {
  const by = options.by ?? 'often';
  const last = (f: LensFreshness) => (f.last === null ? -Infinity : Date.parse(f.last));
  return library
    .filter((l) => options.topic === undefined || l.topics.includes(options.topic))
    .map((lens) => ({ lens, freshness: lensFreshness(lens.id, runs, now) }))
    .sort((a, b) => {
      const often = b.freshness.runs - a.freshness.runs,
        recent = last(b.freshness) - last(a.freshness);
      return (by === 'often' ? often || recent : recent || often) || (a.lens.id < b.lens.id ? -1 : 1);
    });
}
