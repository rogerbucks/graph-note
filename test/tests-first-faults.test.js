// A test that failed at its own commit is kept in the record as a fault, not replayed. --excuse --fault keeps the reason
// it failed there, in test/seen-failing/, and then --tally counts the fault as excused, and --check does not warn of it.
// A reason is kept only for a test the records hold as a fault. Tried on small repositories made for the purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXCUSALS, excusalName, summary } from '../scripts/tests-first-records.mjs';
import { repository } from './repository/scratch-repository.js';
import { path } from './repository/repo.js';

const cli = (dir, ...args) =>
  spawnSync(process.execPath, [path('scripts/tests-first.mjs'), '--repo', dir, ...args], { encoding: 'utf8' });

const TWICE = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;
const FILE = 'test/twice.test.js';
const BROKEN = 'broken at first';

/** A repository whose last commit adds a test that fails at its own commit, recorded as a fault; gives it. */
const faulted = () => {
  const r = repository([
    { 'README.md': 'the first commit\n' },
    { 'src/twice.js': 'export const twice = (x) => x * 2;\n', [FILE]: TWICE("test('one', () => {});") },
    { [FILE]: TWICE(`test('one', () => {});\ntest('${BROKEN}', () => assert.equal(twice(1), 3));`) },
  ]);
  assert.equal(cli(r.dir, '--update').status, 0);
  return r;
};

const entry = (r) => JSON.parse(cli(r.dir, '--tally').stdout).files[FILE];

test('before a reason is kept, the fault counts as not replayed and --check warns of it', () => {
  const r = faulted();
  try {
    const e = entry(r);
    assert.equal(e.notReplayed, 1);
    assert.equal(e.faultsExcused, 0);
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: r.dir, encoding: 'utf8' }).stdout.trim();
    assert.match(cli(r.dir, '--check', head).stderr, /warning: .*cannot be replayed/);
  } finally {
    r.done();
  }
});

test('--excuse --fault keeps the reason in its file, and --tally counts the fault as excused, not as not replayed', () => {
  const r = faulted();
  try {
    const kept = cli(r.dir, '--excuse', '--fault', FILE, BROKEN, 'its code came a commit later');
    assert.equal(kept.status, 0, kept.stderr);
    assert.equal(kept.stdout.trim(), `${EXCUSALS}/${excusalName(FILE, BROKEN)}`);
    assert.deepEqual(JSON.parse(readFileSync(join(r.dir, kept.stdout.trim()), 'utf8')), {
      file: FILE,
      test: BROKEN,
      seen_failing_first: false,
      fault: true,
      evidence: 'its code came a commit later',
    });
    const e = entry(r);
    assert.equal(e.notReplayed, 0);
    assert.deepEqual(e.notReplayedCommits, []);
    assert.equal(e.faultsExcused, 1);
    assert.equal(e.excused, 0, 'excused stays the passed-first reasons alone');
    assert.equal(e.replayed, 2);
    // the library's summary, which other tools read, gives the same entry as --tally
    // (--tally prints the passed-first list as its length)
    const { passedFirst, ...rest } = summary(r.dir).files[FILE];
    assert.deepEqual({ ...rest, passedFirst: passedFirst.length }, e);
    assert.equal(summary(r.dir).files[FILE].notReplayed, 0);
  } finally {
    r.done();
  }
});

test('--check and --complete accept an excused fault: no warning of it, exit 0', () => {
  const r = faulted();
  try {
    assert.equal(cli(r.dir, '--excuse', '--fault', FILE, BROKEN, 'its code came a commit later').status, 0);
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: r.dir, encoding: 'utf8' }).stdout.trim();
    const checked = cli(r.dir, '--check', head);
    assert.equal(checked.status, 0);
    assert.doesNotMatch(checked.stderr, /cannot be replayed/);
    assert.equal(cli(r.dir, '--complete').status, 0);
  } finally {
    r.done();
  }
});

test('a fault reason for a test the records hold no fault of is refused, and nothing is kept', () => {
  const r = faulted();
  try {
    const refused = cli(r.dir, '--excuse', '--fault', FILE, 'one', 'it never failed');
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /records hold no fault of "one" in test\/twice\.test\.js/);
    assert.equal(cli(r.dir, '--tally').stdout.includes('"excused": {}'), true);
  } finally {
    r.done();
  }
});

test('--excuse without --fault is unchanged: it keeps no fault field, and does not excuse a fault', () => {
  const r = faulted();
  try {
    const kept = cli(r.dir, '--excuse', FILE, BROKEN, 'a plain reason');
    assert.equal(kept.status, 0, kept.stderr);
    assert.equal(JSON.parse(readFileSync(join(r.dir, kept.stdout.trim()), 'utf8')).fault, undefined);
    assert.equal(entry(r).notReplayed, 1);
  } finally {
    r.done();
  }
});
