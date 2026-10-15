// The comments the build status leaves after a pull request is closed and its conversation locked: the Merged comment,
// and the Released comment a release leaves on each pull request it moves. Every comment is tried first; only a refusal
// because the conversation is locked unlocks it, comments and locks it again, in the one step. Each case runs the whole of
// scripts/build-status-run.mjs against in-memory stand-ins for gh. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURE } from './repository/github-project-fixture.js';
import { pull } from './repository/build-status-fake.js';
import { HEAD_TEXT, MERGE, MOVED, PARENT, world } from './repository/build-status-world.js';

const LOCK = 'repos/rogerbucks/graph-note/issues/7/lock';
const COMMENTS = 'repos/rogerbucks/graph-note/issues/7/comments';
const OTHER_MERGE = 'f'.repeat(40);
const OTHER_PARENT = '9'.repeat(40);
const ZOOM_TEST =
  "(test_zoom_new:Test {proves: 'a zoom proof', file: 'test/zoom-new.test.js', where: 'repo', status: 'written'}),";
const ZOOM_TEXT = FIXTURE.replace(
  '// ── Links ──',
  `${ZOOM_TEST}\n// ── Links ──\n(zoom_out_to_fit)-[:PROVED_BY]->(test_zoom_new),`,
);

/** Pull request 7 merged into main, and its conversation locked, as the lock workflow leaves every pull request. */
const mergedAndLocked = (w) => {
  Object.assign(w.side.hub.pulls[7], {
    state: 'closed',
    merged: true,
    merge_commit_sha: MERGE,
    merged_at: '2026-10-10T10:00:00Z',
  });
  w.side.hub.parents[MERGE] = PARENT;
  w.side.hub.files[MERGE] = HEAD_TEXT;
  w.side.hub.files[PARENT] = FIXTURE;
  w.side.hub.forSha[MERGE] = [7];
  w.side.hub.locked.add(7);
};

describe('the Merged comment, after the pull request is closed and locked', () => {
  test('is made when the conversation is open, without touching its lock', async () => {
    const w = world();
    mergedAndLocked(w);
    w.side.hub.locked.delete(7);
    await w.send('push', { after: MERGE });
    assert.deepEqual(w.side.hub.mutations, [`POST ${COMMENTS}`]);
    assert.match(w.comments()[0].body, /Build status: Merged/);
  });

  test('is made by unlocking, commenting and locking again, in the one step', async () => {
    const w = world();
    mergedAndLocked(w);
    const result = await w.send('push', { after: MERGE });
    assert.deepEqual(w.side.hub.mutations, [`DELETE ${LOCK}`, `POST ${COMMENTS}`, `PUT ${LOCK}`]);
    assert.equal(w.side.hub.locked.has(7), true);
    assert.match(w.comments()[0].body, /Build status: Merged/);
    assert.deepEqual(w.annotations, []);
    assert.equal(result.pulls[0].comment, 'created');
  });

  test('warns, and still makes the comment, when the lock cannot be taken up again', async () => {
    const w = world();
    mergedAndLocked(w);
    w.side.hub.failLock = 'HTTP 403: Resource not accessible by integration';
    await w.send('push', { after: MERGE });
    assert.equal(w.comments().length, 1);
    assert.equal(w.annotations.length, 1);
    assert.equal(w.annotations[0][0], 'warning');
    assert.match(w.annotations[0][1], /lock the conversation of #7 again/);
    assert.match(w.annotations[0][1], /Resource not accessible/);
  });

  test('warns, and unlocks nothing, when GitHub will not let it unlock', async () => {
    const w = world();
    mergedAndLocked(w);
    w.side.hub.failUnlock = 'HTTP 403: Resource not accessible by integration';
    const result = await w.send('push', { after: MERGE });
    assert.deepEqual(w.comments(), []);
    assert.match(w.annotations[0][1], /could not leave the comment on #7: could not unlock/);
    assert.equal(result.pulls[0].comment, 'failed');
    assert.equal(w.value('focus_link'), 'Merged', 'the board is updated all the same');
  });

  test('warns, and goes no further, for any other refusal of the comment', async () => {
    const w = world();
    mergedAndLocked(w);
    w.side.hub.locked.delete(7);
    w.side.hub.failComments = 'HTTP 500: the comment could not be made';
    const result = await w.send('push', { after: MERGE });
    assert.match(w.annotations[0][1], /comment on #7/);
    assert.equal(result.pulls[0].comment, 'failed');
    assert.deepEqual(w.side.hub.mutations, []);
  });

  test('is updated, not added to, when the Checks comment is already there on a conversation since locked', async () => {
    const w = world();
    await w.trigger();
    mergedAndLocked(w);
    await w.send('push', { after: MERGE });
    assert.equal(w.comments().length, 1);
    assert.match(w.comments()[0].body, /Build status: Merged/);
    assert.equal(w.side.hub.locked.has(7), true);
  });
});

describe('a release', () => {
  const release = (w) => {
    w.side.hub.releases = [
      { tag_name: 'v0.4.0', draft: false, published_at: '2026-10-01T10:00:00Z' },
      { tag_name: 'v0.5.0', draft: false, published_at: '2026-10-14T10:00:00Z' },
    ];
    w.side.hub.files['v0.4.0'] = FIXTURE;
    w.side.hub.files['v0.5.0'] = HEAD_TEXT;
  };
  const send = (w) => w.send('release', { release: { tag_name: 'v0.5.0', published_at: '2026-10-14T10:00:00Z' } });

  test('comments Released on each pull request it moves, closed and locked as they are', async () => {
    const w = world();
    release(w);
    mergedAndLocked(w);
    const result = await send(w);
    assert.deepEqual(result.release, {
      tag: 'v0.5.0',
      since: 'v0.4.0',
      ids: MOVED,
      pulls: [{ number: 7, comment: 'created' }],
    });
    assert.match(w.comments()[0].body, /Build status: Released/);
    for (const id of MOVED) assert.match(w.comments()[0].body, new RegExp(`\`${id}\` .*: Released`));
    assert.deepEqual(w.side.hub.mutations, [`DELETE ${LOCK}`, `POST ${COMMENTS}`, `PUT ${LOCK}`]);
    assert.deepEqual(w.annotations, []);
  });

  test('updates the comment the pull request has, so it is still the one comment', async () => {
    const w = world();
    release(w);
    await w.trigger();
    mergedAndLocked(w);
    await w.send('push', { after: MERGE });
    await send(w);
    assert.equal(w.comments().length, 1);
    assert.match(w.comments()[0].body, /Build status: Released/);
  });

  test('leaves out a pull request merged before the release before, and one that proved none of the release’s', async () => {
    const w = world();
    release(w);
    mergedAndLocked(w);
    w.side.hub.pulls[9] = pull(9, {
      state: 'closed',
      merged: true,
      mergeSha: OTHER_MERGE,
      mergedAt: '2026-09-20T10:00:00Z',
    });
    w.side.hub.pulls[10] = pull(10, {
      state: 'closed',
      merged: true,
      mergeSha: OTHER_MERGE,
      mergedAt: '2026-10-12T10:00:00Z',
    });
    w.side.hub.parents[OTHER_MERGE] = OTHER_PARENT;
    w.side.hub.files[OTHER_MERGE] = ZOOM_TEXT;
    w.side.hub.files[OTHER_PARENT] = FIXTURE;
    const result = await send(w);
    assert.deepEqual(
      result.release.pulls.map((p) => p.number),
      [7],
    );
    assert.equal(w.comments(9).length + w.comments(10).length, 0);
  });

  test('leaves out a pull request from a fork, and one merged into another branch', async () => {
    const w = world();
    release(w);
    mergedAndLocked(w);
    w.side.hub.pulls[7].head.repo.full_name = 'someone/graph-note';
    const result = await send(w);
    assert.deepEqual(result.release.pulls, []);
    assert.deepEqual(w.comments(), []);
  });

  test('says in each comment when the board could not be updated, as a pull request’s comment does', async () => {
    const w = world({ token: '' });
    release(w);
    mergedAndLocked(w);
    await send(w);
    assert.match(w.comments()[0].body, /PROJECT_TOKEN is not set/);
    assert.equal(w.annotations.filter(([, text]) => /PROJECT_TOKEN is not set/.test(text)).length, 1);
  });

  test('warns when more pull requests were merged than it looks at', async () => {
    const w = world();
    release(w);
    mergedAndLocked(w);
    for (let n = 20; n < 90; n += 1)
      w.side.hub.pulls[n] = pull(n, {
        state: 'closed',
        merged: true,
        mergeSha: OTHER_MERGE,
        mergedAt: '2026-10-12T10:00:00Z',
      });
    w.side.hub.parents[OTHER_MERGE] = OTHER_PARENT;
    w.side.hub.files[OTHER_MERGE] = FIXTURE;
    w.side.hub.files[OTHER_PARENT] = FIXTURE;
    await send(w);
    assert.ok(w.annotations.some(([level, text]) => level === 'warning' && /more pull requests/.test(text)));
  });

  test('does not comment when it releases nothing', async () => {
    const w = world();
    release(w);
    w.side.hub.files['v0.5.0'] = FIXTURE;
    mergedAndLocked(w);
    const result = await send(w);
    assert.deepEqual(result.release.pulls, []);
    assert.deepEqual(w.side.hub.mutations, []);
  });
});
