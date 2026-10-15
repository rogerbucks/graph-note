#!/usr/bin/env node
// Shows on the GitHub Project where each requirement's build is up to (spec §12, requirements_checked_in_ci), one event
// at a time. It runs from the workflow .github/workflows/build-status.yml, which runs the copy on main, never a pull
// request's. An event is a pull request's checks, its closing or merge (a push to main), or a release. For a pull
// request it finds the board items the change moves with no hand-linking, as the requirements whose tests the request's
// requirements file newly marks written against main's, sets their Build status from the request's state and checks,
// and leaves one short comment, updated each time, with links to the items and the run. For a release it sets Released
// on the requirements whose tests were newly written since the release before. The values come from GitHub's events
// alone. Every read is through the API, as data. PROJECT_TOKEN is for the board alone: when it is missing or refused
// the run says so in a warning and in the comment, and does not fail.
//
// Usage (the workflow sets the environment): node scripts/build-status-run.mjs
//   GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_RUN_ID, GH_TOKEN (the workflow's), PROJECT_TOKEN
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readBoard } from './slice-board.mjs';
import {
  annotation,
  commentBody,
  describeProblem,
  movedRequirements,
  nextStatus,
  redactSecrets,
  stageOf,
} from './build-status.mjs';
import {
  checkRollup,
  parentOf,
  pullNumbersForSha,
  readBuildBoard,
  readPullRequest,
  readRequirementsAt,
  releaseBefore,
  runnersFrom,
  setBuildStatus,
  upsertComment,
} from './build-status-gh.mjs';

const REPO = /^[\w.-]+\/[\w.-]+$/;
const TAG = /^\w[\w.+/-]{0,99}$/;
const EVENTS = ['workflow_run', 'push', 'release'];
const NO_BOARD = { sections: [], requirements: [], questions: [] };
const NEWLY_RELEASED = 'Released';

/** A requirements file the reader cannot read, or a merge commit that is not known: said in the comment, not thrown out. */
class Unreadable extends Error {}

/** The requirements file of a ref as a board, or an empty one where there is no file. Throws Unreadable for a text the reader cannot read. */
function boardAt(run, repo, ref) {
  const text = readRequirementsAt(run, repo, ref);
  if (text === null) return NO_BOARD;
  try {
    return readBoard(text);
  } catch (e) {
    // only the line is said: the reader's words may quote the text of a pull request
    throw new Unreadable(
      `the requirements file at ${ref.slice(0, 12)} could not be read${Number.isInteger(e.line) ? ` (line ${e.line})` : ''}`,
    );
  }
}

/** The numbers of the pull requests an event is about: its own list, else those that hold its commit; none for what is not a pull request's. */
function numbersOf(eventName, payload, github, repo) {
  if (eventName === 'push') return pullNumbersForSha(github, repo, payload.after);
  const run = payload.workflow_run;
  if (run?.event !== 'pull_request') return [];
  const listed = (run.pull_requests ?? []).map((p) => p.number).filter(Number.isInteger);
  return listed.length ? [...new Set(listed)] : pullNumbersForSha(github, repo, run.head_sha);
}

/**
 * Looks after the board for one event: reads it once, on first need, and once it fails goes on without it, saying so once
 * in a warning. `settle(ids, stage)` sets the stage on each id and gives the entries of the comment ({id, number,
 * status}); `problem()` is the text to put in a comment, or null.
 */
function boardKeeper(ctx, deps, found) {
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
      board = readBuildBoard(deps.project, ctx.repo, { sleep: deps.sleep });
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

function handlePull(number, ctx, deps, keeper) {
  const pr = readPullRequest(deps.github, ctx.repo, number);
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
  const items = keeper.settle(ids, stage);
  if (ids.length && keeper.problem()) problems.push(keeper.problem());
  const body = commentBody({ stage, items, problems, repo: ctx.repo, runUrl: ctx.runUrl, boardUrl: keeper.url() });
  let comment;
  try {
    comment = upsertComment(deps.github, ctx.repo, number, body, { create: ids.length > 0 || problems.length > 0 });
  } catch (e) {
    comment = 'failed';
    deps.annotate(
      'warning',
      `could not leave the comment on #${number}: ${redactSecrets(e.stderr ?? e.message, [deps.projectToken])}`,
    );
  }
  deps.write(`build-status: #${number} ${stage}, ${ids.length} requirement(s), comment ${comment}\n`);
  return { number, stage, ids, comment };
}

function handleRelease(payload, ctx, deps, keeper) {
  const tag = payload.release?.tag_name;
  if (!TAG.test(String(tag))) throw new Error('the release tag is not a plain tag name');
  const since = releaseBefore(deps.github, ctx.repo, tag);
  const ids = movedRequirements(
    since ? boardAt(deps.github, ctx.repo, since) : NO_BOARD,
    boardAt(deps.github, ctx.repo, tag),
  );
  keeper.settle(ids, NEWLY_RELEASED);
  deps.write(`build-status: release ${tag}, ${ids.length} requirement(s) since ${since ?? 'the start'}\n`);
  return { tag, since, ids };
}

/**
 * Looks after the board for one event: `ctx` is {eventName, payload (the event's JSON), repo (`owner/name`), runUrl}, and
 * `deps` {github (the runner of the workflow's token), project (the runner of PROJECT_TOKEN, or null when it is not set),
 * projectToken, annotate(level, text), write(text), sleep}. Gives {pulls: [{number, stage, ids, comment}], release,
 * problems: [{kind, text}]}. A problem with the project token is a warning and a line in each comment, never a throw;
 * anything else that fails, such as reading the pull request, throws.
 */
export async function handleEvent(ctx, deps) {
  const found = [];
  const keeper = boardKeeper(ctx, deps, found);
  const result = { pulls: [], problems: found };
  if (ctx.eventName === 'release') result.release = handleRelease(ctx.payload, ctx, deps, keeper);
  else
    for (const number of numbersOf(ctx.eventName, ctx.payload, deps.github, ctx.repo))
      result.pulls.push(handlePull(number, ctx, deps, keeper));
  return result;
}

const RUN_ID = /^\d+$/;

/**
 * Runs for the environment a workflow gives (see the top of this file), reading the event from the file it names, and
 * gives the exit code: 0 whatever happened to the board, 1 for a mistake in the workflow or a failure to read GitHub. The
 * tokens are never printed. `io` may give another `spawn`, `read` and `write`.
 */
export async function runFromEnv(env = process.env, io = {}) {
  const { spawn = spawnSync, read = readFileSync, write = (text) => process.stdout.write(text) } = io;
  try {
    if (!EVENTS.includes(env.GITHUB_EVENT_NAME)) {
      write('build-status: nothing to do for this kind of event\n');
      return 0;
    }
    if (!REPO.test(String(env.GITHUB_REPOSITORY))) throw new Error('GITHUB_REPOSITORY is not owner/name');
    const runs = RUN_ID.test(String(env.GITHUB_RUN_ID))
      ? `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null;
    const { github, project } = runnersFrom(env, spawn);
    const deps = {
      github,
      project,
      projectToken: env.PROJECT_TOKEN,
      annotate: (level, text) =>
        write(`${annotation(level, redactSecrets(text, [env.PROJECT_TOKEN, env.GH_TOKEN]))}\n`),
      write,
    };
    const ctx = {
      eventName: env.GITHUB_EVENT_NAME,
      payload: JSON.parse(read(env.GITHUB_EVENT_PATH, 'utf8')),
      repo: env.GITHUB_REPOSITORY,
      runUrl: runs,
    };
    await handleEvent(ctx, deps);
    return 0;
  } catch (e) {
    write(
      `${annotation('error', `build-status: ${redactSecrets(e.stderr ?? e.message, [env.PROJECT_TOKEN, env.GH_TOKEN])}`)}\n`,
    );
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await runFromEnv();
