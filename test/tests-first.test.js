// Every test is seen to fail before its code (spec §12, tests_first). scripts/tests-first.mjs proves it mechanically: it
// replays a commit, running the commit's tests against its parent's code, and every test new in the commit must fail
// there. A test that passes against the old code was not written first, unless it is recorded, with its reason, in
// test/seen-failing.json. Proved here on small repositories made for the purpose, then on this one's records.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { replay, unexplained } from '../scripts/tests-first.mjs';
import { path, readJSON, walk } from './lib/repo.js';

/** A small repository: each commit a set of files, written then committed; returns the folder and the commit ids. */
function repository(commits) {
  const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  const ids = commits.map((files, i) => {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), text);
    }
    git('add', '-A');
    git('commit', '-q', '-m', `commit ${i}`);
    return git('rev-parse', 'HEAD');
  });
  return { dir, ids, done: () => rmSync(dir, { recursive: true, force: true }) };
}

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
});

describe('this repository’s records', () => {
  const record = readJSON('test/tests-first.json'),
    exceptions = readJSON('test/seen-failing.json');

  test('every test file in the repository has its entry, with what was proved, excused and not replayed kept apart', () => {
    const files = [
      ...walk('.').filter((f) => /(^|\/)(test|tests)\/.*\.test\.(js|mjs)$|(^|\/)tests\/test_\w+\.py$/.test(f)),
    ].filter((f) => !f.startsWith('spikes/'));
    // a file added since the record was made has none yet: CI replays it as it comes
    const known = (f) => spawnSync('git', ['cat-file', '-e', `${record.head}:${f}`], { cwd: path('.') }).status === 0;
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
    assert.deepEqual(
      passed.filter((p) => !excused.includes(p)),
      [],
      'unexplained',
    );
    assert.deepEqual(
      excused.filter((x) => !passed.includes(x)),
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
