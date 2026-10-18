// The replay of a commit (tests-first.test.js) when a run of a test file does not finish. Stopped at the time limit, it
// proves nothing, and is never counted either way. Each waits out a time limit of three seconds. Split from
// tests-first.test.js on 11 Oct 2026, so the suite runs it beside the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { judged, record, replay } from '../scripts/tests-first.mjs';
import { repository } from './repository/scratch-repository.js';

const JS_TEST = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;

/** Runs `fn` with the replay's time limit for each run of a test file set to `ms`. */
function withRunLimit(ms, fn) {
  const was = process.env.TESTS_FIRST_RUN_MS;
  process.env.TESTS_FIRST_RUN_MS = String(ms);
  try {
    return fn();
  } finally {
    if (was === undefined) delete process.env.TESTS_FIRST_RUN_MS;
    else process.env.TESTS_FIRST_RUN_MS = was;
  }
}

// a test that waits this long holds a run past the time limit the tests below set. It ends by itself, so no run is left
const HOLD = 'new Promise((done) => setTimeout(done, 20000))';

describe('a run against the code before that did not finish', () => {
  // found at 7590e45 (10 Oct 2026): the parent's run of a test file hung to the time limit. Every new test in it was
  // counted as seen failing, a guard that passes by design among them
  test('proves nothing: the file is not replayed, no test is seen failing, and its new tests are named', () => {
    const fresh = ['guards', 'fails first'];
    const timedOut = judged('test/x.test.js', fresh, { ran: false, passed: [], failed: [] });
    assert.deepEqual(timedOut.failedFirst, []);
    assert.deepEqual(timedOut.passedFirst, []);
    assert.match(timedOut.notReplayed, /did not finish/);
    assert.deepEqual(timedOut.tests, fresh);
    const finished = judged('test/x.test.js', fresh, { ran: true, passed: ['guards'], failed: ['fails first'] });
    assert.deepEqual(finished.failedFirst, ['fails first']);
    assert.deepEqual(finished.passedFirst, ['guards']);
    assert.equal(finished.notReplayed, undefined);
  });

  test('a run against the code before, stopped at the time limit, is recorded as not replayed, its new tests named', () => {
    const r = repository([
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': JS_TEST("test('one', () => {});") },
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': JS_TEST(
          `test('one', () => {});\ntest('doubles', async () => { if (twice(2) !== 4) await ${HOLD}; });`,
        ),
      },
    ]);
    try {
      const e = withRunLimit(3000, () => record(r.dir)).files['test/twice.test.js'];
      assert.equal(e.seenFailing, 0);
      assert.deepEqual(e.passedFirst, []);
      assert.deepEqual(
        e.notReplayedCommits.map((c) => [c.commit, c.tests]),
        [[r.ids[1], ['doubles']]],
      );
      assert.match(e.notReplayedCommits[0].reason, /did not finish/);
    } finally {
      r.done();
    }
  });

  // review of #33 (10 Oct 2026): the tests a file held before are read from the parent's own run of it. A run that did
  // not finish holds none. So every test would look new, the old ones passing first among them
  test('when the parent’s own run of a test file did not finish, which tests are new is not known: it is not replayed', () => {
    const r = repository([
      {
        'src/twice.js': 'export const twice = (x) => x;\n',
        'test/twice.test.js': JS_TEST(`test('one', () => {});\ntest('slow', () => ${HOLD});`),
      },
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': JS_TEST("test('one', () => {});\ntest('doubles', () => assert.equal(twice(2), 4));"),
      },
    ]);
    try {
      const [file] = withRunLimit(3000, () => replay(r.dir, r.ids[1])).files;
      assert.deepEqual(file.passedFirst, [], 'one is not new');
      assert.deepEqual(file.failedFirst, []);
      assert.match(file.notReplayed ?? '', /did not finish/);
      assert.deepEqual(file.tests, ['one', 'doubles']);
    } finally {
      r.done();
    }
  });
});

describe('a run at the commit’s own code that cannot be trusted fails the record', () => {
  // found at 522b41d (10 Oct 2026): on a machine under load, a whole commit's Python run at its own commit was starved.
  // It was recorded as its tests not running there. Run alone, it passes
  test('a run at its own commit that did not finish fails the record, naming the commit and file; a file with no tests does not', () => {
    const slow = repository([
      { 'README.md': 'x\n' },
      {
        'py/tests/test_slow.py':
          'import time, unittest\n\n\nclass Slow(unittest.TestCase):\n    def test_waits(self):\n        time.sleep(20)\n',
      },
    ]);
    // with no time limit set, so that load cannot stop it (review of #44)
    const empty = repository([{ 'README.md': 'x\n' }, { 'py/tests/test_empty.py': 'import unittest\n' }]);
    try {
      assert.throws(
        () => withRunLimit(3000, () => record(slow.dir)),
        (e) => {
          assert.match(e.message, new RegExp(`${slow.ids[1].slice(0, 7)} py/tests/test_slow\\.py: .*did not finish`));
          return true;
        },
      );
      assert.match(record(empty.dir).files['py/tests/test_empty.py'].notReplayedCommits[0].reason, /no test/);
    } finally {
      slow.done();
      empty.done();
    }
  });
});
