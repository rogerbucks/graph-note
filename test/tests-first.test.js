// Every test is seen to fail before its code (spec §12, tests_first). scripts/tests-first.mjs proves it mechanically: it
// replays a commit, running the commit's tests against its parent's code, and every test new in the commit must fail
// there. A test that passes against the old code was not written first, unless its reason is kept in
// test/seen-failing/. Proved here on small repositories made for the purpose, then on this one's records. How the
// records are kept is tests-first-records.test.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { judged, replay, unexplained, record, update, summary } from '../scripts/tests-first.mjs';
import { RECORDS, exceptionsIn, readRecords } from '../scripts/tests-first-records.mjs';
import { path, walk } from './repository/repo.js';
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

  test('a Python test is replayed the same way', () => {
    const r = repository([
      { 'py/src/twice.py': 'def twice(x):\n    return x\n', 'py/tests/test_twice.py': 'import unittest\n' },
      {
        'py/src/twice.py': 'def twice(x):\n    return x * 2\n',
        'py/tests/test_twice.py':
          'import os, sys, unittest\nsys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))\nfrom twice import twice\n\n\nclass Twice(unittest.TestCase):\n    def test_doubles(self):\n        self.assertEqual(twice(2), 4)\n',
      },
    ]);
    try {
      const [file] = replay(r.dir, r.ids[1]).files;
      assert.equal(file.file, 'py/tests/test_twice.py');
      assert.deepEqual(file.failedFirst, ['Twice.test_doubles']);
    } finally {
      r.done();
    }
  });

  // found at ff02d6d (10 Oct 2026): a parity case whose only failures were in subTests was read as passing first
  test('a Python test whose only failure is inside a subTest has failed: it is seen failing first, not passing', () => {
    const r = repository([
      { 'py/src/twice.py': 'def twice(x):\n    return x\n', 'py/tests/test_twice.py': 'import unittest\n' },
      {
        'py/src/twice.py': 'def twice(x):\n    return x * 2\n',
        'py/tests/test_twice.py':
          'import os, sys, unittest\nsys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))\nfrom twice import twice\n\n\nclass Twice(unittest.TestCase):\n    def test_doubles(self):\n        for x in (1, 2):\n            with self.subTest(x=x):\n                self.assertEqual(twice(x), x * 2)\n',
      },
    ]);
    try {
      const [file] = replay(r.dir, r.ids[1]).files;
      assert.deepEqual(file.failedFirst, ['Twice.test_doubles']);
      assert.deepEqual(file.passedFirst, []);
    } finally {
      r.done();
    }
  });

  /** A Python test file over py/src/twice.py: the class Twice, with these methods' bodies. */
  const PY_TEST = (methods) =>
    'import os, sys, unittest\nsys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))\nfrom twice import twice\n\n\nclass Twice(unittest.TestCase):\n' +
    methods.map((m) => m.replace(/^/gm, '    ')).join('\n') +
    '\n';
  const SUBTESTS =
    'def test_doubles(self):\n    for x in (1, 2, 3):\n        with self.subTest(x=x):\n            self.assertEqual(twice(x), x * 2)';
  /** The replay of a commit that fixes twice, with the test file given, over the code before it. */
  const replayedOver = (before, tests) => {
    const r = repository([
      { 'py/src/twice.py': before, 'py/tests/test_twice.py': 'import unittest\n' },
      { 'py/src/twice.py': 'def twice(x):\n    return x * 2\n', 'py/tests/test_twice.py': tests },
    ]);
    try {
      return replay(r.dir, r.ids[1]).files[0];
    } finally {
      r.done();
    }
  };

  test('a Python test whose subTests raise an error, not a failed assertion, has failed: it is seen failing first', () => {
    const file = replayedOver('def twice(x):\n    return None + x\n', PY_TEST([SUBTESTS]));
    assert.deepEqual(file.failedFirst, ['Twice.test_doubles']);
    assert.deepEqual(file.passedFirst, []);
  });

  test('a Python test with one subTest failing among others that pass has failed: it is seen failing first', () => {
    const file = replayedOver('def twice(x):\n    return x * 2 if x < 3 else x\n', PY_TEST([SUBTESTS]));
    assert.deepEqual(file.failedFirst, ['Twice.test_doubles']);
    assert.deepEqual(file.passedFirst, []);
  });

  test('a Python test whose subTests are all skipped has not passed: it is not new, nor passed first', () => {
    const skipped =
      'def test_skipped(self):\n    for x in (1, 2):\n        with self.subTest(x=x):\n            self.skipTest("not here")';
    const file = replayedOver(
      'def twice(x):\n    return x\n',
      PY_TEST(['def test_doubles(self):\n    self.assertEqual(twice(2), 4)', skipped]),
    );
    assert.deepEqual(file.failedFirst, ['Twice.test_doubles']);
    assert.deepEqual(file.passedFirst, []);
  });
});

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

// a test that waits this long holds a run past the time limit the tests below set; it ends by itself, so no run is left
const HOLD = 'new Promise((done) => setTimeout(done, 20000))';

describe('a run against the code before that did not finish', () => {
  // found at 7590e45 (10 Oct 2026): the parent's run of a test file hung to the time limit, and every new test in it was
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

  // review of #33 (10 Oct 2026): the tests a file held before are read from the parent's own run of it; a run that did not
  // finish holds none, so every test would look new, the old ones passing first among them
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
  // found at 522b41d (10 Oct 2026): on a machine under load, a whole commit's Python run at its own commit was starved,
  // and recorded as its tests not running there; run alone, it passes
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

  // found on 10 Oct 2026: time-budget tests failing at their own commit under load dropped out of the record unnoticed,
  // and its count of tests seen failing first fell by one each (layout-worker 26 to 25, partial-read 14 to 13)
  test('a new test failing at its own commit fails the record, naming the test and commit: it is never dropped', () => {
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
      assert.throws(
        () => record(r.dir),
        (e) => {
          assert.match(e.message, new RegExp(`${r.ids[1].slice(0, 7)} test/twice\\.test\\.js: "in its budget" fails`));
          assert.doesNotMatch(e.message, /doubles|"one"/);
          return true;
        },
      );
      // the file's other new tests are still judged, so --check shows every problem in one run (review of #44)
      const replayed = replay(r.dir, r.ids[1]);
      assert.equal(replayed.faults.length, 1);
      assert.deepEqual(replayed.files[0]?.failedFirst, ['doubles']);
    } finally {
      r.done();
    }
  });

  // review of #44: a commit whose replay threw was logged in one line among hundreds, and the record written without it
  test('a commit that cannot be replayed at all fails the record, naming the commit', () => {
    const r = repository([
      { 'README.md': 'x\n' },
      {
        'packages/p/package.json': 'not JSON\n',
        'test/one.test.js': "import { test } from 'node:test';\ntest('one', () => {});\n",
      },
    ]);
    try {
      // installed packages make the checkout read each package's manifest, and this one cannot be read
      mkdirSync(join(r.dir, 'node_modules', 'installed'), { recursive: true });
      assert.throws(
        () => record(r.dir),
        (e) => {
          assert.match(e.message, new RegExp(`${r.ids[1].slice(0, 7)}: could not be replayed`));
          return true;
        },
      );
    } finally {
      // the checkout that failed half-way is left behind; take it away with the repository
      const left = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: r.dir, encoding: 'utf8' })
        .split('\n')
        .filter((l) => l.startsWith('worktree ') && l.includes('tests-first-wt-'))
        .map((l) => l.slice('worktree '.length));
      for (const dir of left) rmSync(dir, { recursive: true, force: true });
      r.done();
    }
  });
});

describe('keeping the record', () => {
  test('updating the record replays only the commits it does not hold, and gives what recording them all would', () => {
    const r = repository([
      { 'README.md': 'the first commit\n' },
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': JS_TEST("test('one', () => {});") },
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': JS_TEST("test('one', () => {});\ntest('doubles', () => assert.equal(twice(2), 4));"),
      },
    ]);
    try {
      const whole = record(r.dir);
      execFileSync('git', ['reset', '-q', '--hard', r.ids[1]], { cwd: r.dir });
      record(r.dir);
      assert.deepEqual([...readRecords(r.dir).commits.keys()], [r.ids[1]]);
      const held = join(r.dir, RECORDS, `${r.ids[1]}.json`);
      // a record that says what no replay would: kept as it is, as the commit it records is not replayed again
      writeFileSync(held, readFileSync(held, 'utf8').replace('"files"', '"untouched": true,\n  "files"'));
      execFileSync('git', ['reset', '-q', '--hard', r.ids[2]], { cwd: r.dir });
      assert.deepEqual(update(r.dir), whole);
      assert.match(readFileSync(held, 'utf8'), /"untouched": true/, 'the commit held already is not replayed');
    } finally {
      r.done();
    }
  });
});

describe('this repository’s records', () => {
  const record = summary(path('.')),
    exceptions = exceptionsIn(path('.'));

  test('every test file in the repository has its entry, with what was proved, excused and not replayed kept apart', () => {
    const files = [
      ...walk('.').filter((f) => /(^|\/)(test|tests)\/.*\.test\.(js|mjs)$|(^|\/)tests\/test_\w+\.py$/.test(f)),
    ].filter((f) => !f.startsWith('spikes/'));
    // a file added since the baseline has its entry once a commit that changed it is replayed: CI replays it as it comes
    const known = (f) =>
      spawnSync('git', ['cat-file', '-e', `${record.baseline}:${f}`], { cwd: path('.') }).status === 0;
    for (const f of files.filter(known)) {
      const e = record.files[f];
      assert.ok(e, `${f} has an entry`);
      for (const key of ['replayed', 'notReplayed', 'seenFailing', 'excused'])
        assert.equal(typeof e[key], 'number', `${f}: ${key}`);
    }
  });

  test('every test that passed against its parent has its reason, and every reason names such a test', () => {
    const passed = Object.entries(record.files).flatMap(([file, e]) =>
      e.passedFirst.map((p) => `${file} :: ${p.name}`),
    );
    const excused = Object.entries(exceptions).flatMap(([file, names]) =>
      Object.keys(names).map((n) => `${file} :: ${n}`),
    );
    // a test new in a commit whose run against the code before it did not finish was neither seen failing nor passing:
    // a reason may be kept for it
    const unproved = Object.entries(record.files).flatMap(([file, e]) =>
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
