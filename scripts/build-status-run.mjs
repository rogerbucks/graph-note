#!/usr/bin/env node
// Shows on the GitHub Project where each requirement's build is up to (spec §12, requirements_checked_in_ci), one event
// at a time. It runs from the workflow .github/workflows/build-status.yml, which runs the copy on main, never a pull
// request's. An event is the checks of a pull request (CI, or the workflow that wakes this one when a pull request is
// opened, pushed to, reopened or closed), a push to main (a merge), or a release. For a pull request of this repository it
// finds the board items the change moves with no hand-linking, as the requirements whose tests the request's requirements
// file newly marks written against the base's, sets their Build status from the request's state and CI's run, and leaves
// one short comment, updated each time, with links to the items and the run. For a release it sets Released on the
// requirements whose tests were newly written since the release before. The values come from GitHub's events alone.
// Every read is through the API, as data. PROJECT_TOKEN is for the board alone: when it is missing or refused the run says
// so in a warning and in the comment, and does not fail. What each pull request gets is build-status-events.mjs.
//
// Usage (the workflow sets the environment): node scripts/build-status-run.mjs
//   GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_RUN_ID, GH_TOKEN (the workflow's), PROJECT_TOKEN
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { annotation, redactSecrets } from './build-status.mjs';
import { pullNumbersForSha, runnersFrom } from './build-status-gh.mjs';
import { boardKeeper, handlePull, handleRelease } from './build-status-events.mjs';

const REPO = /^[\w.-]+\/[\w.-]+$/;
const EVENTS = ['workflow_run', 'push', 'release'];
const RUN_ID = /^\d+$/;

/**
 * The pull requests an event is about and the rules they must meet, as {numbers, rules}: those a push to main merged (only
 * a merged one counts), or those the checks name (or, naming none, those that hold their commit) whose head is still the
 * commit the checks ran on. None for the checks of anything but a pull request.
 */
function pullsOf(eventName, payload, github, repo) {
  if (eventName === 'push')
    return { numbers: pullNumbersForSha(github, repo, payload.after), rules: { mergedOnly: true } };
  const run = payload.workflow_run;
  if (run?.event !== 'pull_request') return { numbers: [], rules: {} };
  const listed = (run.pull_requests ?? []).map((p) => p.number).filter(Number.isInteger);
  const numbers = listed.length ? [...new Set(listed)] : pullNumbersForSha(github, repo, run.head_sha);
  return { numbers, rules: { headSha: run.head_sha } };
}

/**
 * Looks after the board for one event: `ctx` is {eventName, payload (the event's JSON), repo (`owner/name`), runUrl}, and
 * `deps` {github (the runner of the workflow's token), project (the runner of PROJECT_TOKEN, or null when it is not set),
 * projectToken, annotate(level, text), write(text), sleep}. Gives {pulls: [{number, stage, ids, comment} or {number,
 * skipped}], release, problems: [{kind, text}]}. A problem with the project token is a warning and a line in each comment,
 * never a throw; anything else that fails, such as reading the pull request, throws.
 */
export async function handleEvent(ctx, deps) {
  const found = [];
  const keeper = boardKeeper(ctx, deps, found);
  const result = { pulls: [], problems: found };
  if (ctx.eventName === 'release') {
    result.release = handleRelease(ctx.payload, ctx, deps, keeper);
    return result;
  }
  const { numbers, rules } = pullsOf(ctx.eventName, ctx.payload, deps.github, ctx.repo);
  for (const number of numbers) result.pulls.push(handlePull(number, ctx, deps, keeper, rules));
  return result;
}

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
    const runUrl = RUN_ID.test(String(env.GITHUB_RUN_ID))
      ? `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null;
    const { github, project } = runnersFrom(env, spawn);
    const secrets = [env.PROJECT_TOKEN, env.GH_TOKEN];
    const deps = {
      github,
      project,
      projectToken: env.PROJECT_TOKEN,
      annotate: (level, text) => write(`${annotation(level, redactSecrets(text, secrets))}\n`),
      write,
    };
    const payload = JSON.parse(read(env.GITHUB_EVENT_PATH, 'utf8'));
    await handleEvent({ eventName: env.GITHUB_EVENT_NAME, payload, repo: env.GITHUB_REPOSITORY, runUrl }, deps);
    return 0;
  } catch (e) {
    write(
      `${annotation('error', `build-status: ${redactSecrets(e.stderr ?? e.message, [env.PROJECT_TOKEN, env.GH_TOKEN])}`)}\n`,
    );
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await runFromEnv();
