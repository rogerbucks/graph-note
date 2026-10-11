// The replay of a commit (tests-first.test.js) when a new test fails at its own commit: it is kept in the record as not
// replayed, or, when it passes run again, fails the record. Split from tests-first-keeping.test.js on 11 Oct 2026, so the
// suite runs them side by side.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { record, replay } from '../scripts/tests-first.mjs';
import { readRecords } from '../scripts/tests-first-records.mjs';
import { repository } from './repository/scratch-repository.js';

const JS_TEST = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;

describe('a new test failing at its own commit', () => {
  // found on 10 Oct 2026: time-budget tests failing at their own commit under load dropped out of the record unnoticed,
  // and its count of tests seen failing first fell by one each (layout-worker 26 to 25, partial-read 14 to 13). Since the
  // review of #69 the commit is recorded with the fault kept, as not replayed: a test may come a commit before its code
  // (Roger, 10 Oct 2026), and CI asks that every commit that changed a test have its record
  test('is kept in the record as not replayed, naming the test and commit: it is never dropped', () => {
    const r = repository([
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': JS_TEST("test('one', () => {});") },
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': JS_TEST(
          "test('one', () => {});\ntest('doubles', () => assert.equal(twice(2), 4));\ntest('in its budget', () => assert.ok(false, 'over its budget'));",
        ),
      },
    ]);
    try {
      const e = record(r.dir).files['test/twice.test.js'];
      // the file's other new tests are still judged: 'doubles' was seen failing first
      assert.equal(e.seenFailing, 1);
      const kept = e.notReplayedCommits.filter((c) => c.commit === r.ids[1]);
      assert.deepEqual(
        kept.map((c) => c.tests),
        [['in its budget']],
      );
      assert.match(kept[0].reason, /"in its budget" fails at its own commit/);
      // one commit, counted once: not replayed, as a test in it was not (review of #69)
      assert.deepEqual([e.replayed, e.notReplayed], [0, 1]);
      // and --check still shows every problem in one run, the fault among them (review of #44)
      const replayed = replay(r.dir, r.ids[1]);
      assert.equal(replayed.faults.length, 1);
      assert.deepEqual(replayed.files[0]?.failedFirst, ['doubles']);
    } finally {
      r.done();
    }
  });

  // review of #69: the time-budget guard of 10 Oct 2026, kept: a test that failed only under load must be run again,
  // never kept as a fault for good
  test('one that fails at its own commit once, and passes run again, fails the record, so it is run again: never kept', () => {
    const markers = mkdtempSync(join(tmpdir(), 'tests-first-marker-'));
    const marker = JSON.stringify(join(markers, 'ran-once'));
    const once = `if (!existsSync(${marker})) { writeFileSync(${marker}, ''); assert.fail('over its budget, once'); }`;
    const r = repository([
      { 'README.md': 'the first commit\n' },
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': JS_TEST("test('one', () => {});") },
      {
        'test/twice.test.js': JS_TEST(
          `import { existsSync, writeFileSync } from 'node:fs';\ntest('one', () => {});\ntest('in its budget', () => { ${once} });`,
        ),
      },
    ]);
    try {
      assert.throws(
        () => record(r.dir),
        (e) => {
          assert.match(e.message, new RegExp(`${r.ids[2].slice(0, 7)} test/twice\\.test\\.js: "in its budget" failed`));
          assert.match(e.message, /passed when run again/);
          // a fault that comes back on every run cannot be recorded: the commit is rewritten with its code
          assert.match(e.message, /rewritten together with its code/);
          return true;
        },
      );
      assert.equal(readRecords(r.dir).commits.size, 0, 'nothing is written');
    } finally {
      rmSync(markers, { recursive: true, force: true });
      r.done();
    }
  });
});
