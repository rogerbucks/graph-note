// The tests-first replay's --tally (spec §12, tests_first; the rest of its command line is tests-first-command.test.js): it
// prints what the records prove as JSON, for a reader outside the repository, and writes nothing. Split from
// tests-first-command.test.js on 11 Oct 2026, so the suite runs it beside the others; each test works on its own copy of
// a repository recorded once, as recording it again for each would only repeat the same replay.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXCUSALS, excusalName } from '../scripts/tests-first-records.mjs';
import { repository } from './repository/scratch-repository.js';
import { path } from './repository/repo.js';

/** Runs the command line on the repository in `dir`; gives its exit status and what it wrote. */
const cli = (dir, ...args) =>
  spawnSync(process.execPath, [path('scripts/tests-first.mjs'), '--repo', dir, ...args], { encoding: 'utf8' });

const TWICE = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;

/** A repository whose last commit adds a test that passes against the code before it. */
const passingFirst = () =>
  repository([
    { 'README.md': 'the first commit\n' },
    { 'src/twice.js': 'export const twice = (x) => x * 2;\n', 'test/twice.test.js': TWICE("test('one', () => {});") },
    { 'test/twice.test.js': TWICE("test('one', () => {});\ntest('already true', () => assert.equal(twice(1), 2));") },
  ]);

// an outside reader runs --tally and reads the records as JSON; it writes nothing
describe('--tally', () => {
  let base;
  before(() => {
    base = passingFirst();
    assert.equal(cli(base.dir, '--update').status, 0);
  });
  after(() => base.done());

  /** The repository of `passingFirst`, its commits recorded: a copy of the one recorded for all, to change as the test likes. */
  const recorded = () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    cpSync(base.dir, dir, { recursive: true, preserveTimestamps: true });
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    return { dir, ids: base.ids, git, done: () => rmSync(dir, { recursive: true, force: true }) };
  };

  test('--tally prints the counts for each test file and the baseline as JSON, keys sorted, and exits 0', () => {
    const r = recorded();
    try {
      const tallied = cli(r.dir, '--tally');
      assert.equal(tallied.status, 0, tallied.stderr);
      const out = JSON.parse(tallied.stdout);
      assert.deepEqual(Object.keys(out), ['baseline', 'excused', 'files']);
      assert.equal(out.baseline, null);
      assert.deepEqual(out.excused, {});
      assert.deepEqual(Object.keys(out.files['test/twice.test.js']), [
        'excused',
        'notReplayed',
        'notReplayedCommits',
        'passedFirst',
        'replayed',
        'seenFailing',
      ]);
      assert.deepEqual(out.files['test/twice.test.js'], {
        excused: 0,
        notReplayed: 0,
        notReplayedCommits: [],
        passedFirst: 1,
        replayed: 2,
        seenFailing: 1,
      });
      assert.equal(cli(r.dir, '--tally').stdout, tallied.stdout, 'the same records give the same output');
    } finally {
      r.done();
    }
  });

  test('--tally gives an excused test its reason file and the reason exactly as kept', () => {
    const r = recorded();
    try {
      assert.equal(cli(r.dir, '--excuse', 'test/twice.test.js', 'already true', 'pins what already held').status, 0);
      const out = JSON.parse(cli(r.dir, '--tally').stdout);
      const name = excusalName('test/twice.test.js', 'already true');
      const kept = JSON.parse(readFileSync(join(r.dir, EXCUSALS, name), 'utf8'));
      assert.deepEqual(out.excused, {
        'test/twice.test.js': { 'already true': { reasonFile: `${EXCUSALS}/${name}`, reason: kept } },
      });
      assert.equal(out.files['test/twice.test.js'].excused, 1);
    } finally {
      r.done();
    }
  });

  test('--tally writes nothing: the working tree is as clean afterwards as before', () => {
    const r = recorded();
    try {
      assert.equal(cli(r.dir, '--excuse', 'test/twice.test.js', 'already true', 'pins what already held').status, 0);
      r.git('add', '-A');
      r.git('commit', '-q', '-m', 'the records');
      assert.equal(r.git('status', '--porcelain'), '');
      assert.equal(cli(r.dir, '--tally').status, 0);
      assert.equal(r.git('status', '--porcelain', '--ignored'), '');
    } finally {
      r.done();
    }
  });

  test('--tally exits non-zero with the error and no JSON when a reason file is malformed', () => {
    const r = recorded();
    try {
      mkdirSync(join(r.dir, EXCUSALS), { recursive: true });
      writeFileSync(join(r.dir, EXCUSALS, 'broken.json'), '{ not json');
      const tallied = cli(r.dir, '--tally');
      assert.equal(tallied.status, 1);
      assert.match(tallied.stderr, new RegExp(`${EXCUSALS}/broken\\.json: not JSON`));
      assert.equal(tallied.stdout, '');
      writeFileSync(join(r.dir, EXCUSALS, 'broken.json'), JSON.stringify({ file: '__proto__', test: 'x' }));
      const refused = cli(r.dir, '--tally');
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /broken\.json: names "__proto__"/);
    } finally {
      r.done();
    }
  });

  test('--tally reads the repository --repo names, wherever it is run from', () => {
    const r = recorded();
    const other = repository([{ 'README.md': 'no test here\n' }]);
    try {
      const from = (dir) =>
        spawnSync(process.execPath, [path('scripts/tests-first.mjs'), '--repo', dir, '--tally'], {
          cwd: other.dir,
          encoding: 'utf8',
        });
      assert.deepEqual(Object.keys(JSON.parse(from(r.dir).stdout).files), ['test/twice.test.js']);
      assert.deepEqual(JSON.parse(from(other.dir).stdout).files, {});
    } finally {
      r.done();
      other.done();
    }
  });
});
