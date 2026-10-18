// The GitHub mirror of the requirements run by the workflow .github/workflows/project-mirror.yml on every push to main
// (spec §12, requirements_checked_in_ci). So the issues close and the project's values follow main with no session
// doing it. It is `node scripts/github-project.mjs --apply --slices …` in GitHub Actions, which hands over to
// runInWorkflow.
//
// Two tokens, each for its own calls:
// - the workflow's own token (GH_TOKEN, `issues: write`) for the repository, its issues and labels;
// - PROJECT_TOKEN (the project scope only) for the project alone.
//
// The issues the mirror makes are written by the workflows' bot, and only the owner's and the bot's are adopted. It
// warns and never fails over the project. These give a ::warning::, and the issues are mirrored without the project:
// - a missing token;
// - one GitHub refuses (401, 403, Bad credentials);
// - any other failure of a project call (a mirror error, in gh's words).
//
// A seed made despite warnings is never applied blindly: the apply is skipped with a warning, and --accept-warnings is
// never passed. Anything else that goes wrong is an ::error:: and exit 1. No token is ever printed.
import { spawnSync } from 'node:child_process';
import { annotation, describeProblem, redactSecrets } from './build-status.mjs';
import { runnersFrom } from './build-status-gh.mjs';
import { seedOf } from './build-status-seed.mjs';
import { BOT_LOGIN } from './github-project-desired.mjs';
import { SeedWarnings } from './github-project-plan.mjs';
import { BudgetSpent } from './github-project-retry.mjs';
import { CreatesCapped, CreatesUnlisted, MAX_CREATES } from './github-project-issues.mjs';

const REPO = /^[\w.-]+\/[\w.-]+$/;
const PROJECT_CALL = /projectv2|projectsv2/i;
const MAX_WORDS = 300;
/** The minutes an apply may take by default, well inside the job's 60, so a long first run stops in time, not red. */
export const BUDGET_MINUTES = 45;
const MINUTES = /^\d{1,4}(\.\d+)?$/;

/** The minutes of MIRROR_BUDGET_MINUTES, or the default where it is not set; throws for anything but a number. */
function minutesOf(value) {
  if (value === undefined || value === '') return BUDGET_MINUTES;
  if (!MINUTES.test(value) || Number(value) <= 0)
    throw new Error('MIRROR_BUDGET_MINUTES must be a number of minutes greater than 0');
  return Number(value);
}

/** Whether a gh call is about the project, for the project token: `gh project …`, or GraphQL that names a project. */
export function isProjectCall(args, input) {
  if (args[0] === 'project') return true;
  return args[0] === 'api' && args[1] === 'graphql' && PROJECT_CALL.test(String(input ?? ''));
}

/**
 * One runner from the two: each call goes to the runner of its token, the project's calls to `project` and every other
 * to `github`. A failure of a project call is marked as the project token's (`projectToken`), so the run can tell it apart.
 */
export function routed({ github, project }) {
  return (args, input) => {
    if (!isProjectCall(args, input)) return github(args, input);
    if (!project) throw Object.assign(new Error('PROJECT_TOKEN is not set'), { projectToken: true });
    try {
      return project(args, input);
    } catch (e) {
      throw Object.assign(e, { projectToken: true });
    }
  };
}

/** gh's own words in a failure, on one line and cut short. */
const wordsOf = (error) => {
  const words = String(error.stderr ?? error.message)
    .replace(/\s+/g, ' ')
    .trim();
  return words.length > MAX_WORDS ? `${words.slice(0, MAX_WORDS)}…` : words;
};

/**
 * Whether a failure is one of GitHub's rate limits: a 403 or 429 that says "rate limit" or "submitted too quickly". It
 * is neither the token's trouble nor a fault of the mirror: the run stops with a warning, and the next push goes on.
 */
export function isRateLimited(error) {
  const words = String(error?.stderr ?? error?.message ?? '');
  return /\b(403|429)\b/.test(words) && /rate limit|submitted too quickly/i.test(words);
}

/**
 * What to say of a project call that failed. Only GitHub's 401, 403 or "Bad credentials" is the token's trouble, said as
 * such. Anything else is a mirror error in gh's own words (cut short), never blamed on the token. A GraphQL input the
 * schema refused is among them. The token itself is taken out of the words by the caller.
 */
export function projectProblem(error, token) {
  const cut = wordsOf(error);
  if (/\b401\b|bad credentials/i.test(cut)) return describeProblem(error, token).text;
  if (/\b403\b/.test(cut)) return `PROJECT_TOKEN was refused by GitHub (403), so the board was not updated: ${cut}.`;
  return `github-project: mirror error, so the project was not updated: ${cut}.`;
}

/**
 * Runs the mirror's apply as the workflow does, from its environment (GITHUB_REPOSITORY, GH_TOKEN, PROJECT_TOKEN). It
 * gives the exit code.
 * - 0 when it applied, and when the project token was missing or refused (the issues are then mirrored alone).
 * - 0 also when the seed had warnings (nothing is applied).
 * - 1 for anything else.
 *
 * `options` are the command line's; --allow-removals and --accept-warnings are refused here. `io` gives `mirror` and
 * `load(slices)` (the desired state), as scripts/github-project.mjs hands them over. It may also give another `spawn`,
 * `write`, `sleep` (the blocking wait that paces the calls) and `now` (the clock, in milliseconds).
 *
 * The apply may take MIRROR_BUDGET_MINUTES (45 by default). Once that is spent it makes no more calls and warns that
 * the board is partly updated, exit 0. The next push goes on from what GitHub then holds.
 */
export function runInWorkflow(options, env, io) {
  const { spawn = spawnSync, write = (text) => process.stdout.write(text), mirror, load, sleep, now = Date.now } = io;
  const secrets = [env.PROJECT_TOKEN, env.GH_TOKEN];
  const say = (level, text) => write(`${annotation(level, redactSecrets(text, secrets))}\n`);
  const print = (text) => write(redactSecrets(text, secrets));
  try {
    if (options.allowRemovals || options.acceptWarnings)
      throw new Error('the workflow never passes --allow-removals or --accept-warnings; a person decides those');
    if (!REPO.test(String(env.GITHUB_REPOSITORY))) throw new Error('GITHUB_REPOSITORY is not owner/name');
    const budget = { now, until: now() + minutesOf(env.MIRROR_BUDGET_MINUTES) * 60_000 };
    const runners = runnersFrom(env, spawn);
    const run = routed(runners);
    const desired = load(options.slices);
    const seed = (r, repo) => seedOf(r, repo, { write: print });
    const apply = (project) =>
      mirror(
        { desired, mode: 'apply', allowRemovals: false, acceptWarnings: false, project, seed, maxCreates: MAX_CREATES },
        { run, originRepo: env.GITHUB_REPOSITORY, write: print, creator: BOT_LOGIN, sleep, budget },
      );
    if (!runners.project) {
      say('warning', `${describeProblem(null, '').text} The issues were mirrored without it.`);
      apply(false);
      return 0;
    }
    try {
      apply(true);
    } catch (e) {
      if (!e.projectToken || isRateLimited(e)) throw e;
      say('warning', `${projectProblem(e, env.PROJECT_TOKEN)} The issues are mirrored without it.`);
      apply(false);
    }
    return 0;
  } catch (e) {
    if (e instanceof BudgetSpent) {
      say('warning', 'github-project: board partly updated; the next push continues (this run’s time is spent)');
      return 0;
    }
    if (e instanceof SeedWarnings) {
      say('warning', `github-project: nothing was applied: ${e.message.replace(/; pass --accept-warnings.*$/, '')}`);
      return 0;
    }
    const stop = e instanceof CreatesUnlisted || e instanceof CreatesCapped ? e.message : null;
    if (stop || isRateLimited(e)) {
      say('warning', `github-project: ${stop ?? `rate limited; the next push continues (${wordsOf(e)})`}`);
      return 0;
    }
    say('error', `github-project: ${e.stderr ?? e.message}`);
    return 1;
  }
}
