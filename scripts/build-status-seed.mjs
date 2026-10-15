// The first values of Build status and the built-in Status for the mirror (spec §12, requirements_checked_in_ci): an item that
// has none is not "not started" just because nothing has set it. Where its requirement stands on GitHub says more. Proved
// on main and proved by the copy of a published release: Released and Done. Proved on main only: Merged and Done. Held by an
// open pull request of this repository, by its copy's diff or its Requirements line (the rules of build-status-events.mjs):
// In PR and In Progress. Otherwise nothing, which is Not started and Todo. A draft release is not published and is never read.
// Only the seed is worked out here; the mirror gives it only to an item with no value (or, for Status, with Todo, which is
// the board's default), so a value already set is never overwritten and nothing moves back from Released or Done.
import { claimsOf, boardAt, skipReason } from './build-status-events.mjs';
import { Unreadable, openPullNumbers, publishedReleases, readPullRequest } from './build-status-gh.mjs';

const RELEASED = { buildStatus: 'Released', progress: 'Done' };
const MERGED = { buildStatus: 'Merged', progress: 'Done' };
const HELD = { buildStatus: 'In PR', progress: 'In Progress' };
/** The most published releases read, newest first, to find what each proves. */
const MAX_RELEASES = 30;

/** The ids proved on main that the copy of a published release proves too, reading releases newest first. */
function releasedIds(run, repo, proved, warnings) {
  const left = new Set(proved);
  const released = new Set();
  for (const { tag } of publishedReleases(run, repo).reverse().slice(0, MAX_RELEASES)) {
    if (!left.size) break;
    let board;
    try {
      board = boardAt(run, repo, tag);
    } catch (e) {
      if (!(e instanceof Unreadable)) throw e;
      warnings.push(`release ${tag}: ${e.message}, so it releases nothing here`);
      continue;
    }
    for (const r of board.requirements)
      if (left.has(r.id) && r.status === 'proved') {
        left.delete(r.id);
        released.add(r.id);
      }
  }
  return released;
}

/** The ids the open pull requests of this repository hold: what their copies prove, and what their lines name while the copy has not landed. */
function heldIds(run, repo, warnings) {
  const held = new Set();
  for (const number of openPullNumbers(run, repo)) {
    const pr = readPullRequest(run, repo, number);
    if (skipReason(pr, repo)) continue;
    try {
      const { proved, claimed, landed } = claimsOf(pr, { repo }, { github: run });
      for (const id of [...proved, ...(landed ? [] : claimed)]) held.add(id);
    } catch (e) {
      if (!(e instanceof Unreadable)) throw e;
      warnings.push(`pull request #${number}: ${e.message}, so it holds nothing here`);
    }
  }
  return held;
}

/**
 * The seed for the requirements of `board` (as readBoard gives the requirements file the mirror reads, taken as main's):
 * {seed: Map from a requirement id to {buildStatus, progress}, warnings}. An id with no entry is Not started and Todo.
 */
export function seedOf(run, repo, board, { write = () => {} } = {}) {
  const warnings = [];
  const proved = board.requirements.filter((r) => r.status === 'proved').map((r) => r.id);
  const released = releasedIds(run, repo, proved, warnings);
  const seed = new Map();
  for (const id of heldIds(run, repo, warnings)) seed.set(id, HELD);
  for (const id of proved) seed.set(id, released.has(id) ? RELEASED : MERGED);
  for (const w of warnings) write(`warning: ${w}\n`);
  return { seed, warnings };
}
