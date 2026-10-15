// Leaving the build status comment on a conversation that may be locked: the comment is tried first, and only if the pull
// request is locked (its own `locked` field, read from the API, and not a word in GitHub’s refusal) is it unlocked,
// commented and locked again in the one step. The lock is taken up again with the repository’s retry for a short failure
// of GitHub. Every case runs against an in-memory stand-in for gh, so no network is touched. Editor spec §12,
// requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { leaveComment } from '../scripts/build-status-gh.mjs';
import { fakeRepoSide, pull } from './repository/build-status-fake.js';

const REPO = 'rogerbucks/graph-note';
const MARKER = '<!-- build-status -->';
const lockPath = `repos/${REPO}/issues/5/lock`;
const commentsPath = `repos/${REPO}/issues/5/comments`;
const noSleep = () => {};
const BAD_GATEWAY = Object.assign(new Error('gh api failed: HTTP 502: Bad Gateway'), {
  stderr: 'HTTP 502: Bad Gateway',
});

/** A repository with pull request 5 in it. */
const side = () => {
  const made = fakeRepoSide();
  made.hub.pulls[5] = pull(5);
  return made;
};
/** A runner that fails the next `times` writes of the lock with a short failure of GitHub, as a busy GitHub does. */
const flakyLock = (run, times) => {
  const seen = { puts: 0 };
  let left = times;
  const flaky = (args, input) => {
    if (args.includes('PUT') && args[1].endsWith('/lock')) {
      seen.puts += 1;
      if (left > 0) {
        left -= 1;
        throw BAD_GATEWAY;
      }
    }
    return run(args, input);
  };
  return { flaky, seen };
};

describe('leaving the comment on a conversation that may be locked', () => {
  test('is plain when the conversation is open: no lock is touched', () => {
    const { hub, run } = side();
    assert.deepEqual(leaveComment(run, REPO, 5, `${MARKER}\nx`), {
      outcome: 'created',
      unlocked: false,
      relockFailed: null,
      failure: null,
    });
    assert.deepEqual(hub.mutations, [`POST ${commentsPath}`]);
  });

  test('unlocks, comments and locks again in the one step when the pull request is locked', () => {
    const { hub, run } = side();
    hub.locked.add(5);
    const left = leaveComment(run, REPO, 5, `${MARKER}\nx`);
    assert.deepEqual([left.outcome, left.unlocked, left.relockFailed, left.failure], ['created', true, null, null]);
    assert.deepEqual(hub.mutations, [`DELETE ${lockPath}`, `POST ${commentsPath}`, `PUT ${lockPath}`]);
    assert.equal(hub.locked.has(5), true, 'locked again');
    assert.equal(hub.comments[5].length, 1);
  });

  test('does the same to update the comment it made before', () => {
    const { hub, run } = side();
    leaveComment(run, REPO, 5, `${MARKER}\nfirst`);
    hub.locked.add(5);
    hub.mutations.length = 0;
    const left = leaveComment(run, REPO, 5, `${MARKER}\nsecond`);
    assert.equal(left.outcome, 'updated');
    assert.equal(hub.mutations.length, 3);
    assert.match(hub.mutations[0], /^DELETE /);
    assert.match(hub.mutations[2], /^PUT /);
    assert.equal(hub.comments[5][0].body, `${MARKER}\nsecond`);
  });

  test('takes the lock from the pull request’s own field: a refusal that says blocked, with nothing locked, unlocks nothing', () => {
    const { hub, run } = side();
    hub.failComments = 'HTTP 422: the request was blocked by a rule';
    const left = leaveComment(run, REPO, 5, `${MARKER}\nx`);
    assert.deepEqual([left.outcome, left.unlocked], ['failed', false]);
    assert.match(left.failure, /blocked by a rule/);
    assert.deepEqual(hub.mutations, []);
    assert.ok(
      hub.calls.some((c) => c.args[1] === `repos/${REPO}/pulls/5`),
      'it asked whether the pull request is locked',
    );
  });

  test('gives any other failure as it is when the pull request is not locked, and touches no lock', () => {
    const { hub, run } = side();
    hub.failComments = 'HTTP 500: the comment could not be made';
    const left = leaveComment(run, REPO, 5, `${MARKER}\nx`);
    assert.deepEqual([left.outcome, left.unlocked], ['failed', false]);
    assert.match(left.failure, /could not be made/);
    assert.deepEqual(hub.mutations, []);
  });

  test('unlocks for a locked pull request whatever the words of the refusal, and says why a second try fails', () => {
    const { hub, run } = side();
    hub.locked.add(5);
    hub.failAfterUnlock = 'HTTP 500: the comment could not be made';
    const left = leaveComment(run, REPO, 5, `${MARKER}\nx`);
    assert.match(left.failure, /could not be made/);
    assert.equal(left.unlocked, true);
    assert.equal(hub.locked.has(5), true, 'it did not leave the conversation open');
  });

  test('gives the first failure as it is when it cannot tell whether the pull request is locked', () => {
    const { hub, run } = side();
    delete hub.pulls[5];
    hub.failComments = 'HTTP 500: the comment could not be made';
    const left = leaveComment(run, REPO, 5, `${MARKER}\nx`);
    assert.match(left.failure, /could not be made/);
    assert.deepEqual(hub.mutations, []);
  });

  test('says when it cannot unlock, makes no comment, and has nothing to lock again', () => {
    const { hub, run } = side();
    hub.locked.add(5);
    hub.failUnlock = 'HTTP 403: Resource not accessible by integration';
    const left = leaveComment(run, REPO, 5, `${MARKER}\nx`);
    assert.match(left.failure, /unlock/);
    assert.match(left.failure, /Resource not accessible/);
    assert.equal(left.unlocked, false);
    assert.deepEqual(hub.mutations, []);
    assert.equal(hub.locked.has(5), true);
  });

  test('says when it cannot lock again, the comment being made and the conversation left open', () => {
    const { hub, run } = side();
    hub.locked.add(5);
    hub.failLock = 'HTTP 403: Resource not accessible by integration';
    const left = leaveComment(run, REPO, 5, `${MARKER}\nx`, { sleep: noSleep });
    assert.equal(left.outcome, 'created');
    assert.equal(left.unlocked, true);
    assert.match(left.relockFailed, /Resource not accessible/);
    assert.equal(hub.locked.has(5), false);
  });
});

describe('locking the conversation again', () => {
  test('is tried again after a short failure of GitHub, as the mirror’s calls are, and then is done', () => {
    const { hub, run } = side();
    hub.locked.add(5);
    const { flaky, seen } = flakyLock(run, 1);
    const left = leaveComment(flaky, REPO, 5, `${MARKER}\nx`, { sleep: noSleep });
    assert.equal(left.relockFailed, null);
    assert.equal(seen.puts, 2);
    assert.equal(hub.locked.has(5), true);
  });

  test('is tried up to three times more, and then said to have failed, with the conversation left unlocked', () => {
    const { hub, run } = side();
    hub.locked.add(5);
    const { flaky, seen } = flakyLock(run, 10);
    const left = leaveComment(flaky, REPO, 5, `${MARKER}\nx`, { sleep: noSleep });
    assert.match(left.relockFailed, /502/);
    assert.equal(seen.puts, 4);
    assert.equal(hub.locked.has(5), false);
    assert.equal(left.outcome, 'created');
  });

  test('waits the repository’s waits between tries, not its own', () => {
    const { hub, run } = side();
    hub.locked.add(5);
    const { flaky } = flakyLock(run, 10);
    const waits = [];
    leaveComment(flaky, REPO, 5, `${MARKER}\nx`, { sleep: (ms) => waits.push(ms) });
    assert.deepEqual(waits, [5000, 15000, 45000]);
  });

  test('is not tried again after a refusal that is not a short failure', () => {
    const { hub, run } = side();
    hub.locked.add(5);
    hub.failLock = 'HTTP 403: Resource not accessible by integration';
    const before = hub.calls.length;
    leaveComment(run, REPO, 5, `${MARKER}\nx`, { sleep: noSleep });
    const puts = hub.calls.slice(before).filter((c) => c.args.includes('PUT'));
    assert.equal(puts.length, 1);
  });
});
