// Started on: the day a pull request of this repository, draft or open, first took a requirement on, by its copy or its
// Requirements line. The build status sets it from the pull request's own creation. It keeps it while any pull request
// holds the item, and once it merges. It clears it when the pull request closes unmerged and nothing else holds the
// item. The mirror's seed puts it right on the next sync. Each case runs against the in-memory stand-ins for gh. Editor
// spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../scripts/slice-board.mjs';
import { desiredState } from '../scripts/github-project-desired.mjs';
import { mirror } from '../scripts/github-project.mjs';
import { seedOf } from '../scripts/build-status-seed.mjs';
import { readPullRequest } from '../scripts/build-status-gh.mjs';
import { FIXTURE, WORKSTREAMS } from './repository/github-project-fixture.js';
import { fakeRepoSide, mirroredProject, pull } from './repository/build-status-fake.js';
import { HEAD, HEAD_TEXT, MERGE, PARENT, REPO, checksOf, world } from './repository/build-status-world.js';

const OTHER = 'e'.repeat(40);
const OPENED = '2026-10-10T16:20:00Z';
const started = (w, id) => w.value(id, 'Started on');
const opened = (w, n = 7, at = OPENED) => {
  w.side.hub.pulls[n].created_at = at;
};
const second = (w, files, overrides = {}) => {
  w.side.hub.pulls[8] = pull(8, { head: OTHER, createdAt: '2026-10-12T09:00:00Z', ...overrides });
  w.side.hub.files[OTHER] = files;
};
const merge = (w) => {
  Object.assign(w.side.hub.pulls[7], { state: 'closed', merged: true, merge_commit_sha: MERGE });
  w.side.hub.parents[MERGE] = PARENT;
  w.side.hub.files[MERGE] = HEAD_TEXT;
  w.side.hub.files[PARENT] = FIXTURE;
  w.side.hub.forSha[MERGE] = [7];
};

describe('a pull request’s day', () => {
  test('is read from its created_at, as a day in UTC, and is none when GitHub gives none', () => {
    const side = fakeRepoSide();
    side.hub.pulls[3] = pull(3, { createdAt: '2026-10-10T23:30:00-03:00' });
    side.hub.pulls[4] = pull(4);
    assert.equal(readPullRequest(side.run, REPO, 3).createdAt, '2026-10-11');
    assert.equal(readPullRequest(side.run, REPO, 4).createdAt, null);
  });
});

describe('Started on, set by the build status', () => {
  test('is set, on the items a pull request takes on, to the day it was opened', async () => {
    const w = world();
    opened(w);
    await w.trigger();
    assert.deepEqual([started(w, 'focus_link'), started(w, 'focus_neighbours')], ['2026-10-10', '2026-10-10']);
    assert.equal(started(w, 'zoom_out_to_fit'), undefined);
  });

  test('is set by a draft’s Requirements line before its copy proves anything', async () => {
    const w = world();
    opened(w);
    Object.assign(w.side.hub.pulls[7], { draft: true, body: 'Requirements: zoom_out_to_fit' });
    w.side.hub.files[HEAD] = FIXTURE;
    await w.trigger();
    assert.equal(started(w, 'zoom_out_to_fit'), '2026-10-10');
  });

  test('is kept once set: a later pull request does not move it', async () => {
    const w = world();
    opened(w);
    await w.trigger();
    second(w, HEAD_TEXT, { createdAt: '2026-10-14T09:00:00Z' });
    await w.send('workflow_run', checksOf([8], OTHER));
    assert.equal(started(w, 'focus_link'), '2026-10-10');
  });

  test('is kept when the pull request merges', async () => {
    const w = world();
    opened(w);
    await w.trigger();
    merge(w);
    await w.send('push', { after: MERGE });
    assert.equal(w.value('focus_link'), 'Merged');
    assert.equal(started(w, 'focus_link'), '2026-10-10');
  });

  test('is cleared when the pull request closes unmerged and nothing else holds the item', async () => {
    const w = world();
    opened(w);
    await w.trigger();
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.deepEqual([started(w, 'focus_link'), started(w, 'focus_neighbours')], [undefined, undefined]);
    assert.ok(w.gh.hub.mutations.some((m) => m.includes('clearProjectV2ItemFieldValue')));
  });

  test('is kept while another pull request holds the item, and only the items it holds', async () => {
    const w = world();
    opened(w);
    second(w, FIXTURE, { body: 'Requirements: focus_link' });
    await w.trigger();
    await w.send('workflow_run', checksOf([8], OTHER));
    w.side.hub.pulls[7].state = 'closed';
    await w.trigger();
    assert.equal(started(w, 'focus_link'), '2026-10-10', 'pull request 8 still holds it');
    assert.equal(started(w, 'focus_neighbours'), undefined);
  });

  test('is left as it is for a pull request GitHub gives no day for', async () => {
    const w = world();
    await w.trigger();
    assert.equal(started(w, 'focus_link'), undefined);
  });
});

describe('Started on, put right by the mirror', () => {
  const desired = desiredState(readBoard(FIXTURE), WORKSTREAMS, [3, 4]);
  const sync = (side, gh) =>
    mirror(
      { desired, mode: 'apply', seed: (run, repo) => seedOf(side.run, repo) },
      { run: gh.run, originRepo: REPO, write: () => {}, sleep: () => {} },
    );
  const setUp = () => {
    const gh = mirroredProject();
    const side = fakeRepoSide({ issues: () => gh.hub.issues });
    side.hub.files.main = FIXTURE;
    return { gh, side };
  };
  const itemOf = (gh, id) => {
    const issue = gh.hub.issues.find((i) => i.body.includes(`<!-- requirement:${id} -->`));
    return gh.hub.projects[0].items.find((i) => i.number === issue.number);
  };
  const valueOf = (gh, id) => itemOf(gh, id).values['Started on'];

  test('the seed gives an item an open pull request holds the earliest day of those that hold it', () => {
    const { side } = setUp();
    side.hub.pulls[7] = pull(7, { head: HEAD, createdAt: '2026-10-12T10:00:00Z' });
    side.hub.pulls[8] = pull(8, { head: OTHER, createdAt: '2026-10-09T10:00:00Z' });
    side.hub.files[HEAD] = HEAD_TEXT;
    side.hub.files[OTHER] = HEAD_TEXT;
    const { seed } = seedOf(side.run, REPO);
    assert.equal(seed.get('focus_link').startedOn, '2026-10-09');
  });

  test('sets the day where none is, clears it where no pull request holds an item that is not proved', () => {
    const { gh, side } = setUp();
    side.hub.pulls[7] = pull(7, { head: HEAD, createdAt: OPENED });
    side.hub.files[HEAD] = HEAD_TEXT;
    const item = (id) => {
      const issue = gh.hub.issues.find((i) => i.body.includes(`<!-- requirement:${id} -->`));
      return gh.hub.projects[0].items.find((i) => i.number === issue.number);
    };
    item('stray_new').values['Started on'] = '2026-09-01';
    assert.equal(item('stray_new').values['Build status'], 'Not started');
    sync(side, gh);
    assert.equal(valueOf(gh, 'focus_link'), '2026-10-10');
    assert.equal(valueOf(gh, 'stray_new'), undefined, 'Not started: no pull request holds it and no test is written');
  });

  test('1 of 3 tests written and merged keeps Started on, though no pull request holds the requirement now', () => {
    const THIRD =
      "(test_third:Test {proves: 'a third proof', file: 'test/third.test.js', where: 'repo', status: 'planned'}),";
    const three = FIXTURE.replace(
      '// ── Links ──',
      `${THIRD}\n// ── Links ──\n(focus_neighbours)-[:PROVED_BY]->(test_third),`,
    );
    const board = readBoard(three);
    assert.equal(board.requirements.find((r) => r.id === 'focus_neighbours').status, 'part');
    const { gh, side } = setUp();
    side.hub.files.main = three;
    const item = itemOf(gh, 'focus_neighbours');
    Object.assign(item.values, { 'Started on': '2026-10-01', 'Build status': 'Merged', Status: 'Done' });
    mirror(
      { desired: desiredState(board, WORKSTREAMS, [3, 4]), mode: 'apply', seed: (run, repo) => seedOf(side.run, repo) },
      { run: gh.run, originRepo: REPO, write: () => {}, sleep: () => {} },
    );
    assert.equal(valueOf(gh, 'focus_neighbours'), '2026-10-01');
  });

  test('keeps the day of an item with a test written, or with a Build status past Not started', () => {
    const { gh, side } = setUp();
    Object.assign(itemOf(gh, 'focus_neighbours').values, { 'Started on': '2026-10-02' });
    Object.assign(itemOf(gh, 'stray_new').values, { 'Started on': '2026-10-03', 'Build status': 'Checks passing' });
    sync(side, gh);
    assert.equal(valueOf(gh, 'focus_neighbours'), '2026-10-02', 'part on main: a test is written');
    assert.equal(valueOf(gh, 'stray_new'), '2026-10-03', 'its build is past Not started');
  });

  test('keeps the day of an item proved on main, and of one already started', () => {
    const { gh, side } = setUp();
    side.hub.pulls[7] = pull(7, { head: HEAD, createdAt: OPENED });
    side.hub.files[HEAD] = HEAD_TEXT;
    const item = (id) => {
      const issue = gh.hub.issues.find((i) => i.body.includes(`<!-- requirement:${id} -->`));
      return gh.hub.projects[0].items.find((i) => i.number === issue.number);
    };
    item('zoom_out_to_fit').values['Started on'] = '2026-08-01';
    item('focus_link').values['Started on'] = '2026-10-01';
    sync(side, gh);
    assert.equal(valueOf(gh, 'zoom_out_to_fit'), '2026-08-01', 'proved on main');
    assert.equal(valueOf(gh, 'focus_link'), '2026-10-01', 'the first pull request’s day stays');
  });
});
