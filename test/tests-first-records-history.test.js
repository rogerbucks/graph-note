// This repository's own records of the tests-first replay (spec §12, tests_first):
// - the old single files' entries, all held;
// - each record named after a commit in the history;
// - every test file with its entry;
// - a reason for each test that passed before its code.
// Split from tests-first-records.test.js on 11 Oct 2026, so the suite runs them side by side.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { RECORDS, exceptionsIn, readRecords, summary } from '../scripts/tests-first-records.mjs';
import { faultReasonsWithoutFault } from '../scripts/tests-first-faults.mjs';
import { path, exists, walk } from './repository/repo.js';

describe('this repository’s records', () => {
  // main as it stood just before the records were split, holding the two single files (11 Oct 2026)
  const BEFORE_SPLIT = '391645a59e85b93a398961fef4965df72cbb5e7d';
  const before = (file) =>
    JSON.parse(execFileSync('git', ['show', `${BEFORE_SPLIT}:${file}`], { cwd: path('.'), encoding: 'utf8' }));

  test('the migrated records hold every entry the old files held', () => {
    const was = before('test/tests-first.json');
    assert.deepEqual(readRecords(path('.')).baseline, { head: was.head, files: was.files });
    const reasons = exceptionsIn(path('.'));
    let held = 0;
    // a reason for a test file since removed goes with it, as the record's own test asks
    for (const [file, names] of Object.entries(before('test/seen-failing.json')).filter(([f]) => exists(f)))
      for (const [name, reason] of Object.entries(names)) {
        assert.deepEqual(reasons[file]?.[name], reason, `${file} :: ${name}`);
        held++;
      }
    assert.ok(held > 100, `${held} reasons held`);
  });

  test('every record is named after a commit in the history since the baseline, and every reason after its test', () => {
    const { baseline, commits } = readRecords(path('.'));
    const isAncestor = (a, b) =>
      spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: path('.') }).status === 0;
    for (const commit of commits.keys()) {
      // review of #69: a squash or a rebase merge makes new commits, and leaves the records of the old ones behind
      assert.ok(
        isAncestor(commit, 'HEAD'),
        `${RECORDS}/${commit}.json records a commit not in the history: most likely its branch was merged by squash or ` +
          'rebase, which makes new commits; merge pull requests with a merge commit only, then run ' +
          'node scripts/tests-first.mjs --update to record the commits that are there',
      );
      assert.ok(!isAncestor(commit, baseline.head), `${commit} is not already in the baseline`);
    }
    assert.doesNotThrow(() => exceptionsIn(path('.')));
  });

  // moved here from tests-first.test.js with summary(), which they read, on 11 Oct 2026
  const proved = summary(path('.')),
    exceptions = exceptionsIn(path('.'));

  test('every test file in the repository has its entry, with what was proved, excused and not replayed kept apart', () => {
    const files = [
      ...walk('.').filter((f) => /(^|\/)(test|tests)\/.*\.test\.(js|mjs)$|(^|\/)tests\/test_\w+\.py$/.test(f)),
    ].filter((f) => !f.startsWith('spikes/'));
    // a file added since the baseline has its entry once a commit that changed it is replayed: CI replays it as it comes
    const known = (f) =>
      spawnSync('git', ['cat-file', '-e', `${proved.baseline}:${f}`], { cwd: path('.') }).status === 0;
    for (const f of files.filter(known)) {
      const e = proved.files[f];
      assert.ok(e, `${f} has an entry`);
      for (const key of ['replayed', 'notReplayed', 'seenFailing', 'excused'])
        assert.equal(typeof e[key], 'number', `${f}: ${key}`);
    }
  });

  test('every test that passed against its parent has its reason, and every reason names such a test', () => {
    const passed = Object.entries(proved.files).flatMap(([file, e]) =>
      e.passedFirst.map((p) => `${file} :: ${p.name}`),
    );
    // a reason with `fault` excuses a test recorded as failing at its own commit, which a reason for passing first does not
    assert.deepEqual(faultReasonsWithoutFault(path('.')), [], 'a fault reason for a commit that is no recorded fault');
    const named = (wanted) =>
      Object.entries(exceptions).flatMap(([file, names]) =>
        Object.entries(names)
          .filter(([, reason]) => Boolean(reason.fault) === wanted)
          .map(([n]) => `${file} :: ${n}`),
      );
    const excused = named(false);
    // a test new in a commit whose run against the code before it did not finish was neither seen failing nor
    // passing. A reason may be kept for it
    const unproved = Object.entries(proved.files).flatMap(([file, e]) =>
      (e.notReplayedCommits ?? []).flatMap((c) => (c.tests ?? []).map((n) => `${file} :: ${n}`)),
    );
    assert.deepEqual(
      passed.filter((p) => !excused.includes(p)),
      [],
      'unexplained',
    );
    assert.deepEqual(
      excused.filter((x) => !passed.includes(x) && !unproved.includes(x)),
      [],
      'a reason for no such test',
    );
    for (const names of Object.values(exceptions))
      for (const reason of Object.values(names)) {
        assert.equal(reason.seen_failing_first, false);
        assert.ok(typeof reason.evidence === 'string' && reason.evidence.length > 10);
      }
  });
});
