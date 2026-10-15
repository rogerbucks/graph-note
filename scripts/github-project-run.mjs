// The GitHub mirror of the requirements run by the workflow .github/workflows/project-mirror.yml on every push to main
// (spec §12, requirements_checked_in_ci), so the issues close and the project's values follow main with no session doing
// it. It is `node scripts/github-project.mjs --apply --slices …` in GitHub Actions, which hands over to runInWorkflow.
//
// Two tokens, each for its own calls: the workflow's own token (GH_TOKEN, `issues: write`) for the repository, its issues
// and labels, and PROJECT_TOKEN (the project scope only) for the project alone. The issues the mirror makes are written
// by the workflows' bot, and only the owner's and the bot's are adopted. It warns and never fails over the project token:
// a missing one, or one GitHub refuses, gives a ::warning:: and the issues are mirrored without the project. A seed made
// despite warnings is never applied blindly: the apply is skipped with a warning, and --accept-warnings is never passed.
// Anything else that goes wrong is an ::error:: and exit 1. No token is ever printed.
import { spawnSync } from 'node:child_process';
import { annotation, describeProblem, redactSecrets } from './build-status.mjs';
import { runnersFrom } from './build-status-gh.mjs';
import { seedOf } from './build-status-seed.mjs';
import { BOT_LOGIN } from './github-project-desired.mjs';
import { SeedWarnings } from './github-project-plan.mjs';

const REPO = /^[\w.-]+\/[\w.-]+$/;
const PROJECT_CALL = /projectv2|projectsv2/i;

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

/**
 * Runs the mirror's apply as the workflow does, from its environment (GITHUB_REPOSITORY, GH_TOKEN, PROJECT_TOKEN), and
 * gives the exit code: 0 when it applied, when the project token was missing or refused (the issues are then mirrored
 * alone), and when the seed had warnings (nothing is applied); 1 for anything else. `options` are the command line's;
 * --allow-removals and --accept-warnings are refused here. `io` gives `mirror` and `load(slices)` (the desired state), as
 * scripts/github-project.mjs hands them over, and may give another `spawn`, `write` and `sleep` (the blocking wait that
 * paces the calls).
 */
export function runInWorkflow(options, env, io) {
  const { spawn = spawnSync, write = (text) => process.stdout.write(text), mirror, load, sleep } = io;
  const secrets = [env.PROJECT_TOKEN, env.GH_TOKEN];
  const say = (level, text) => write(`${annotation(level, redactSecrets(text, secrets))}\n`);
  const print = (text) => write(redactSecrets(text, secrets));
  try {
    if (options.allowRemovals || options.acceptWarnings)
      throw new Error('the workflow never passes --allow-removals or --accept-warnings; a person decides those');
    if (!REPO.test(String(env.GITHUB_REPOSITORY))) throw new Error('GITHUB_REPOSITORY is not owner/name');
    const runners = runnersFrom(env, spawn);
    const run = routed(runners);
    const desired = load(options.slices);
    const seed = (r, repo) => seedOf(r, repo, { write: print });
    const apply = (project) =>
      mirror(
        { desired, mode: 'apply', allowRemovals: false, acceptWarnings: false, project, seed },
        { run, originRepo: env.GITHUB_REPOSITORY, write: print, creator: BOT_LOGIN, sleep },
      );
    if (!runners.project) {
      say('warning', `${describeProblem(null, '').text} The issues were mirrored without it.`);
      apply(false);
      return 0;
    }
    try {
      apply(true);
    } catch (e) {
      if (!e.projectToken) throw e;
      say('warning', `${describeProblem(e, env.PROJECT_TOKEN).text} The issues are mirrored without it.`);
      apply(false);
    }
    return 0;
  } catch (e) {
    if (e instanceof SeedWarnings) {
      say('warning', `github-project: nothing was applied: ${e.message.replace(/; pass --accept-warnings.*$/, '')}`);
      return 0;
    }
    say('error', `github-project: ${e.stderr ?? e.message}`);
    return 1;
  }
}
