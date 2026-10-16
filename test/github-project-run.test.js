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
 * `refuseIssues` every label made with the workflow's; `refuse(args)`, where given, gives the words any call fails with,
 * or null.
 */
function setUp({ refuseProject = null, refuseIssues = null, refuse = () => null } = {}) {
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
      if (refuse(args)) throw new Error(refuse(args));
      if (project !== (token === PROJECT_TOKEN)) throw new Error(`gh ${args.join(' ')}: the wrong token`);
      if (args[0] === 'api' && args[1] === 'user') throw new Error('HTTP 403: Resource not accessible by integration');
      // the files and pull requests the seed reads are the repository side's; the issues, listed too, are gh's
      const repoSide = args[0] === 'api' && String(args[1]).startsWith('repos/') && !/\/issues\?/.test(args[1]);
      return { status: 0, stdout: (repoSide ? side.run : gh.run)(args, options.input), stderr: '' };
    } catch (e) {
      return { status: 1, stdout: '', stderr: e.stderr ?? e.message };
    }
  };
  const out = [];
  const env = (more = {}) => ({ GITHUB_REPOSITORY: REPO, GH_TOKEN: WORKFLOW_TOKEN, PROJECT_TOKEN, ...more });
  const go = (more = {}, options = {}, io = {}) =>
    runInWorkflow({ slices: SLICES, ...options }, env(more), {
      spawn,
      write: (t) => out.push(t),
      mirror,
      load,
      sleep: () => {},
      ...io,
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

  test('refused (403): token trouble too, a warning naming PROJECT_TOKEN with GitHub’s words, never the token', () => {
    const w = setUp({ refuseProject: `HTTP 403: Resource not accessible by personal access token ${PROJECT_TOKEN}` });
    assert.equal(w.go(), 0);
    const [warning] = annotations(w.text(), 'warning');
    assert.match(
      warning,
      /PROJECT_TOKEN was refused by GitHub \(403\).*Resource not accessible by personal access token \*\*\*/,
    );
    assert.doesNotMatch(w.text(), /TheProjectToken/);
    assert.equal(w.gh.hub.issues.length, 5);
  });
});

describe('a project call that fails for another reason', () => {
  test('is a warning labelled a mirror error, in gh’s own words, never blamed on PROJECT_TOKEN, and exit 0', () => {
    const words = "gh: InputObject 'ProjectV2Iteration' doesn't accept argument 'colour'";
    const w = setUp({ refuseProject: words });
    assert.equal(w.go(), 0);
    const [warning] = annotations(w.text(), 'warning');
    assert.match(warning, /^::warning::github-project: mirror error, so the project was not updated: gh: InputObject/);
    assert.doesNotMatch(warning, /PROJECT_TOKEN/);
    assert.equal(w.gh.hub.issues.length, 5, 'the issues are still mirrored');
  });

  test('a scope GitHub says is missing, with no 401 or 403, is a mirror error too, its words kept and the token hidden', () => {
    const w = setUp({ refuseProject: `Your token has not been granted the required scopes ${PROJECT_TOKEN}` });
    assert.equal(w.go(), 0);
    const [warning] = annotations(w.text(), 'warning');
    assert.match(
      warning,
      /mirror error, so the project was not updated: Your token has not been granted the required scopes \*\*\*/,
    );
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

describe('the time an apply may take', () => {
  /** A clock handed in, never the real one: each look at it is a minute later than the last. */
  const minuteClock = () => {
    let at = Date.UTC(2026, 9, 15, 9, 0);
    return () => (at += 60_000);
  };
  const changes = (w) => w.gh.hub.mutations.length;

  test('runs out: no call is made after it, a warning says the board is partly updated, and exit 0', () => {
    const w = setUp();
    assert.equal(w.go({}, {}, { now: minuteClock() }), 0);
    const warnings = annotations(w.text(), 'warning');
    assert.ok(warnings.some((l) => /board partly updated; the next push continues/.test(l)));
    assert.ok(changes(w) > 0, 'it made what it could before');
    const whole = setUp();
    whole.go();
    assert.ok(changes(w) < changes(whole), 'and stopped before the end');
    assert.deepEqual(annotations(w.text(), 'error'), []);
  });

  test('is 45 minutes by default, and MIRROR_BUDGET_MINUTES sets another', () => {
    const short = setUp();
    short.go({ MIRROR_BUDGET_MINUTES: '5' }, {}, { now: minuteClock() });
    const long = setUp();
    long.go({}, {}, { now: minuteClock() });
    // each look at the clock is a minute: about one call a minute is made before the budget is spent
    assert.ok(changes(short) >= 3 && changes(short) <= 5, `${changes(short)} changes in 5 minutes`);
    assert.ok(changes(long) >= 40 && changes(long) <= 45, `${changes(long)} changes in 45 minutes`);
  });

  test('the next push continues from what GitHub holds, and finishes the board', () => {
    const w = setUp();
    w.go({ MIRROR_BUDGET_MINUTES: '5' }, {}, { now: minuteClock() });
    assert.equal(w.go(), 0);
    w.gh.hub.mutations.length = 0;
    w.go();
    assert.deepEqual(w.gh.hub.mutations, [], 'the board is whole: nothing is left to do');
    assert.equal(w.gh.hub.issues.length, 5);
  });

  test('a budget that is not a number of minutes is an error before any call', () => {
    const w = setUp();
    assert.equal(w.go({ MIRROR_BUDGET_MINUTES: 'soon' }), 1);
    assert.match(annotations(w.text(), 'error')[0], /MIRROR_BUDGET_MINUTES/);
    assert.deepEqual(w.seen, []);
  });
});

describe('issues the bot makes that the creator list does not give back', () => {
  const BOT_CREATOR = 'github-actions[bot]';
  const unlisted = (w) => {
    w.gh.hub.unlistedCreators = [BOT_CREATOR];
  };
  const STOPPED =
    /bot-created issues aren’t listed by creator=github-actions\[bot\]; creating stopped to avoid duplicates/;

  test('do not stop the creating: the newest issues show them, so all are made, with no warning and exit 0', () => {
    const w = setUp();
    unlisted(w);
    assert.equal(w.go(), 0);
    assert.ok(!annotations(w.text(), 'warning').some((l) => STOPPED.test(l)));
    assert.equal(w.gh.hub.issues.length, 5);
    assert.deepEqual(annotations(w.text(), 'error'), []);
  });

  test('are never made again by the next push: it sees them, and creates nothing', () => {
    const w = setUp();
    unlisted(w);
    w.go();
    w.out.length = 0;
    assert.equal(w.go(), 0);
    assert.equal(w.gh.hub.issues.length, 5, 'no duplicate, push after push');
    w.go();
    assert.equal(w.gh.hub.issues.length, 5);
  });

  test('do not stop a run whose creator list gives them back', () => {
    const w = setUp();
    w.go();
    assert.equal(w.gh.hub.issues.length, 5);
    assert.ok(!annotations(w.text(), 'warning').some((l) => STOPPED.test(l)));
  });
});

describe('a run that would make many issues', () => {
  const EXTRA = Array.from(
    { length: 21 },
    (_, n) => `(extra_${n}:Requirement {section: '3', slice: 3, level: 'must', rule: 'An extra rule ${n}.'}),`,
  ).join('\n');
  const many = FIXTURE.replace('// ── Tests ──', `${EXTRA}\n// ── Tests ──`);
  const loadMany = (slices) => desiredState(readBoard(many), WORKSTREAMS, slices);

  test('is refused with a warning, exit 0, when the board already has its issues: more than 20 creates', () => {
    const w = setUp();
    w.go();
    w.gh.hub.mutations.length = 0;
    w.out.length = 0;
    assert.equal(w.go({}, {}, { load: loadMany }), 0);
    const warning = annotations(w.text(), 'warning').find((l) => /more than 20/.test(l));
    assert.match(warning, /the plan makes 21 issues, more than 20 in one run/);
    assert.deepEqual(w.gh.hub.mutations, [], 'nothing was applied');
  });

  test('is made in full on a first mirror, with no issue of its own yet', () => {
    const w = setUp();
    assert.equal(w.go({}, {}, { load: loadMany }), 0);
    assert.equal(w.gh.hub.issues.length, 26);
  });

  test('has no such cap when a person applies it', () => {
    const gh = fakeGithub();
    const deps = { run: gh.run, originRepo: REPO, write: () => {}, sleep: () => {} };
    mirror({ desired: load(SLICES), mode: 'apply' }, deps);
    mirror({ desired: loadMany(SLICES), mode: 'apply' }, deps);
    assert.equal(gh.hub.issues.length, 26);
  });
});

describe('GitHub’s rate limits', () => {
  const LIMITED = /^::warning::github-project: rate limited; the next push continues/;

  test('a 403 rate limit on the issues is a warning, exit 0: not an error, and not the token’s trouble', () => {
    const words = 'HTTP 403: API rate limit exceeded for installation ID 1 (https://api.github.com/)';
    const w = setUp({ refuse: (args) => (args[0] === 'issue' && args[1] === 'create' ? words : null) });
    assert.equal(w.go(), 0);
    assert.ok(annotations(w.text(), 'warning').some((l) => LIMITED.test(l)));
    assert.deepEqual(annotations(w.text(), 'error'), []);
    assert.doesNotMatch(w.text(), /PROJECT_TOKEN/);
  });

  test('a 429 “submitted too quickly” on the project is a warning too, never PROJECT_TOKEN’s trouble', () => {
    const words = 'HTTP 429: You have exceeded a secondary rate limit: content was submitted too quickly';
    const w = setUp({ refuseProject: words });
    assert.equal(w.go(), 0);
    const warnings = annotations(w.text(), 'warning');
    assert.ok(warnings.some((l) => LIMITED.test(l)));
    assert.ok(!warnings.some((l) => /PROJECT_TOKEN|mirror error/.test(l)));
  });

  test('a 403 that is not a rate limit is still the token’s trouble on the project, and an error on the issues', () => {
    const w = setUp({ refuse: (args) => (args[0] === 'label' ? 'HTTP 403: Resource not accessible' : null) });
    assert.equal(w.go(), 1);
    assert.ok(!annotations(w.text(), 'warning').some((l) => LIMITED.test(l)));
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
    assert.equal(graphql('mutation { updateProjectV2ItemFieldValue(input: {}) { projectV2Item { id } } }'), true);
    assert.equal(graphql('mutation { clearProjectV2ItemFieldValue(input: {}) { projectV2Item { id } } }'), true);
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
