// The records of the tests-first replay (spec §12, tests_first), kept so that two branches never conflict in them.
// There is one file for each replayed commit in test/tests-first/, over the frozen baseline.json. Proved here on small
// repositories made for the purpose. The rest is in other files:
// - the reasons a test passed before its code: tests-first-records-reasons.test.js;
// - two branches merged, and the old single files moved over: tests-first-records-merged.test.js;
// - this repository's own records: tests-first-records-history.test.js.
// Split on 11 Oct 2026, so the suite runs them side by side.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RECORDS, readRecords, summary } from '../scripts/tests-first-records.mjs';
import { record, update } from '../scripts/tests-first.mjs';
import { repository } from './repository/scratch-repository.js';

const TWICE = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;

/** The files in a repository's folder of records, sorted. */
const recordFiles = (dir) => (existsSync(join(dir, RECORDS)) ? readdirSync(join(dir, RECORDS)).sort() : []);

describe('a record for each replayed commit', () => {
  test('each replayed commit that changed a test is kept in a file of its own, named after it; one that changed none has none', () => {
    const r = repository([
      { 'README.md': 'the first commit\n' },
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': TWICE("test('one', () => {});") },
      { 'README.md': 'no test here\n' },
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': TWICE("test('one', () => {});\ntest('doubles', () => assert.equal(twice(2), 4));"),
      },
    ]);
    try {
      record(r.dir);
      assert.deepEqual(recordFiles(r.dir), [`${r.ids[1]}.json`, `${r.ids[3]}.json`].sort());
      const kept = JSON.parse(readFileSync(join(r.dir, RECORDS, `${r.ids[3]}.json`), 'utf8'));
      assert.equal(kept.commit, r.ids[3]);
      assert.deepEqual(kept.files[0].failedFirst, ['doubles']);
      assert.equal(kept.head, undefined, 'no field that every update rewrites');
      // 'one', whose code did not exist before it, and 'doubles'
      assert.equal(summary(r.dir).files['test/twice.test.js'].seenFailing, 2);
    } finally {
      r.done();
    }
  });

  test('the record of a commit no longer in the history is removed at the next update, and the new commit’s added', () => {
    const r = repository([
      { 'README.md': 'the first commit\n' },
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': TWICE("test('one', () => {});") },
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': TWICE("test('one', () => {});\ntest('doubles', () => assert.equal(twice(2), 4));"),
      },
    ]);
    try {
      record(r.dir);
      assert.ok(readRecords(r.dir).commits.has(r.ids[2]));
      // the branch is rewritten: its last commit is made again, differently
      r.git('reset', '-q', '--hard', r.ids[1]);
      const again = r.commit(
        {
          'src/twice.js': 'export const twice = (x) => x + x;\n',
          'test/twice.test.js': TWICE("test('one', () => {});\ntest('adds', () => assert.equal(twice(3), 6));"),
        },
        'made again',
      );
      update(r.dir);
      assert.deepEqual([...readRecords(r.dir).commits.keys()].sort(), [r.ids[1], again].sort());
      const e = summary(r.dir).files['test/twice.test.js'];
      assert.deepEqual([e.replayed, e.seenFailing], [2, 2], "'one', then 'adds', never 'doubles'");
    } finally {
      r.done();
    }
  });

  test('a file in the records folder that is not the record of the commit it is named after fails loudly, naming it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    try {
      mkdirSync(join(dir, RECORDS), { recursive: true });
      writeFileSync(join(dir, RECORDS, 'notes.json'), '{}\n');
      assert.throws(() => readRecords(dir), /notes\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
