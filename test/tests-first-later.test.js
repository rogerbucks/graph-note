// The replay of a commit (tests-first.test.js) when the test and its code do not come together: a test wrong at its own
// commit and corrected later, one that comes a commit before its code, a new file whose code is not there yet, and test
// support changed in the same commit. Split from tests-first.test.js on 11 Oct 2026, so the suite runs them side by side.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replay, unexplained } from '../scripts/tests-first.mjs';
import { repository } from './repository/scratch-repository.js';

const JS_TEST = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;

describe('replaying a commit against its parent’s code', () => {
  // review of #69: a test that failed at the parent was taken for one held before, so a test wrong at its own commit and
  // corrected later, with no change to the code, was never judged
  test('a test wrong at its own commit and corrected later, with the code unchanged, is judged when corrected: it passed first', () => {
    const r = repository([
      { 'src/twice.js': 'export const twice = (x) => x * 2;\n' },
      { 'test/twice.test.js': JS_TEST("test('doubles', () => assert.equal(twice(2), 5));") },
      { 'test/twice.test.js': JS_TEST("test('doubles', () => assert.equal(twice(2), 4));") },
    ]);
    try {
      assert.deepEqual(unexplained([replay(r.dir, r.ids[2])], {}), [
        { commit: r.ids[2], file: 'test/twice.test.js', name: 'doubles' },
      ]);
    } finally {
      r.done();
    }
  });

  test('a test that came a commit before its code is judged with the commit that brings its code: it failed first', () => {
    const r = repository([
      { 'src/twice.js': 'export const twice = (x) => x;\n' },
      { 'test/twice.test.js': JS_TEST("test('doubles', () => assert.equal(twice(2), 4));") },
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': JS_TEST("// its code comes now\ntest('doubles', () => assert.equal(twice(2), 4));"),
      },
    ]);
    try {
      const [file] = replay(r.dir, r.ids[2]).files;
      assert.deepEqual(file.failedFirst, ['doubles']);
      assert.deepEqual(file.passedFirst, []);
    } finally {
      r.done();
    }
  });

  test('a new test file whose code does not exist yet fails to load, and so is seen failing', () => {
    const r = repository([
      { 'README.md': 'x\n' },
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': JS_TEST("test('doubles', () => assert.equal(twice(2), 4));"),
      },
    ]);
    try {
      assert.deepEqual(replay(r.dir, r.ids[1]).files[0]?.failedFirst, ['doubles']);
    } finally {
      r.done();
    }
  });

  test('test support changed in the same commit goes with the tests, so only the code differs', () => {
    const r = repository([
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/lib/sample.js': 'export const SAMPLE = 1;\n',
        'test/twice.test.js': "import { test } from 'node:test';\n",
      },
      {
        'test/lib/sample.js': 'export const SAMPLE = 2;\n',
        'test/twice.test.js':
          "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { SAMPLE } from './lib/sample.js';\nimport { twice } from '../src/twice.js';\ntest('uses the new sample', () => assert.equal(twice(1), SAMPLE));",
      },
    ]);
    try {
      assert.deepEqual(replay(r.dir, r.ids[1]).files[0]?.passedFirst, ['uses the new sample']);
    } finally {
      r.done();
    }
  });
});
