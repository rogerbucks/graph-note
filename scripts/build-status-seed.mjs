// The first values of Build status and the built-in Status for the mirror (spec §12, requirements_checked_in_ci). An
// item that has none is not "not started" just because nothing has set it. Where its requirement stands on GitHub says
// more. Proved on main and proved by the copy of a published release: Released and Done. Proved on main only: Merged
// and Done. Held by an open pull request of this repository, by its copy's diff or its Requirements line (the rules of
// build-status-events.mjs): In PR and In Progress, with the day the earliest of those pull requests was opened as its
// Started on. Otherwise nothing, which is Not started and Todo, and no Started on. A draft release is not published and
// is never read. Only the seed is worked out here. The mirror gives it only to an item with no value, or, for Status,
// with Todo, which is the board's default. So a value already set is never overwritten, and nothing moves back from
// Released or Done.
import { DEFAULT_BRANCH } from './build-status.mjs';
import { claimsOf, boardAt, skipReason } from './build-status-events.mjs';
import { Unreadable, openPullNumbers, publishedReleases, readPullRequest } from './build-status-gh.mjs';

const RELEASED = { buildStatus: 'Released', progress: 'Done' };
const MERGED = { buildStatus: 'Merged', progress: 'Done' };
const HELD = { buildStatus: 'In PR', progress: 'In Progress' };
/** The most published releases read, newest first, to find what each proves. */
const MAX_RELEASES = 30;

/** The earlier of two days (YYYY-MM-DD), either of which may be missing. */
const earlier = (a, b) => (a && b ? (a < b ? a : b) : (a ?? b ?? null));

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

/**
 * The ids the open pull requests of this repository hold: what their copies prove, and what their lines name while the
 * copy has not landed. Given as a Map from each to the earliest day one of them was opened, or null where GitHub gave
 * none.
 */
function heldIds(run, repo, warnings) {
  const held = new Map();
  for (const number of openPullNumbers(run, repo)) {
    const pr = readPullRequest(run, repo, number);
    if (skipReason(pr, repo)) continue;
    try {
      const { proved, claimed, landed } = claimsOf(pr, { repo }, { github: run });
      for (const id of [...proved, ...(landed ? [] : claimed)]) held.set(id, earlier(held.get(id), pr.createdAt));
    } catch (e) {
      if (!(e instanceof Unreadable)) throw e;
      warnings.push(`pull request #${number}: ${e.message}, so it holds nothing here`);
    }
  }
  return held;
}

/** The ids proved on main, read through the API, so the seed does not depend on the branch the mirror is run from. */
function provedOnMain(run, repo, warnings) {
  try {
    return boardAt(run, repo, DEFAULT_BRANCH)
      .requirements.filter((r) => r.status === 'proved')
      .map((r) => r.id);
  } catch (e) {
    if (!(e instanceof Unreadable)) throw e;
    warnings.push(`${DEFAULT_BRANCH}: ${e.message}, so nothing is taken to be proved on it`);
    return [];
  }
}

/**
 * The seed for the requirements, from where each stands on GitHub: {seed: Map from a requirement id to {buildStatus,
 * progress, startedOn}, warnings}. What is proved on main is read from main through the API. An id with no entry is Not
 * started and Todo, and has no Started on. A held one's startedOn is the earliest day an open pull request holding it
 * was opened. A proved one's is undefined, as its Started on is kept. A requirements file that cannot be read (main's,
 * a release's, a pull request's) is a warning. The seed leaves out what it would have shown. The mirror stops an apply
 * on warnings unless it is told to go on.
 */
export function seedOf(run, repo, { write = () => {} } = {}) {
  const warnings = [];
  const proved = provedOnMain(run, repo, warnings);
  const released = releasedIds(run, repo, proved, warnings);
  const seed = new Map();
  for (const [id, day] of heldIds(run, repo, warnings)) seed.set(id, day ? { ...HELD, startedOn: day } : HELD);
  for (const id of proved) seed.set(id, released.has(id) ? RELEASED : MERGED);
  for (const w of warnings) write(`warning: ${w}\n`);
  return { seed, warnings };
}
