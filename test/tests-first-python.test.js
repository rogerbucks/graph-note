// The replay of a commit (tests-first.test.js) over a Python test: the same replay, and a failure inside a subTest read as
// a failure. Split from tests-first.test.js on 11 Oct 2026, so the suite runs it beside the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replay } from '../scripts/tests-first.mjs';
import { repository } from './repository/scratch-repository.js';

describe('replaying a commit against its parent’s code', () => {
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
