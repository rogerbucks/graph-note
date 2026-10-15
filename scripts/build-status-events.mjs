// What the build status does for one pull request or one release (spec §12, requirements_checked_in_ci): the pull
// requests it looks after and the ones it leaves alone, the requirements a pull request moves, the stage it puts them
// in on the board, and the one comment it leaves. build-status-run.mjs hands it each pull request an event is about.
// Reading is through build-status-gh.mjs, the board is build-status-board.mjs and the pure rules are build-status.mjs.
import { readBoard } from './slice-board.mjs';
import {
  DEFAULT_BRANCH,
  MAX_IDS,
  commentBody,
  describeProblem,
  movedRequirements,
  nextStatus,
  redactSecrets,
  stageOf,
} from './build-status.mjs';
import {
  Unreadable,
  checkRollup,
  parentOf,
  readPullRequest,
  readRequirementsAt,
  releaseBefore,
  upsertComment,
} from './build-status-gh.mjs';
import { readBuildBoard, setBuildStatus } from './build-status-board.mjs';

const TAG = /^\w[\w.+/-]{0,99}$/;
const NO_BOARD = { sections: [], requirements: [], questions: [] };

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
 * in a warning. `settle(ids, stage)` sets the stage on each id and gives the entries of the comment ({id, number,
 * status}); `problem()` is the text to put in a comment, or null; `url()` is the board's address, once it is read.
 * Each problem is also added to `found`, once.
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
  return {
    problem: () => problem?.text ?? null,
    url: () => (board ? `https://github.com/users/${board.owner}/projects/${board.projectNumber}` : null),
    settle(ids, stage) {
      if (!ids.length) return [];
      open();
      return ids.map((id) => {
        const item = board?.items.get(id);
        const issue = board?.issues.get(id);
        if (!board) return { id, number: null, status: null, unknown: true };
        if (problem) return { id, number: issue?.number ?? null, status: item?.current ?? null };
        if (!item) return { id, number: issue?.number ?? null, status: null };
        try {
          const next = nextStatus(item.current, stage);
          if (next) setBuildStatus(deps.project, board, id, next, { sleep: deps.sleep });
        } catch (e) {
          fail(e);
        }
        return { id, number: item.number, status: item.current };
      });
    },
  };
}

/** Looks after one pull request: its stage, the requirements it moves, the board and the comment. Gives {number, ...}. */
export function handlePull(number, ctx, deps, keeper, rules) {
  const pr = readPullRequest(deps.github, ctx.repo, number);
  const skipped = skipReason(pr, ctx.repo, rules);
  if (skipped) return { number, skipped };
  const stage = stageOf(pr, pr.state === 'open' ? checkRollup(deps.github, ctx.repo, pr.headSha) : []);
  const problems = [];
  let ids = [];
  try {
    if (pr.merged && !pr.mergeSha) throw new Unreadable('the merge commit of the pull request is not known');
    const [before, after] = pr.merged
      ? [parentOf(deps.github, ctx.repo, pr.mergeSha), pr.mergeSha]
      : [pr.baseRef, pr.headSha];
    ids = movedRequirements(boardAt(deps.github, ctx.repo, before), boardAt(deps.github, ctx.repo, after));
  } catch (e) {
    if (!(e instanceof Unreadable)) throw e;
    problems.push(`${e.message}, so no requirement was moved.`);
    deps.annotate('warning', `pull request #${number}: ${e.message}`);
  }
  if (ids.length > MAX_IDS) {
    const note = `This pull request moves ${ids.length} requirements; only the first ${MAX_IDS} were handled.`;
    problems.push(note);
    deps.annotate('warning', `pull request #${number}: ${note}`);
    ids = ids.slice(0, MAX_IDS);
  }
  const items = keeper.settle(ids, stage);
  if (ids.length && keeper.problem()) problems.push(keeper.problem());
  const body = commentBody({ stage, items, problems, repo: ctx.repo, runUrl: ctx.runUrl, boardUrl: keeper.url() });
  let comment;
  try {
    comment = upsertComment(deps.github, ctx.repo, number, body, { create: ids.length > 0 || problems.length > 0 });
  } catch (e) {
    comment = 'failed';
    const why = redactSecrets(e.stderr ?? e.message, [deps.projectToken]);
    deps.annotate('warning', `could not leave the comment on #${number}: ${why}`);
  }
  deps.write(`build-status: #${number} ${stage}, ${ids.length} requirement(s), comment ${comment}\n`);
  return { number, stage, ids, comment };
}

/** Looks after a release: Released on the requirements newly proved since the release before it. Gives {tag, since, ids}. */
export function handleRelease(payload, ctx, deps, keeper) {
  const tag = payload.release?.tag_name;
  if (!TAG.test(String(tag))) throw new Error('the release tag is not a plain tag name');
  const since = releaseBefore(deps.github, ctx.repo, tag);
  const before = since ? boardAt(deps.github, ctx.repo, since) : NO_BOARD;
  const ids = movedRequirements(before, boardAt(deps.github, ctx.repo, tag));
  keeper.settle(ids, 'Released');
  deps.write(`build-status: release ${tag}, ${ids.length} requirement(s) since ${since ?? 'the start'}\n`);
  return { tag, since, ids };
}
