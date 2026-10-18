// The records of the tests-first replay (spec §12, tests_first) when branches meet:
// - two branches merged by git's own merge with no merge driver, as GitHub merges;
// - the old single files, test/tests-first.json and test/seen-failing.json, moved over into the folders that replaced
//   them on 11 Oct 2026.
// Split from tests-first-records.test.js on that day, so the suite runs them side by side.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BASELINE,
  EXCUSALS,
  RECORDS,
  exceptionsIn,
  excusalName,
  excuse,
  migrate,
  readRecords,
  summary,
} from '../scripts/tests-first-records.mjs';
import { record, update } from '../scripts/tests-first.mjs';
import { repository } from './repository/scratch-repository.js';

const TWICE = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;
const HALF = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { half } from '../src/half.js';\n${body}\n`;

/** The reasons kept, as plain objects: they are read into objects with no prototype, so no key reaches another. */
const plain = (value) => JSON.parse(JSON.stringify(value));

describe('two branches merged', () => {
  // GitHub merges on its server with git's own merge, reading no merge driver: a design that needs one does not hold there
  test('branches that record different commits and excuse different tests merge with nothing to resolve, and need no new record', () => {
    const r = repository([
      { 'README.md': 'the first commit\n' },
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': TWICE("test('one', () => {});") },
    ]);
    try {
      record(r.dir);
      r.commit({}, 'record main');
      const branch = (name, files, file, excused) => {
        r.git('checkout', '-q', '-b', name, 'main');
        r.commit(files, `${name}: a test and its code`);
        excuse(r.dir, file, excused, `a reason kept on branch ${name}`);
        update(r.dir);
        r.commit({}, `${name}: record it`);
      };
      branch(
        'a',
        {
          'src/twice.js': 'export const twice = (x) => x * 2;\n',
          'test/twice.test.js': TWICE("test('one', () => {});\ntest('doubles', () => assert.equal(twice(2), 4));"),
        },
        'test/twice.test.js',
        'one',
      );
      branch(
        'b',
        {
          'src/half.js': 'export const half = (x) => x / 2;\n',
          'test/half.test.js': HALF("test('halves', () => assert.equal(half(4), 2));"),
        },
        'test/half.test.js',
        'halves',
      );
      const merged = spawnSync('git', ['merge-tree', '--write-tree', 'a', 'b'], { cwd: r.dir, encoding: 'utf8' });
      assert.equal(merged.status, 0, merged.stdout);
      // merged, the records hold both branches' commits: nothing is left to replay or write
      r.git('checkout', '-q', 'a');
      r.git('merge', '-q', '--no-edit', 'b');
      update(r.dir);
      assert.equal(r.git('status', '--porcelain'), '');
      const files = summary(r.dir).files;
      assert.equal(files['test/twice.test.js'].seenFailing, 2, "main's 'one' and branch a's 'doubles'");
      assert.equal(files['test/half.test.js'].seenFailing, 1, "branch b's 'halves'");
    } finally {
      r.done();
    }
  });
});

describe('moving the old single files over', () => {
  const OLD_RECORD = {
    note: 'the old record',
    head: 'a'.repeat(40),
    files: {
      'test/twice.test.js': {
        replayed: 2,
        notReplayed: 1,
        seenFailing: 3,
        excused: 1,
        passedFirst: [{ commit: 'b'.repeat(40), name: 'already true' }],
        notReplayedCommits: [{ commit: 'c'.repeat(40), reason: 'the first commit has no parent' }],
      },
    },
  };
  const OLD_REASONS = {
    'test/twice.test.js': { 'already true': { seen_failing_first: false, evidence: 'pins behaviour already there' } },
    'py/tests/test_half.py': {
      'Half.test_one': { seen_failing_first: false, evidence: 'a control case, by design' },
      'Half.test_two': { seen_failing_first: false, evidence: 'another control case, by design' },
    },
  };
  /** A folder holding the two old files, and a baseline already there when `baseline` is given. */
  const old = (baseline) => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    mkdirSync(join(dir, 'test'), { recursive: true });
    writeFileSync(join(dir, 'test', 'tests-first.json'), JSON.stringify(OLD_RECORD));
    writeFileSync(join(dir, 'test', 'seen-failing.json'), JSON.stringify(OLD_REASONS));
    if (baseline) {
      mkdirSync(join(dir, RECORDS), { recursive: true });
      writeFileSync(join(dir, RECORDS, BASELINE), JSON.stringify(baseline));
    }
    return dir;
  };

  test('every entry of the old record goes whole into the baseline, every reason into its own file, and the old files go', () => {
    const dir = old();
    try {
      migrate(dir);
      assert.ok(!existsSync(join(dir, 'test', 'tests-first.json')));
      assert.ok(!existsSync(join(dir, 'test', 'seen-failing.json')));
      assert.deepEqual(readRecords(dir).baseline, { head: OLD_RECORD.head, files: OLD_RECORD.files });
      assert.deepEqual(plain(exceptionsIn(dir)), OLD_REASONS);
      assert.equal(readdirSync(join(dir, EXCUSALS)).length, 3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a branch’s own old record never overwrites a baseline already there: it is dropped, for --update to replay', () => {
    const baseline = { note: 'main’s', head: 'd'.repeat(40), files: {} };
    const dir = old(baseline);
    try {
      const said = migrate(dir).join('\n');
      assert.ok(!existsSync(join(dir, 'test', 'tests-first.json')));
      assert.deepEqual(readRecords(dir).baseline, { head: baseline.head, files: {} });
      assert.match(said, /--update/);
      assert.deepEqual(plain(exceptionsIn(dir)), OLD_REASONS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // review of #69: a branch's copy of a reason, made before main changed it, silently put main's older words back
  test('a reason main already keeps differently is never overwritten by the branch’s copy: it is skipped and named', () => {
    const dir = old();
    try {
      const newer = excuse(dir, 'test/twice.test.js', 'already true', 'main’s newer evidence, written since');
      // a copy the same as main's is there already, and needs no choice
      const same = OLD_REASONS['py/tests/test_half.py']['Half.test_one'];
      excuse(dir, 'py/tests/test_half.py', 'Half.test_one', same.evidence);
      const said = migrate(dir).join('\n');
      const kept = exceptionsIn(dir);
      assert.equal(kept['test/twice.test.js']['already true'].evidence, 'main’s newer evidence, written since');
      assert.ok(said.includes(newer), said);
      // the branch's own words are said too, so a person can choose between the two and nothing is lost
      assert.ok(said.includes(OLD_REASONS['test/twice.test.js']['already true'].evidence), said);
      assert.ok(!said.includes(excusalName('py/tests/test_half.py', 'Half.test_one')), said);
      // a reason main does not keep yet is moved as before
      assert.equal(kept['py/tests/test_half.py']['Half.test_two'].evidence, 'another control case, by design');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a migration that would refuse any reason writes none, and leaves the old files where they are', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    const reason = { seen_failing_first: false, evidence: 'a control case, by design' };
    try {
      mkdirSync(join(dir, 'test'), { recursive: true });
      const reasons = { 'test/a.test.js': { 'a fine test': reason, constructor: reason } };
      writeFileSync(join(dir, 'test', 'seen-failing.json'), JSON.stringify(reasons));
      writeFileSync(join(dir, 'test', 'tests-first.json'), JSON.stringify(OLD_RECORD));
      assert.throws(() => migrate(dir), /constructor/);
      assert.ok(!existsSync(join(dir, EXCUSALS)), 'no reason was written');
      assert.ok(!existsSync(join(dir, RECORDS)), 'nor the baseline');
      assert.ok(existsSync(join(dir, 'test', 'seen-failing.json')));
      assert.ok(existsSync(join(dir, 'test', 'tests-first.json')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
