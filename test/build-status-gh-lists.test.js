// The lists the build status reads from GitHub — the open pull requests, the pull requests merged in a span, the issues —
// are of this repository’s own only before any cap is applied, so that a crowd of pull requests from forks, or of issues
// somebody else wrote, cannot hide a pull request that holds an item or push the mirror’s issues past the cap. Every case
// runs against an in-memory stand-in for gh, so no network is touched. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mergedPullNumbers, openPullNumbers } from '../scripts/build-status-gh.mjs';
import { fakeRepoSide, pull } from './repository/build-status-fake.js';

const REPO = 'rogerbucks/thoughtknot';
const SHA = 'b'.repeat(40);
const fork = { headRepo: 'someone/thoughtknot' };
const merged = (n, extra = {}) =>
  pull(n, { state: 'closed', merged: true, mergedAt: '2026-10-05T10:00:00Z', mergeSha: SHA, ...extra });
const asked = (hub, text) => hub.calls.filter((c) => c.args[1].includes(text)).length;

describe('the open pull requests', () => {
  test('are those of this repository, found past a crowd of fork pull requests that are newer', () => {
    const { hub, run } = fakeRepoSide();
    for (let n = 100; n < 220; n += 1) hub.pulls[n] = pull(n, fork);
    for (const n of [3, 5]) hub.pulls[n] = pull(n);
    assert.deepEqual(openPullNumbers(run, REPO), [3, 5]);
    assert.equal(asked(hub, 'pulls?state=open'), 2, 'the second page was asked for');
  });

  test('are counted without the forks’ against the cap of fifty', () => {
    const { hub, run } = fakeRepoSide();
    for (let n = 100; n < 160; n += 1) hub.pulls[n] = pull(n, fork);
    for (const n of [1, 2, 3]) hub.pulls[n] = pull(n);
    assert.deepEqual(openPullNumbers(run, REPO), [1, 2, 3]);
  });

  test('leave out one whose head repository has gone, and one whose base is another repository', () => {
    const { hub, run } = fakeRepoSide();
    hub.pulls[1] = pull(1, { headRepo: null });
    hub.pulls[2] = pull(2, { baseRepo: 'someone/thoughtknot' });
    hub.pulls[3] = pull(3);
    assert.deepEqual(openPullNumbers(run, REPO), [3]);
  });

  test('stop being asked for once there are fifty of this repository’s, and are no more than fifty', () => {
    const { hub, run } = fakeRepoSide();
    for (let n = 1; n <= 120; n += 1) hub.pulls[n] = pull(n);
    assert.equal(openPullNumbers(run, REPO).length, 50);
    assert.equal(asked(hub, 'pulls?state=open'), 1);
  });

  test('are only asked for in pages, a hundred to a page, and not past ten pages', () => {
    const { hub, run } = fakeRepoSide();
    for (let n = 1; n <= 1200; n += 1) hub.pulls[n] = pull(n, fork);
    assert.deepEqual(openPullNumbers(run, REPO), []);
    assert.equal(asked(hub, 'pulls?state=open'), 10);
  });
});

describe('the pull requests merged in a span', () => {
  test('are those of this repository, found past a crowd of merged fork pull requests that are newer', () => {
    const { hub, run } = fakeRepoSide();
    for (let n = 100; n < 220; n += 1) hub.pulls[n] = merged(n, fork);
    for (const n of [3, 4]) hub.pulls[n] = merged(n);
    const found = mergedPullNumbers(run, REPO, null, null);
    assert.deepEqual(found, { numbers: [3, 4], truncated: false });
    assert.equal(asked(hub, 'pulls?state=closed'), 2);
  });

  test('are counted without the forks’ against the cap of fifty, and say truncated only for this repository’s own', () => {
    const { hub, run } = fakeRepoSide();
    for (let n = 100; n < 160; n += 1) hub.pulls[n] = merged(n, fork);
    for (const n of [1, 2, 3]) hub.pulls[n] = merged(n);
    assert.deepEqual(mergedPullNumbers(run, REPO, null, null), { numbers: [1, 2, 3], truncated: false });
    for (let n = 10; n < 70; n += 1) hub.pulls[n] = merged(n);
    const more = mergedPullNumbers(run, REPO, null, null);
    assert.equal(more.numbers.length, 50);
    assert.equal(more.truncated, true);
  });

  test('leave out one whose head repository has gone', () => {
    const { hub, run } = fakeRepoSide();
    hub.pulls[1] = merged(1, { headRepo: null });
    hub.pulls[2] = merged(2);
    assert.deepEqual(mergedPullNumbers(run, REPO, null, null).numbers, [2]);
  });

  test('say truncated where the pages ran out before the list did', () => {
    const { hub, run } = fakeRepoSide();
    for (let n = 1; n <= 1200; n += 1) hub.pulls[n] = merged(n, fork);
    const found = mergedPullNumbers(run, REPO, null, null);
    assert.deepEqual(found.numbers, []);
    assert.equal(found.truncated, true);
    assert.equal(asked(hub, 'pulls?state=closed'), 10);
  });
});
