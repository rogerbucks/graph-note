// The tests-first replay's command line (spec §12, tests_first), run as CI and a person run it, on small repositories
// made for the purpose: --check reads the reasons kept in test/seen-failing/, --excuse keeps one, --migrate moves the
// old single files over. --complete is in tests-first-complete.test.js: it fails a commit that changed a test and has
// no record. --tally is in tests-first-tally.test.js: it prints what the records prove as JSON, and writes nothing.
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
