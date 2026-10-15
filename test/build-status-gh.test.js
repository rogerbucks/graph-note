// The thin layer between the build status and GitHub: reading a pull request, the requirements file at a ref, a commit’s
// checks and releases, leaving one comment, and reading and writing the project’s Build status field. Every case runs
// against in-memory stand-ins for gh (test/repository/build-status-fake.js and github-project-fake.js) handed in as the
// runner, so no network is touched. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BoardProblem,
  IGNORED_CHECKS,
  MAX_FILE_BYTES,
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
} from '../scripts/build-status-gh.mjs';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { fakeGithub } from './repository/github-project-fake.js';
import { fakeRepoSide, mirroredProject, pull } from './repository/build-status-fake.js';

const REPO = 'rogerbucks/graph-note';
const SHA = 'b'.repeat(40);
const noSleep = () => {};
const MARKER = '<!-- build-status -->';

describe('a pull request', () => {
  test('is read as its state, whether it merged, its merge commit, its head commit and its base branch', () => {
    const side = fakeRepoSide();
    side.hub.pulls[7] = pull(7, { state: 'closed', merged: true, head: SHA, mergeSha: 'c'.repeat(40) });
    assert.deepEqual(readPullRequest(side.run, REPO, 7), {
      number: 7,
      state: 'closed',
      merged: true,
      mergeSha: 'c'.repeat(40),
      headSha: SHA,
      baseRef: 'main',
    });
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
    const [call] = side.hub.calls;
    assert.deepEqual(call.args, [
      'api',
      `repos/${REPO}/contents/${REQUIREMENTS}`,
      '--method',
      'GET',
      '-f',
      'ref=main',
      '-H',
      'Accept: application/vnd.github.raw+json',
    ]);
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

  test('is refused when it is larger than any requirements file should be', () => {
    const side = fakeRepoSide();
    side.hub.files.big = 'x'.repeat(MAX_FILE_BYTES + 1);
    assert.throws(() => readRequirementsAt(side.run, REPO, 'big'), /too large/);
  });
});

describe('the checks of a commit', () => {
  const side = () => fakeRepoSide();

  test('are the check runs and the commit statuses, in the shape the slice board counts', () => {
    const { hub, run } = side();
    hub.runs[SHA] = [
      { name: 'test', status: 'completed', conclusion: 'success' },
      { name: 'lint', status: 'in_progress', conclusion: null },
    ];
    hub.statuses[SHA] = [{ state: 'failure' }];
    assert.deepEqual(checkRollup(run, REPO, SHA), [
      { status: 'COMPLETED', conclusion: 'SUCCESS' },
      { status: 'IN_PROGRESS', conclusion: '' },
      { state: 'FAILURE' },
    ]);
  });

  test('leave out the job that only wakes the build status, which is not a check of the change', () => {
    const { hub, run } = side();
    assert.deepEqual(IGNORED_CHECKS, ['build-status-trigger']);
    hub.runs[SHA] = [{ name: 'build-status-trigger', status: 'completed', conclusion: 'success' }];
    assert.deepEqual(checkRollup(run, REPO, SHA), []);
  });

  test('are refused when there are more than one page holds, which would be only part of them', () => {
    const { hub, run } = side();
    hub.runs[SHA] = Array.from({ length: 100 }, () => ({ name: 'x', status: 'completed', conclusion: 'success' }));
    assert.throws(() => checkRollup(run, REPO, SHA), /more than 100/);
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

describe('the Build status field of the project', () => {
  const item = (gh, id) => {
    const board = readBuildBoard(gh.run, REPO);
    return board.items.get(id);
  };

  test('is read as each requirement’s item, its issue and its current value', () => {
    const gh = mirroredProject();
    const board = readBuildBoard(gh.run, REPO);
    assert.deepEqual([...board.items.keys()].sort(), [
      'done_means_proved',
      'focus_link',
      'focus_neighbours',
      'stray_new',
      'zoom_out_to_fit',
    ]);
    const got = board.items.get('focus_link');
    assert.equal(got.current, 'Not started');
    assert.equal(typeof got.number, 'number');
    assert.match(got.url, /\/issues\/\d+$/);
    assert.equal(board.owner, 'rogerbucks');
    assert.equal(board.projectNumber, 1);
  });

  test('is set by the id of its option, on the item, and nothing else is touched', () => {
    const gh = mirroredProject();
    const board = readBuildBoard(gh.run, REPO);
    setBuildStatus(gh.run, board, 'focus_link', 'Checks failing');
    assert.equal(item(gh, 'focus_link').current, 'Checks failing');
    assert.equal(item(gh, 'focus_neighbours').current, 'Not started');
    assert.equal(gh.hub.mutations.length, 1);
    assert.match(gh.hub.mutations[0], /item-edit/);
    const [project] = gh.hub.projects;
    const mine = project.items.find((i) => i.values['Build status'] === 'Checks failing');
    assert.equal(mine.values.Proof, 'open');
    assert.ok(project.items.every((i) => !('Status' in i.values)));
  });

  test('is a problem to report, not a crash, when the project or the field is not there yet', () => {
    const none = fakeGithub();
    assert.throws(
      () => readBuildBoard(none.run, REPO),
      (e) => e instanceof BoardProblem && /graph-note requirements/.test(e.message),
    );
    const gh = mirroredProject();
    gh.hub.projects[0].fields = gh.hub.projects[0].fields.filter((f) => f.name !== 'Build status');
    assert.throws(
      () => readBuildBoard(gh.run, REPO),
      (e) => e instanceof BoardProblem && /no Build status field/.test(e.message),
    );
  });

  test('is a problem to report when the field lacks the stage to set', () => {
    const gh = mirroredProject();
    const field = gh.hub.projects[0].fields.find((f) => f.name === 'Build status');
    field.options = field.options.filter((o) => o.name !== 'Released');
    const board = readBuildBoard(gh.run, REPO);
    assert.throws(
      () => setBuildStatus(gh.run, board, 'focus_link', 'Released'),
      (e) => e instanceof BoardProblem && /Released/.test(e.message),
    );
  });

  test('is waited for through a short failure of GitHub, as the mirror does', () => {
    const gh = mirroredProject();
    let failures = 1;
    const flaky = (args, input) => {
      if (args[0] === 'project' && args[1] === 'item-edit' && failures-- > 0)
        throw new Error('gh failed: HTTP 502 Bad Gateway');
      return gh.run(args, input);
    };
    const board = readBuildBoard(gh.run, REPO);
    setBuildStatus(flaky, board, 'focus_link', 'Merged', { sleep: noSleep });
    assert.equal(item(gh, 'focus_link').current, 'Merged');
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
