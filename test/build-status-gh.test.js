// The thin layer between the build status and GitHub: reading a pull request, the requirements file at a ref, a commit’s
// checks and releases, leaving one comment, and reading and writing the project’s Build status field. Every case runs
// against in-memory stand-ins for gh (test/repository/build-status-fake.js and github-project-fake.js) handed in as the
// runner, so no network is touched. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CI_WORKFLOW,
  MAX_FILE_BYTES,
  TRIGGER_JOB,
  Unreadable,
  checkRollup,
  openPullNumbers,
  parentOf,
  pullNumbersForSha,
  readPullRequest,
  readRequirementsAt,
  releaseBefore,
  runnersFrom,
  upsertComment,
} from '../scripts/build-status-gh.mjs';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { fakeRepoSide, pull } from './repository/build-status-fake.js';

const REPO = 'rogerbucks/graph-note';
const SHA = 'b'.repeat(40);
const MARKER = '<!-- build-status -->';

describe('a pull request', () => {
  test('is read as its state, whether it merged, its merge commit, its head commit, its base branch and the repositories', () => {
    const side = fakeRepoSide();
    side.hub.pulls[7] = pull(7, { state: 'closed', merged: true, head: SHA, mergeSha: 'c'.repeat(40) });
    assert.deepEqual(readPullRequest(side.run, REPO, 7), {
      number: 7,
      state: 'closed',
      merged: true,
      draft: false,
      mergeSha: 'c'.repeat(40),
      headSha: SHA,
      baseRef: 'main',
      headRepo: REPO,
      baseRepo: REPO,
      requested: [],
    });
  });

  test('gives the requirements its description names in the Requirements line, and not a word of the description', () => {
    const side = fakeRepoSide();
    side.hub.pulls[7] = pull(7, {
      body: 'Hello @everyone ${{ x }}\nRequirements: focus_link, nope!\nBye',
      draft: true,
    });
    const read = readPullRequest(side.run, REPO, 7);
    assert.deepEqual(read.requested, ['focus_link']);
    assert.equal(read.draft, true);
    assert.doesNotMatch(JSON.stringify(read), /everyone|Hello|Bye|nope/);
  });

  test('is listed among the open ones by number, at most fifty, the fork’s too, for the caller to judge', () => {
    const side = fakeRepoSide();
    for (const n of [4, 2, 9]) side.hub.pulls[n] = pull(n);
    side.hub.pulls[3] = pull(3, { state: 'closed' });
    assert.deepEqual(openPullNumbers(side.run, REPO), [2, 4, 9]);
    for (let n = 20; n < 90; n += 1) side.hub.pulls[n] = pull(n);
    assert.equal(openPullNumbers(side.run, REPO).length, 50);
  });

  test('has no head repository when its fork has gone', () => {
    const side = fakeRepoSide();
    side.hub.pulls[7] = pull(7, { headRepo: null });
    assert.equal(readPullRequest(side.run, REPO, 7).headRepo, null);
  });

  test('is refused when the API gives a head commit or a base branch that is not a name git would use', () => {
    const side = fakeRepoSide();
    side.hub.pulls[1] = pull(1, { head: 'not-a-sha' });
    side.hub.pulls[2] = pull(2, { base: 'main; rm -rf /' });
    assert.throws(() => readPullRequest(side.run, REPO, 1), /head commit/);
    assert.throws(() => readPullRequest(side.run, REPO, 2), /base branch/);
  });

  test('is asked for by a whole number only', () => {
    const side = fakeRepoSide();
    for (const n of [0, -1, 1.5, '7/../x', NaN])
      assert.throws(() => readPullRequest(side.run, REPO, n), /pull request number/);
    assert.equal(side.hub.calls.length, 0);
  });

  test('is found from a commit by the numbers of the pull requests that hold it', () => {
    const side = fakeRepoSide();
    side.hub.pulls[3] = pull(3);
    side.hub.pulls[9] = pull(9);
    side.hub.forSha[SHA] = [9, 3];
    assert.deepEqual(pullNumbersForSha(side.run, REPO, SHA), [3, 9]);
    assert.throws(() => pullNumbersForSha(side.run, REPO, 'main'), /commit/);
  });

  test('has a merge commit whose first parent is where main stood before it', () => {
    const side = fakeRepoSide();
    side.hub.parents[SHA] = 'd'.repeat(40);
    assert.equal(parentOf(side.run, REPO, SHA), 'd'.repeat(40));
  });
});

describe('the requirements file at a ref', () => {
  test('is read as data through the API, by ref, and never from a checkout', () => {
    const side = fakeRepoSide();
    side.hub.files.main = 'the text';
    assert.equal(readRequirementsAt(side.run, REPO, 'main'), 'the text');
    const [ask, get] = side.hub.calls;
    const where = ['api', `repos/${REPO}/contents/${REQUIREMENTS}`, '--method', 'GET', '-f', 'ref=main'];
    assert.deepEqual(ask.args, where, 'its size is asked for first');
    assert.deepEqual(get.args, [...where, '-H', 'Accept: application/vnd.github.raw+json']);
  });

  test('is nothing when there is no such file at the ref', () => {
    const side = fakeRepoSide();
    assert.equal(readRequirementsAt(side.run, REPO, 'v0.0.1'), null);
  });

  test('is an error, with GitHub’s words, for any other failure', () => {
    const run = () => {
      throw Object.assign(new Error('gh api failed: HTTP 500'), { stderr: 'HTTP 500' });
    };
    assert.throws(() => readRequirementsAt(run, REPO, 'main'), /HTTP 500/);
  });

  test('is refused, by the size GitHub gives before it is downloaded, as unreadable and not as a failure', () => {
    const side = fakeRepoSide();
    side.hub.files.big = 'x'.repeat(MAX_FILE_BYTES + 1);
    assert.throws(
      () => readRequirementsAt(side.run, REPO, 'big'),
      (e) => e instanceof Unreadable && /too large/.test(e.message),
    );
    assert.equal(side.hub.calls.length, 1, 'the file itself was never downloaded');
  });
});

describe('the checks of a commit', () => {
  const run = (status, conclusion, extra = {}) => ({ path: CI_WORKFLOW, run_number: 1, status, conclusion, ...extra });
  const rollup = (runs) => {
    const side = fakeRepoSide();
    side.hub.workflowRuns[SHA] = runs;
    return checkRollup(side.run, REPO, SHA);
  };

  test('are those of CI’s own run, in the shape the slice board counts', () => {
    assert.equal(CI_WORKFLOW, '.github/workflows/ci.yml');
    assert.deepEqual(rollup([run('completed', 'success')]), [{ status: 'COMPLETED', conclusion: 'SUCCESS' }]);
    assert.deepEqual(rollup([run('in_progress', null)]), [{ status: 'IN_PROGRESS', conclusion: '' }]);
  });

  test('leave out every other workflow, the one that wakes the build status among them', () => {
    assert.equal(TRIGGER_JOB, 'build-status-trigger');
    const others = ['codeql', 'dependency-review', 'lock-conversations', 'build-status-trigger'].map((name) =>
      run('completed', 'failure', { path: `.github/workflows/${name}.yml`, run_number: 9 }),
    );
    assert.deepEqual(rollup(others), []);
  });

  test('know CI by its path, whatever the ref the path is given with, and not by a name a pull request could choose', () => {
    const named = run('completed', 'failure', { name: 'CI', path: '.github/workflows/other.yml' });
    assert.deepEqual(rollup([named]), []);
    const refd = run('completed', 'success', { path: `${CI_WORKFLOW}@refs/pull/7/merge` });
    assert.deepEqual(rollup([refd]), [{ status: 'COMPLETED', conclusion: 'SUCCESS' }]);
  });

  test('are those of the newest run of CI, as when it was run again', () => {
    const runs = [run('completed', 'failure', { run_number: 1 }), run('completed', 'success', { run_number: 2 })];
    assert.deepEqual(rollup(runs), [{ status: 'COMPLETED', conclusion: 'SUCCESS' }]);
  });

  test('are none while CI has not started', () => {
    assert.deepEqual(rollup([]), []);
  });

  test('are refused when there are as many runs as one page holds, which may be only part of them', () => {
    const runs = Array.from({ length: 100 }, () => run('completed', 'success', { path: '.github/workflows/x.yml' }));
    assert.throws(() => rollup(runs), /more than 100/);
  });
});

describe('the release before another', () => {
  const releases = [
    { tag_name: 'v0.3.0', draft: false, published_at: '2026-10-01T10:00:00Z' },
    { tag_name: 'v0.4.0', draft: false, published_at: '2026-10-10T10:00:00Z' },
    { tag_name: 'v0.4.1-draft', draft: true, published_at: null },
    { tag_name: 'v0.2.0', draft: false, published_at: '2026-09-01T10:00:00Z' },
  ];

  test('is the one published just before it, by date, drafts left out', () => {
    const { hub, run } = fakeRepoSide();
    hub.releases = releases;
    assert.equal(releaseBefore(run, REPO, 'v0.4.0'), 'v0.3.0');
    assert.equal(releaseBefore(run, REPO, 'v0.3.0'), 'v0.2.0');
  });

  test('is none for the first release', () => {
    const { hub, run } = fakeRepoSide();
    hub.releases = releases;
    assert.equal(releaseBefore(run, REPO, 'v0.2.0'), null);
    hub.releases = [];
    assert.equal(releaseBefore(run, REPO, 'v0.1.0'), null);
  });

  test('is the newest release when the tag is not in the list yet, as when it has only just been published', () => {
    const { hub, run } = fakeRepoSide();
    hub.releases = releases;
    assert.equal(releaseBefore(run, REPO, 'v9.9.9'), 'v0.4.0');
  });
});

describe('the one comment on a pull request', () => {
  const bot = { login: 'github-actions[bot]', type: 'Bot' };

  test('is made the first time, and says so', () => {
    const { hub, run } = fakeRepoSide();
    assert.equal(upsertComment(run, REPO, 5, `${MARKER}\nfirst`), 'created');
    assert.deepEqual(
      hub.comments[5].map((c) => c.body),
      [`${MARKER}\nfirst`],
    );
  });

  test('is updated, not added to, the next time', () => {
    const { hub, run } = fakeRepoSide();
    upsertComment(run, REPO, 5, `${MARKER}\nfirst`);
    assert.equal(upsertComment(run, REPO, 5, `${MARKER}\nsecond`), 'updated');
    assert.deepEqual(
      hub.comments[5].map((c) => c.body),
      [`${MARKER}\nsecond`],
    );
  });

  test('is left alone when it would say the same, so no write is made', () => {
    const { hub, run } = fakeRepoSide();
    upsertComment(run, REPO, 5, `${MARKER}\nsame`);
    hub.mutations.length = 0;
    assert.equal(upsertComment(run, REPO, 5, `${MARKER}\nsame`), 'unchanged');
    assert.deepEqual(hub.mutations, []);
  });

  test('is not made when it is told not to, and there is none to update', () => {
    const { hub, run } = fakeRepoSide();
    assert.equal(upsertComment(run, REPO, 5, `${MARKER}\nx`, { create: false }), 'absent');
    assert.deepEqual(hub.mutations, []);
    upsertComment(run, REPO, 5, `${MARKER}\nfirst`);
    assert.equal(upsertComment(run, REPO, 5, `${MARKER}\nsecond`, { create: false }), 'updated');
  });

  test('is looked for again just before it is made, in case another run made it in between', () => {
    const { hub, run } = fakeRepoSide();
    hub.afterList = () => {
      hub.comments[5] = [{ id: 40, body: `${MARKER}\nthe other run`, user: bot }];
    };
    assert.equal(upsertComment(run, REPO, 5, `${MARKER}\nthis run`), 'updated');
    assert.deepEqual(
      hub.comments[5].map((c) => c.body),
      [`${MARKER}\nthis run`],
    );
    assert.deepEqual(
      hub.mutations.filter((m) => m.startsWith('POST')),
      [],
    );
  });

  test('is found among many comments on later pages', () => {
    const { hub, run } = fakeRepoSide({ pageSize: 2 });
    hub.comments[5] = [1, 2, 3, 4].map((id) => ({ id, body: `chat ${id}`, user: { login: 'someone', type: 'User' } }));
    hub.comments[5].push({ id: 5, body: `${MARKER}\nold`, user: bot });
    assert.equal(upsertComment(run, REPO, 5, `${MARKER}\nnew`), 'updated');
    assert.equal(hub.comments[5].length, 5);
    assert.equal(hub.comments[5][4].body, `${MARKER}\nnew`);
  });

  test('is never taken from a person who wrote the marker in their own comment', () => {
    const { hub, run } = fakeRepoSide();
    hub.comments[5] = [{ id: 1, body: `${MARKER}\nmine`, user: { login: 'someone', type: 'User' } }];
    assert.equal(upsertComment(run, REPO, 5, `${MARKER}\nours`), 'created');
    assert.equal(hub.comments[5][0].body, `${MARKER}\nmine`);
    assert.equal(hub.comments[5].length, 2);
  });

  test('is asked for by a whole number, and written through the API with its text on the input, never in the arguments', () => {
    const { hub, run } = fakeRepoSide();
    upsertComment(run, REPO, 5, `${MARKER}\n"$(whoami)" \`x\``);
    const write = hub.calls.find((c) => c.args.includes('POST'));
    assert.ok(write.args.every((a) => !a.includes('whoami')));
    assert.equal(JSON.parse(write.input).body, `${MARKER}\n"$(whoami)" \`x\``);
    assert.throws(() => upsertComment(run, REPO, '5/../x', 'x'), /pull request number/);
  });
});

describe('the two tokens', () => {
  const spawned = [];
  const spawn = (_cmd, args, options) => {
    spawned.push({ args, env: options.env });
    return { status: 0, stdout: '{}', stderr: '' };
  };
  const env = {
    GH_TOKEN: 'workflow-token',
    PROJECT_TOKEN: 'project-token',
    GH_REPO: 'x/y',
    GH_HOST: 'h',
    PATH: '/bin',
  };

  test('go to their own runner: the workflow’s to the repository, the project’s to the board, neither seeing the other', () => {
    spawned.length = 0;
    const { github, project } = runnersFrom(env, spawn);
    github(['api', 'x']);
    project(['api', 'y']);
    const [g, p] = spawned.map((s) => s.env);
    assert.equal(g.GH_TOKEN, 'workflow-token');
    assert.equal(p.GH_TOKEN, 'project-token');
    for (const e of [g, p]) {
      assert.ok(!('PROJECT_TOKEN' in e));
      assert.ok(!('GITHUB_TOKEN' in e));
      assert.ok(!('GH_REPO' in e) && !('GH_HOST' in e));
      assert.equal(e.PATH, '/bin');
    }
  });

  test('leave no project runner when the project token is not set or is only blanks', () => {
    for (const PROJECT_TOKEN of [undefined, '', '  \n']) {
      const { project } = runnersFrom({ GH_TOKEN: 'workflow-token', PROJECT_TOKEN }, spawn);
      assert.equal(project, null);
    }
  });

  test('need the workflow’s own token, which is a mistake in the workflow when it is missing', () => {
    assert.throws(() => runnersFrom({ PROJECT_TOKEN: 'p' }, spawn), /GH_TOKEN/);
  });
});
