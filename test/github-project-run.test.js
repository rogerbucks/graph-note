// The GitHub mirror run by its workflow on a push to main: the issues made and edited with the workflow's own token and
// written by its bot, the project with PROJECT_TOKEN alone, and every way that can go wrong warned of, never failed over:
// a missing or refused project token mirrors the issues alone, and a seed made despite warnings applies nothing. A
// stand-in `spawn` answers gh by the token it is started with, so no network is touched. Editor spec §12,
// requirements_checked_in_ci.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBoard } from '../scripts/slice-board.mjs';
import { desiredState } from '../scripts/github-project-desired.mjs';
import { mirror } from '../scripts/github-project.mjs';
import { isProjectCall, runInWorkflow } from '../scripts/github-project-run.mjs';
import { readWaves } from '../scripts/github-project-waves.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { fakeRepoSide } from './repository/build-status-fake.js';
import { FIXTURE, WAVES, WORKSTREAMS } from './repository/github-project-fixture.js';
import { path } from './repository/repo.js';

const REPO = 'rogerbucks/graph-note';
const WORKFLOW_TOKEN = 'ghs_TheWorkflowsOwnToken1234';
const PROJECT_TOKEN = 'ghp_TheProjectTokenForTest99';
const SLICES = [3, 4];
const load = (slices) =>
  desiredState(readBoard(FIXTURE), WORKSTREAMS, slices, readWaves(JSON.stringify(WAVES), WORKSTREAMS));

/**
 * The world of one run: GitHub as the bot sees it (issues, labels and the project in `gh`, the files and pull requests
 * the seed reads in `side`), and a `spawn` that answers by the token gh is started with, refusing a call made with the
 * wrong one, as GitHub would. `refuseProject` makes every call with the project token fail with GitHub's words, and
 * `refuseIssues` every label made with the workflow's.
 */
function setUp({ refuseProject = null, refuseIssues = null } = {}) {
  const gh = fakeGithub({ login: 'app/github-actions' });
  const side = fakeRepoSide({ issues: () => gh.hub.issues });
  side.hub.files.main = FIXTURE;
  const seen = [];
  const spawn = (_cmd, args, options) => {
    const token = options.env.GH_TOKEN;
    const project = isProjectCall(args, options.input);
    seen.push({ token, args, project });
    try {
      if (token === PROJECT_TOKEN && refuseProject) throw new Error(refuseProject);
      if (refuseIssues && args[0] === 'label' && args[1] === 'create') throw new Error(refuseIssues);
      if (project !== (token === PROJECT_TOKEN)) throw new Error(`gh ${args.join(' ')}: the wrong token`);
      if (args[0] === 'api' && args[1] === 'user') throw new Error('HTTP 403: Resource not accessible by integration');
      const repoSide = args[0] === 'api' && String(args[1]).startsWith('repos/');
      return { status: 0, stdout: (repoSide ? side.run : gh.run)(args, options.input), stderr: '' };
    } catch (e) {
      return { status: 1, stdout: '', stderr: e.stderr ?? e.message };
    }
  };
  const out = [];
  const env = (more = {}) => ({ GITHUB_REPOSITORY: REPO, GH_TOKEN: WORKFLOW_TOKEN, PROJECT_TOKEN, ...more });
  const go = (more = {}, options = {}) =>
    runInWorkflow({ slices: SLICES, ...options }, env(more), {
      spawn,
      write: (t) => out.push(t),
      mirror,
      load,
      sleep: () => {},
    });
  return { gh, side, seen, out, go, text: () => out.join('') };
}
const annotations = (text, level) => text.split('\n').filter((l) => l.startsWith(`::${level}::`));

describe('a run with both tokens', () => {
  test('mirrors the issues, written by the bot, and the project, and exits 0', () => {
    const w = setUp();
    assert.equal(w.go(), 0);
    assert.equal(w.gh.hub.issues.length, 5);
    assert.ok(w.gh.hub.issues.every((i) => i.author.login === 'app/github-actions'));
    assert.equal(w.gh.hub.projects[0].items.length, 5);
    assert.deepEqual(annotations(w.text(), 'warning'), []);
  });

  test('a second run adopts the bot’s issues and changes nothing', () => {
    const w = setUp();
    w.go();
    w.gh.hub.mutations.length = 0;
    assert.equal(w.go(), 0);
    assert.deepEqual(w.gh.hub.mutations, []);
  });

  test('makes every issue and label call with the workflow’s token, and every project call with PROJECT_TOKEN alone', () => {
    const w = setUp();
    w.go();
    const issueCalls = w.seen.filter((c) => c.args[0] === 'issue' || c.args[0] === 'label');
    assert.ok(issueCalls.length > 0 && issueCalls.every((c) => c.token === WORKFLOW_TOKEN));
    const projectCalls = w.seen.filter((c) => c.project);
    assert.ok(projectCalls.length > 0 && projectCalls.every((c) => c.token === PROJECT_TOKEN));
    assert.ok(w.seen.filter((c) => c.token === PROJECT_TOKEN).every((c) => c.project));
  });

  test('never asks who is signed in, and prints no token', () => {
    const w = setUp();
    w.go();
    assert.ok(!w.seen.some((c) => c.args[0] === 'api' && c.args[1] === 'user'));
    assert.doesNotMatch(w.text(), /TheWorkflowsOwnToken|TheProjectToken/);
  });
});

describe('a project token that is missing or refused', () => {
  test('missing: a warning, exit 0, and the issues mirrored without the project', () => {
    const w = setUp();
    assert.equal(w.go({ PROJECT_TOKEN: undefined }), 0);
    const [warning] = annotations(w.text(), 'warning');
    assert.match(warning, /PROJECT_TOKEN is not set.*issues were mirrored without it/);
    assert.equal(w.gh.hub.issues.length, 5);
    assert.equal(w.gh.hub.issues.find((i) => i.state === 'CLOSED') !== undefined, true, 'the proved one is closed');
    assert.deepEqual(w.gh.hub.projects, []);
    assert.ok(!w.seen.some((c) => c.project));
  });

  test('refused (401): a warning that says so, exit 0, and the issues still mirrored', () => {
    const w = setUp({ refuseProject: 'HTTP 401: Bad credentials (https://api.github.com/graphql)' });
    assert.equal(w.go(), 0);
    const [warning] = annotations(w.text(), 'warning');
    assert.match(warning, /PROJECT_TOKEN was rejected by GitHub.*issues are mirrored without it/);
    assert.equal(w.gh.hub.issues.length, 5);
    assert.deepEqual(annotations(w.text(), 'error'), []);
  });

  test('refused for want of a scope: a warning with GitHub’s words, never the token, and exit 0', () => {
    const w = setUp({ refuseProject: `Your token has not been granted the required scopes ${PROJECT_TOKEN}` });
    assert.equal(w.go(), 0);
    const [warning] = annotations(w.text(), 'warning');
    assert.match(warning, /The board was not updated: Your token has not been granted the required scopes \*\*\*/);
    assert.doesNotMatch(w.text(), /TheProjectToken/);
  });
});

describe('a seed made despite warnings', () => {
  test('is not applied: a warning, exit 0, and nothing changed at all', () => {
    const w = setUp();
    w.side.hub.files.main = '(broken';
    assert.equal(w.go(), 0);
    const warnings = annotations(w.text(), 'warning');
    assert.ok(warnings.some((l) => /nothing was applied: the seed was made despite 1 warning/.test(l)));
    assert.ok(!warnings.some((l) => /accept-warnings/.test(l)), 'the workflow is never told to pass it');
    assert.deepEqual(w.gh.hub.mutations, []);
  });

  test('cannot be accepted from the workflow, nor removals allowed: either is refused with an error', () => {
    for (const option of [{ acceptWarnings: true }, { allowRemovals: true }]) {
      const w = setUp();
      assert.equal(w.go({}, option), 1);
      assert.match(annotations(w.text(), 'error')[0], /never passes --allow-removals or --accept-warnings/);
      assert.deepEqual(w.gh.hub.mutations, []);
    }
  });
});

describe('anything else that goes wrong', () => {
  test('is an error annotation and exit 1: the workflow’s own token refused for the issues', () => {
    const w = setUp({ refuseIssues: 'HTTP 403: Resource not accessible by integration' });
    assert.equal(w.go(), 1);
    assert.match(annotations(w.text(), 'error')[0], /Resource not accessible by integration/);
    assert.deepEqual(annotations(w.text(), 'warning'), []);
  });

  test('a repository that is not owner/name, or no workflow token, is an error before any call', () => {
    const w = setUp();
    assert.equal(w.go({ GITHUB_REPOSITORY: 'nope' }), 1);
    assert.equal(w.go({ GH_TOKEN: undefined }), 1);
    assert.deepEqual(w.seen, []);
  });
});

describe('which calls are the project’s', () => {
  test('gh project, and GraphQL that names a project; never an issue, a label or the repository', () => {
    assert.equal(isProjectCall(['project', 'item-edit']), true);
    const graphql = (query) => isProjectCall(['api', 'graphql', '--input', '-'], JSON.stringify({ query }));
    assert.equal(graphql('query { repositoryOwner { projectsV2 } }'), true);
    assert.equal(graphql('mutation { createProjectV2Field }'), true);
    assert.equal(graphql('query { repository { issue { id } } }'), false);
    assert.equal(isProjectCall(['issue', 'create', '--title', 'projectV2']), false);
    assert.equal(isProjectCall(['api', 'repos/o/r/pulls/1']), false);
  });
});

describe('the command in GitHub Actions', () => {
  const empty = mkdtempSync(join(tmpdir(), 'github-project-run-'));
  after(() => rmSync(empty, { recursive: true, force: true }));
  const command = (env) =>
    spawnSync(process.execPath, [path('scripts/github-project.mjs'), '--apply', '--slices', '3,4'], {
      encoding: 'utf8',
      env: { PATH: empty, HOME: empty, ...env },
    });

  test('hands an --apply over to the workflow’s run, which needs the workflow’s token, and says so as an annotation', () => {
    const result = command({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: REPO });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^::error::github-project: GH_TOKEN, the workflow’s own token, is not set/m);
  });

  test('outside GitHub Actions runs as a person runs it', () => {
    const result = command({});
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /::error::/);
    assert.match(result.stderr, /github-project: git could not read the origin remote|gh could not be run/);
  });
});
