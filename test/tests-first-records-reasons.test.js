// The reasons kept for a test that passed before its code (spec §12, tests_first): one file for each reason in
// test/seen-failing/, named after its test file and its test. The records of the replay itself are
// tests-first-records.test.js. Split from it on 11 Oct 2026, so the suite runs them side by side.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASELINE, EXCUSALS, RECORDS, exceptionsIn, excusalName, excuse } from '../scripts/tests-first-records.mjs';
import { replay, unexplained } from '../scripts/tests-first.mjs';
import { testsForChanges } from '../scripts/changed-tests.mjs';
import { repository } from './repository/scratch-repository.js';

const TWICE = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;

/** The reasons kept, as plain objects: they are read into objects with no prototype, so no key reaches another. */
const plain = (value) => JSON.parse(JSON.stringify(value));

describe('a reason for each test that passed before its code', () => {
  test('a reason is kept in a file of its own, named after its test file and its test, and excuses that test alone', () => {
    const r = repository([
      { 'src/twice.js': 'export const twice = (x) => x * 2;\n', 'test/twice.test.js': TWICE("test('one', () => {});") },
      { 'test/twice.test.js': TWICE("test('one', () => {});\ntest('already true', () => assert.equal(twice(1), 2));") },
    ]);
    try {
      const replays = [replay(r.dir, r.ids[1])];
      assert.equal(unexplained(replays, exceptionsIn(r.dir)).length, 1);
      // the same name in another test file excuses nothing here
      excuse(r.dir, 'test/other.test.js', 'already true', 'a reason for another file’s test');
      assert.equal(unexplained(replays, exceptionsIn(r.dir)).length, 1);
      const kept = excuse(r.dir, 'test/twice.test.js', 'already true', 'pins behaviour that already existed');
      assert.equal(kept, `${EXCUSALS}/${excusalName('test/twice.test.js', 'already true')}`);
      assert.match(kept, /\/twice-[0-9a-f]{12}\.json$/);
      assert.deepEqual(unexplained(replays, exceptionsIn(r.dir)), []);
      assert.deepEqual(plain(exceptionsIn(r.dir)['test/twice.test.js']), {
        'already true': { seen_failing_first: false, evidence: 'pins behaviour that already existed' },
      });
      assert.notEqual(excusalName('test/twice.test.js', 'one'), excusalName('test/twice.test.js', 'already true'));
    } finally {
      r.done();
    }
  });

  test('a reason in a file not named for its test fails loudly, naming the file and the name it should have', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    try {
      mkdirSync(join(dir, EXCUSALS), { recursive: true });
      const reason = { file: 'test/x.test.js', test: 'a', seen_failing_first: false, evidence: 'a control case here' };
      writeFileSync(join(dir, EXCUSALS, 'mine.json'), JSON.stringify(reason));
      assert.throws(
        () => exceptionsIn(dir),
        (e) => e.message.includes('mine.json') && e.message.includes(excusalName('test/x.test.js', 'a')),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // review of #69: a reason naming __proto__ passed the name check, reached every object through Object.prototype, and
  // excused a test that main would flag
  test('a reason that names __proto__ is refused, naming its file, and reaches no other object: it excuses nothing', () => {
    const r = repository([
      { 'README.md': 'the first commit\n' },
      { 'test/new.test.js': "import { test } from 'node:test';\ntest('already passes', () => {});\n" },
    ]);
    const key = 'test/new.test.js';
    const slipped = { seen_failing_first: false, evidence: 'slipped in through the prototype' };
    try {
      const name = '__proto__-37357c2c1b86.json';
      assert.equal(excusalName('__proto__', key), name, 'the name check alone lets it through');
      mkdirSync(join(r.dir, EXCUSALS), { recursive: true });
      writeFileSync(
        join(r.dir, EXCUSALS, name),
        JSON.stringify({ file: '__proto__', test: key, 'already passes': slipped }),
      );
      assert.throws(
        () => exceptionsIn(r.dir),
        (e) => e.message.includes(name),
      );
      assert.equal(Object.hasOwn(Object.prototype, key), false, 'Object.prototype is untouched');
      // and a reason only inherited, never a test file's or a test's own, excuses nothing
      const inherited = Object.create({ [key]: { 'already passes': slipped } });
      assert.deepEqual(
        unexplained([replay(r.dir, r.ids[1])], inherited).map((u) => u.name),
        ['already passes'],
      );
    } finally {
      delete Object.prototype[key];
      r.done();
    }
  });

  test('a reason naming constructor or prototype, or holding more than its four fields, is refused, naming its file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    const reason = { seen_failing_first: false, evidence: 'a control case here' };
    const cases = [
      { file: 'test/x.test.js', test: 'constructor', ...reason },
      { file: 'prototype', test: 'a', ...reason },
      { file: 'test/x.test.js', test: 'a', ...reason, note: 'one field too many' },
    ];
    try {
      mkdirSync(join(dir, EXCUSALS), { recursive: true });
      for (const kept of cases) {
        const name = excusalName(kept.file, kept.test);
        writeFileSync(join(dir, EXCUSALS, name), JSON.stringify(kept));
        assert.throws(
          () => exceptionsIn(dir),
          (e) => e.message.includes(name),
          JSON.stringify(kept),
        );
        rmSync(join(dir, EXCUSALS, name));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('only .json files are read as reasons, and one that is not JSON fails, naming it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    try {
      mkdirSync(join(dir, EXCUSALS), { recursive: true });
      writeFileSync(join(dir, EXCUSALS, '.DS_Store'), 'not a reason');
      excuse(dir, 'test/x.test.js', 'a', 'a control case here');
      assert.deepEqual(Object.keys(exceptionsIn(dir)), ['test/x.test.js']);
      writeFileSync(join(dir, EXCUSALS, 'broken.json'), '{ not JSON');
      assert.throws(() => exceptionsIn(dir), /broken\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a reason already kept is never overwritten, unless forced', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    try {
      excuse(dir, 'test/x.test.js', 'a', 'the first reason given');
      assert.throws(() => excuse(dir, 'test/x.test.js', 'a', 'a second reason'), /--force/);
      assert.equal(exceptionsIn(dir)['test/x.test.js'].a.evidence, 'the first reason given');
      excuse(dir, 'test/x.test.js', 'a', 'a second reason', true);
      assert.equal(exceptionsIn(dir)['test/x.test.js'].a.evidence, 'a second reason');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a change to a record or a reason runs the tests of the tests-first replay', () => {
    const tracked = [
      'test/tests-first.test.js',
      'test/tests-first-records.test.js',
      'test/tests-first-records-history.test.js',
      'test/tests-first-run.test.js',
    ];
    for (const changed of [`${RECORDS}/${'0'.repeat(40)}.json`, `${RECORDS}/${BASELINE}`, `${EXCUSALS}/x-0123.json`])
      assert.deepEqual(testsForChanges([changed], tracked), {
        all: false,
        files: [
          'test/tests-first-records-history.test.js',
          'test/tests-first-records.test.js',
          'test/tests-first.test.js',
        ],
      });
  });
});
