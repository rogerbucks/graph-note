// What the build status does for one pull request or one release (spec §12, requirements_checked_in_ci): the pull
// requests it looks after and the ones it leaves alone, the requirements a pull request moves or takes on, the stage it
// puts them in on the board (the Build status and the built-in Status), and the one comment it leaves.
// build-status-run.mjs hands it each pull request an event is about. Reading is through build-status-gh.mjs, the board is
// build-status-board.mjs and the pure rules are build-status.mjs.
//
// A pull request moves the requirements whose tests its requirements file newly marks written against the base's (its
// copy). A draft pull request may take items on before its copy proves them, with the line `Requirements: id1, id2` in
// its description; only ids that are plain and are in main's file count, and once the copy proves anything the copy's diff
// decides, an id the line names but the copy does not prove being let go, with a warning in the comment.
import { readBoard } from './slice-board.mjs';
import {
  DEFAULT_BRANCH,
  MAX_IDS,
  commentBody,
  describeProblem,
  movedRequirements,
  nextProgress,
  nextStatus,
  progressOf,
  redactSecrets,
  stageOf,
} from './build-status.mjs';
import {
  Unreadable,
  checkRollup,
  openPullNumbers,
  parentOf,
  readPullRequest,
  readRequirementsAt,
  leaveComment,
  mergedPullNumbers,
  releaseBefore,
} from './build-status-gh.mjs';
import { readBuildBoard, setBuildStatus, setProgress } from './build-status-board.mjs';

const TAG = /^\w[\w.+/-]{0,99}$/;
const NO_BOARD = { sections: [], requirements: [], questions: [] };
const LET_GO = { build: 'Not started', progress: 'Todo' };

/** The requirements file of a ref as a board, or an empty one where there is no file. Throws Unreadable where it cannot be read. */
function boardAt(run, repo, ref) {
  const text = readRequirementsAt(run, repo, ref);
  if (text === null) return NO_BOARD;
  try {
    return readBoard(text);
  } catch (e) {
    // only the line is said: the reader's words may quote the text of a pull request
    const line = Number.isInteger(e.line) ? ` (line ${e.line})` : '';
    throw new Unreadable(`the requirements file at ${ref.slice(0, 12)} could not be read${line}`);
  }
}

/**
 * Why a pull request is left alone, or null: `fork` for one whose head or base is not this repository (it moves nothing and
 * gets no comment), `stale` for one whose head is no longer the commit the checks ran on (`rules.headSha`; its own event
 * looks after it), `not merged` where only a merged one counts (`rules.mergedOnly`), and `not into main` for one merged
 * into another branch, which is not Merged.
 */
export function skipReason(pr, repo, rules = {}) {
  if (pr.headRepo !== repo || pr.baseRepo !== repo) return 'fork';
  if (rules.headSha !== undefined && pr.headSha !== rules.headSha) return 'stale';
  if (rules.mergedOnly && !pr.merged) return 'not merged';
  if (pr.merged && pr.baseRef !== DEFAULT_BRANCH) return 'not into main';
  return null;
}

/**
 * Looks after the board for one event: reads it once, on first need, and once it fails goes on without it, saying so once
 * in a warning. `settle(moves)` does each move, {id, build, progress} (the Build status and the built-in Status to give
 * the requirement's item, either may be left out, both for an item that is only listed), and gives the entries of the
 * comment ({id, number, status}); `problem()` is the text to put in a comment, or null; `url()` is the board's address,
 * once it is read. Each problem is also added to `found`, once.
 */
export function boardKeeper(ctx, deps, found) {
  let board;
  let problem = null;
  const fail = (error) => {
    problem = describeProblem(error, deps.projectToken);
    found.push(problem);
    deps.annotate('warning', problem.text);
  };
  const open = () => {
    if (board !== undefined || problem) return;
    if (!deps.project) return fail(null);
    try {
      board = readBuildBoard(deps.github, deps.project, ctx.repo, { sleep: deps.sleep });
    } catch (e) {
      fail(e);
    }
  };
  const set = (item, id, { build, progress }) => {
    const opts = { sleep: deps.sleep };
    const nextBuild = build && nextStatus(item.current, build);
    if (nextBuild) setBuildStatus(deps.project, board, id, nextBuild, opts);
    const nextDone = progress && nextProgress(item.progress, progress);
    if (nextDone) setProgress(deps.project, board, id, nextDone, opts);
  };
  return {
    problem: () => problem?.text ?? null,
    url: () => (board ? `https://github.com/users/${board.owner}/projects/${board.projectNumber}` : null),
    settle(moves) {
      if (!moves.length) return [];
      open();
      return moves.map((move) => {
        const item = board?.items.get(move.id);
        const issue = board?.issues.get(move.id);
        if (!board) return { id: move.id, number: null, status: null, unknown: true };
        if (problem) return { id: move.id, number: issue?.number ?? null, status: item?.current ?? null };
        if (!item) return { id: move.id, number: issue?.number ?? null, status: null };
        try {
          set(item, move.id, move);
        } catch (e) {
          fail(e);
        }
        return { id: move.id, number: item.number, status: item.current };
      });
    },
  };
}

/**
 * What a pull request takes on, as {proved, claimed, landed}: `proved` the requirements its copy newly proves (against the
 * base branch's file, or for a merged one its merge commit against that commit's first parent), `claimed` the ones its
 * Requirements line names that are in the base's file and not proved, and `landed` whether its copy proves anything yet.
 * Throws Unreadable where a file cannot be read.
 */
function claimsOf(pr, ctx, deps) {
  if (pr.merged && !pr.mergeSha) throw new Unreadable('the merge commit of the pull request is not known');
  const [before, after] = pr.merged
    ? [parentOf(deps.github, ctx.repo, pr.mergeSha), pr.mergeSha]
    : [pr.baseRef, pr.headSha];
  const base = boardAt(deps.github, ctx.repo, before);
  const proved = movedRequirements(base, boardAt(deps.github, ctx.repo, after));
  const known = new Set(base.requirements.map((r) => r.id));
  const claimed = pr.requested.filter((id) => known.has(id) && !proved.includes(id)).sort();
  return { proved, claimed, landed: proved.length > 0 };
}

/** The ids another open pull request of this repository holds: what its copy proves, and what its line names while its copy has not landed. */
function heldByOthers(number, ctx, deps) {
  const held = new Set();
  for (const other of openPullNumbers(deps.github, ctx.repo)) {
    if (other === number) continue;
    const pr = readPullRequest(deps.github, ctx.repo, other);
    if (skipReason(pr, ctx.repo)) continue;
    try {
      const { proved, claimed, landed } = claimsOf(pr, ctx, deps);
      for (const id of [...proved, ...(landed ? [] : claimed)]) held.add(id);
    } catch (e) {
      if (!(e instanceof Unreadable)) throw e;
    }
  }
  return held;
}

/**
 * The moves of a pull request: each requirement its copy proves gets the stage of the pull request; each the line names but
 * the copy does not prove is In PR and In Progress while the pull request is open and its copy has not landed, and let go
 * (back to Not started and Todo) otherwise. So is each of a pull request closed unmerged, except those another open pull
 * request of this repository holds, which are only listed.
 */
function movesOf(pr, stage, claims, held) {
  const holding = pr.state === 'open' && !claims.landed;
  const proved = claims.proved.map((id) =>
    stage === 'Not started' ? { id, letGo: true } : { id, build: stage, progress: progressOf(stage) },
  );
  const claimed = claims.claimed.map((id) =>
    holding ? { id, build: 'In PR', progress: 'In Progress' } : { id, letGo: true },
  );
  const all = [...proved, ...claimed];
  const letGo = all.filter((m) => m.letGo);
  if (!letGo.length) return all;
  const others = held();
  return all.map((m) => (!m.letGo ? m : others.has(m.id) ? { id: m.id } : { id: m.id, ...LET_GO }));
}

const list = (ids) => ids.map((id) => `\`${id}\``).join(', ');

/** Looks after one pull request: its stage, the requirements it moves, the board and the comment. Gives {number, ...}. */
export function handlePull(number, ctx, deps, keeper, rules) {
  const pr = readPullRequest(deps.github, ctx.repo, number);
  const skipped = skipReason(pr, ctx.repo, rules);
  if (skipped) return { number, skipped };
  const stage = stageOf(pr, pr.state === 'open' ? checkRollup(deps.github, ctx.repo, pr.headSha) : []);
  const problems = [];
  let claims = { proved: [], claimed: [], landed: false };
  try {
    claims = claimsOf(pr, ctx, deps);
  } catch (e) {
    if (!(e instanceof Unreadable)) throw e;
    problems.push(`${e.message}, so no requirement was moved.`);
    deps.annotate('warning', `pull request #${number}: ${e.message}`);
  }
  const total = claims.proved.length + claims.claimed.length;
  if (total > MAX_IDS) {
    const note = `This pull request moves ${total} requirements; only the first ${MAX_IDS} were handled.`;
    problems.push(note);
    deps.annotate('warning', `pull request #${number}: ${note}`);
    claims = {
      ...claims,
      proved: claims.proved.slice(0, MAX_IDS),
      claimed: claims.claimed.slice(0, MAX_IDS - claims.proved.length),
    };
  }
  if (claims.landed && claims.claimed.length)
    problems.push(`The Requirements line names ${list(claims.claimed)}, not proved by the copy of this pull request.`);
  const moves = movesOf(pr, stage, claims, () => heldByOthers(number, ctx, deps));
  const items = keeper.settle(moves);
  if (items.length && keeper.problem()) problems.push(keeper.problem());
  const headline = claims.proved.length || !moves.some((m) => m.build === 'In PR') ? stage : 'In PR';
  const create = items.length > 0 || problems.length > 0;
  const comment = postComment(number, { stage: headline, items, problems }, create, ctx, deps, keeper);
  deps.write(`build-status: #${number} ${headline}, ${claims.proved.length} requirement(s), comment ${comment}\n`);
  return { number, stage, ids: claims.proved, comment };
}

/**
 * Leaves the one comment of a pull request, on a conversation that may be locked and closed (as a merged pull request's
 * is), and says in warnings what could not be done: the comment itself, or the lock taken up again after it. Gives the
 * outcome: created, updated, unchanged, absent or failed.
 */
function postComment(number, { stage, items, problems }, create, ctx, deps, keeper) {
  const body = commentBody({ stage, items, problems, repo: ctx.repo, runUrl: ctx.runUrl, boardUrl: keeper.url() });
  const left = leaveComment(deps.github, ctx.repo, number, body, { create });
  const say = (text) => deps.annotate('warning', redactSecrets(text, [deps.projectToken]));
  if (left.failure) say(`could not leave the comment on #${number}: ${left.failure}`);
  if (left.relockFailed)
    say(`could not lock the conversation of #${number} again after leaving the comment: ${left.relockFailed}`);
  return left.outcome;
}

/**
 * Looks after a release: Released and Done on the requirements newly proved since the release before it, and a comment on
 * each pull request merged in between that proved any of them, with the stage Released. Gives {tag, since, ids, pulls:
 * [{number, comment}]}.
 */
export function handleRelease(payload, ctx, deps, keeper) {
  const tag = payload.release?.tag_name;
  if (!TAG.test(String(tag))) throw new Error('the release tag is not a plain tag name');
  const previous = releaseBefore(deps.github, ctx.repo, tag);
  const before = previous ? boardAt(deps.github, ctx.repo, previous.tag) : NO_BOARD;
  let ids = movedRequirements(before, boardAt(deps.github, ctx.repo, tag));
  if (ids.length > MAX_IDS) {
    deps.annotate('warning', `release ${tag}: ${ids.length} requirements; only the first ${MAX_IDS} were handled.`);
    ids = ids.slice(0, MAX_IDS);
  }
  const items = keeper.settle(ids.map((id) => ({ id, build: 'Released', progress: 'Done' })));
  const pulls = ids.length ? commentOnPulls(items, previous, payload, ctx, deps, keeper) : [];
  const since = previous?.tag ?? null;
  deps.write(`build-status: release ${tag}, ${ids.length} requirement(s) since ${since ?? 'the start'}\n`);
  return { tag, since, ids, pulls };
}

/** Comments Released on each pull request merged into main between the release before and this one that proved any of `items`. */
function commentOnPulls(items, previous, payload, ctx, deps, keeper) {
  const { numbers, truncated } = mergedPullNumbers(
    deps.github,
    ctx.repo,
    previous?.publishedAt ?? null,
    payload.release?.published_at ?? null,
  );
  if (truncated)
    deps.annotate(
      'warning',
      'more pull requests were merged for this release than the 50 looked at; some may have no comment',
    );
  const pulls = [];
  for (const number of numbers) {
    const pr = readPullRequest(deps.github, ctx.repo, number);
    if (skipReason(pr, ctx.repo, { mergedOnly: true })) continue;
    let proved;
    try {
      proved = claimsOf(pr, ctx, deps).proved;
    } catch (e) {
      if (!(e instanceof Unreadable)) throw e;
      continue;
    }
    const mine = items.filter((item) => proved.includes(item.id));
    if (!mine.length) continue;
    const problems = keeper.problem() ? [keeper.problem()] : [];
    pulls.push({
      number,
      comment: postComment(number, { stage: 'Released', items: mine, problems }, true, ctx, deps, keeper),
    });
  }
  return pulls;
}
