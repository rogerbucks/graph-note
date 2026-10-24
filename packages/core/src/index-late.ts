// The newest names the core's entry exports, from the certainty drawn on (editor spec §28) to the lenses (editor spec
// §33). Kept apart from index.ts so each file stays short.
export { CERTAINTY_LEVELS, CERTAINTY_LOOKS, certaintyLevel } from './certainty-drawn.ts';
export type { CertaintyLevel, CertaintyLook } from './certainty-drawn.ts';
export {
  acceptLens,
  lensLibrary,
  lensText,
  proposeLens,
  readyLenses,
  writeLens,
  type LensDraft,
  type LensOrigin,
  type LensProposal,
  type LibraryLens,
} from './lens-library.ts';
export {
  DORMANT_DAYS,
  RECENT_COUNT,
  findLenses,
  lensFreshness,
  recentLenses,
  type LensFreshness,
  type LensRun,
} from './lens-freshness.ts';
