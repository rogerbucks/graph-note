// Every test is seen to fail before its code (spec §12, tests_first). scripts/tests-first.mjs proves it mechanically.
// It replays a commit, running the commit's tests against its parent's code. Every test new in the commit must fail
// there. A test that passes against the old code was not written first, unless its reason is kept in
// test/seen-failing/. Proved here on small repositories made for the purpose. How the records are kept, and what this
// repository's own records hold, is tests-first-records.test.js. The replay's tests are in several files, so that the
// suite runs them side by side. Each makes git repositories and runs Node over them, a second or two a test. The tests
// of one file run one after the other (11 Oct 2026). This file holds how a replay judges a new test that fails first,
// or moves. The rest are:
// - tests-first-passed (a test that passes first);
// - tests-first-later (code that comes later);
// - tests-first-python, tests-first-unfinished, tests-first-keeping and tests-first-failing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replay, unexplained } from '../scripts/tests-first.mjs';
import { repository } from './repository/scratch-repository.js';

const JS_TEST = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;

describe('replaying a commit against its parent’s code', () => {
  test('a test new in a commit, failing against the code before it, is seen failing first', () => {
    const r = repository([
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': JS_TEST("test('one', () => {});") },
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': JS_TEST("test('one', () => {});\ntest('doubles', () => assert.equal(twice(2), 4));"),
      },
    ]);
    try {
      const [file] = replay(r.dir, r.ids[1]).files;
      assert.equal(file.file, 'test/twice.test.js');
      assert.deepEqual(file.failedFirst, ['doubles']);
      assert.deepEqual(file.passedFirst, []);
    } finally {
      r.done();
    }
  });

  // no_monolith_files (spec §13, 9 Oct 2026): splitting a test file moves tests, and a moved test is not a new one
  test('a test moved to another file in the same commit keeps its record: it is not new, so it is not replayed as new', () => {
    const r = repository([
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': JS_TEST("test('one', () => {});\ntest('doubles', () => assert.equal(twice(2), 4));"),
      },
      {
        'test/twice.test.js': JS_TEST("test('one', () => {});"),
        'test/twice-doubling.test.js': JS_TEST("test('doubles', () => assert.equal(twice(2), 4));"),
      },
    ]);
    try {
      const moved = replay(r.dir, r.ids[1]).files.find((f) => f.file === 'test/twice-doubling.test.js');
      assert.deepEqual(moved.failedFirst, []);
      assert.deepEqual(moved.passedFirst, [], 'moved, not new');
      assert.deepEqual(unexplained([replay(r.dir, r.ids[1])], {}), []);
    } finally {
      r.done();
    }
  });
});
