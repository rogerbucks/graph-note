// The replay of a commit (tests-first.test.js) when a new test passes against the code before it. It was not written
// first, and is reported unless a reason is kept for it. A test named like a property every object has is not excused
// by that. Split from tests-first.test.js on 11 Oct 2026, so the suite runs it beside the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replay, unexplained } from '../scripts/tests-first.mjs';
import { repository } from './repository/scratch-repository.js';

const JS_TEST = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;

describe('replaying a commit against its parent’s code', () => {
  test('a new test that passes against the old code was not written first, and is reported', () => {
    const r = repository([
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': JS_TEST("test('one', () => {});"),
      },
      {
        'test/twice.test.js': JS_TEST("test('one', () => {});\ntest('already true', () => assert.equal(twice(1), 2));"),
      },
    ]);
    try {
      const [file] = replay(r.dir, r.ids[1]).files;
      assert.deepEqual(file.passedFirst, ['already true']);
      assert.deepEqual(unexplained([replay(r.dir, r.ids[1])], {}), [
        { commit: r.ids[1], file: 'test/twice.test.js', name: 'already true' },
      ]);
      const reason = { seen_failing_first: false, evidence: 'pins behaviour that already existed' };
      assert.deepEqual(
        unexplained([replay(r.dir, r.ids[1])], { 'test/twice.test.js': { 'already true': reason } }),
        [],
      );
    } finally {
      r.done();
    }
  });

  // review of #69: a reason was looked up as a property, so a test named after one every object has counted as excused
  test('a new test named like a property every object has, such as toString or constructor, is not excused by it', () => {
    const r = repository([
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': JS_TEST("test('one', () => {});"),
      },
      {
        'test/twice.test.js': JS_TEST(
          "test('one', () => {});\ntest('toString', () => assert.equal(twice(1), 2));\ntest('constructor', () => {});",
        ),
      },
    ]);
    try {
      const flagged = unexplained([replay(r.dir, r.ids[1])], { 'test/twice.test.js': {} }).map((u) => u.name);
      assert.deepEqual(flagged.sort(), ['constructor', 'toString']);
    } finally {
      r.done();
    }
  });
});
