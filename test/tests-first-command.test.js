// The tests-first replay's command line (spec §12, tests_first), run as CI and a person run it, on small repositories
// made for the purpose: --check reads the reasons kept in test/seen-failing/, --excuse keeps one, --migrate moves the
// old single files over, and --complete fails a commit that changed a test and has no record.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXCUSALS, RECORDS, BASELINE, excusalName } from '../scripts/tests-first-records.mjs';
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

describe('--check and --excuse', () => {
  test('--check fails a new test that passed first, naming it, and passes once --excuse keeps its reason in the folder', () => {
    const r = passingFirst();
    try {
      const before = cli(r.dir, '--check', r.ids[2]);
      assert.equal(before.status, 1, before.stderr);
      assert.match(before.stderr, /test\/twice\.test\.js: "already true" passed against the code before it/);
      const kept = cli(r.dir, '--excuse', 'test/twice.test.js', 'already true', 'pins behaviour that already existed');
      assert.equal(kept.status, 0, kept.stderr);
      assert.equal(kept.stdout.trim(), `${EXCUSALS}/${excusalName('test/twice.test.js', 'already true')}`);
      const after = cli(r.dir, '--check', r.ids[2]);
      assert.equal(after.status, 0, after.stderr);
    } finally {
      r.done();
    }
  });

  test('--excuse never overwrites a reason kept, unless --force is given', () => {
    const r = passingFirst();
    try {
      const file = join(r.dir, EXCUSALS, excusalName('test/twice.test.js', 'already true'));
      assert.equal(cli(r.dir, '--excuse', 'test/twice.test.js', 'already true', 'the first reason given').status, 0);
      const again = cli(r.dir, '--excuse', 'test/twice.test.js', 'already true', 'a second reason given');
      assert.equal(again.status, 1);
      assert.match(again.stderr, /--force/);
      assert.match(readFileSync(file, 'utf8'), /the first reason given/);
      const forced = cli(r.dir, '--excuse', '--force', 'test/twice.test.js', 'already true', 'a second reason given');
      assert.equal(forced.status, 0, forced.stderr);
      assert.match(readFileSync(file, 'utf8'), /a second reason given/);
    } finally {
      r.done();
    }
  });

  test('--check refuses a reason that names __proto__, naming its file: it excuses nothing', () => {
    const r = passingFirst();
    try {
      const name = excusalName('__proto__', 'test/twice.test.js');
      mkdirSync(join(r.dir, EXCUSALS), { recursive: true });
      const slipped = { seen_failing_first: false, evidence: 'slipped in through the prototype' };
      writeFileSync(
        join(r.dir, EXCUSALS, name),
        JSON.stringify({ file: '__proto__', test: 'test/twice.test.js', 'already true': slipped }),
      );
      const checked = cli(r.dir, '--check', r.ids[2]);
      assert.equal(checked.status, 1);
      assert.ok(checked.stderr.includes(name), checked.stderr);
    } finally {
      r.done();
    }
  });
});

describe('--migrate', () => {
  test('--migrate moves the old single files over, says what it did, and leaves them gone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-'));
    try {
      mkdirSync(join(dir, 'test'), { recursive: true });
      const old = { note: 'the old record', head: 'a'.repeat(40), files: {} };
      writeFileSync(join(dir, 'test', 'tests-first.json'), JSON.stringify(old));
      const reason = { seen_failing_first: false, evidence: 'a control case, by design' };
      writeFileSync(join(dir, 'test', 'seen-failing.json'), JSON.stringify({ 'test/x.test.js': { a: reason } }));
      const moved = cli(dir, '--migrate');
      assert.equal(moved.status, 0, moved.stderr);
      assert.match(moved.stdout, /1 reason\(s\) moved/);
      assert.match(moved.stdout, /moved whole into test\/tests-first\/baseline\.json/);
      assert.ok(!existsSync(join(dir, 'test', 'tests-first.json')));
      assert.ok(!existsSync(join(dir, 'test', 'seen-failing.json')));
      assert.equal(JSON.parse(readFileSync(join(dir, RECORDS, BASELINE), 'utf8')).head, old.head);
      assert.ok(existsSync(join(dir, EXCUSALS, excusalName('test/x.test.js', 'a'))));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('--complete', () => {
  // review of #69: a commit recorded on a branch other than its own is replayed twice, and the two may differ
  test('--complete names each commit that changed a test and has no record, and passes once --update records them', () => {
    const r = repository([
      { 'README.md': 'the first commit\n' },
      { 'src/twice.js': 'export const twice = (x) => x;\n', 'test/twice.test.js': TWICE("test('one', () => {});") },
      { 'README.md': 'no test changed here\n' },
    ]);
    try {
      const missing = cli(r.dir, '--complete');
      assert.equal(missing.status, 1);
      assert.match(missing.stderr, new RegExp(`${r.ids[1].slice(0, 7)} changed a test and has no record`));
      assert.doesNotMatch(missing.stderr, new RegExp(r.ids[2].slice(0, 7)), 'a commit that changed no test needs none');
      assert.equal(cli(r.dir, '--update').status, 0);
      const whole = cli(r.dir, '--complete');
      assert.equal(whole.status, 0, whole.stderr);
    } finally {
      r.done();
    }
  });

  // review of #69: a test may come a commit before its code (Roger, 10 Oct 2026); --update wrote nothing for that
  // commit, and --complete then failed CI with advice that could not succeed
  test('a test that comes a commit before its code: --update records the fault, --complete passes, --check only warns', () => {
    const r = repository([
      { 'src/twice.js': 'export const twice = (x) => x;\n' },
      { 'test/twice.test.js': TWICE("test('doubles', () => assert.equal(twice(2), 4));") },
      { 'src/twice.js': 'export const twice = (x) => x * 2;\n' },
    ]);
    try {
      const updated = cli(r.dir, '--update');
      assert.equal(updated.status, 0, updated.stderr);
      const kept = JSON.parse(readFileSync(join(r.dir, RECORDS, `${r.ids[1]}.json`), 'utf8'));
      assert.match(JSON.stringify(kept.files), /"doubles\\" fails at its own commit/);
      const complete = cli(r.dir, '--complete');
      assert.equal(complete.status, 0, complete.stderr);
      const checked = cli(r.dir, '--check', r.ids[1], r.ids[2]);
      assert.equal(checked.status, 0, checked.stderr);
      assert.match(checked.stderr, /warning: .*"doubles" fails at its own commit/);
    } finally {
      r.done();
    }
  });
});
