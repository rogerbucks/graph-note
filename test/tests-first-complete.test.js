// The tests-first replay's --complete (spec §12, tests_first; the rest of its command line is
// tests-first-command.test.js): it fails a commit that changed a test and has no record, and passes once --update
// records it. Split from tests-first-command.test.js on 11 Oct 2026, so the suite runs them side by side.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECORDS } from '../scripts/tests-first-records.mjs';
import { repository } from './repository/scratch-repository.js';
import { path } from './repository/repo.js';

/** Runs the command line on the repository in `dir`; gives its exit status and what it wrote. */
const cli = (dir, ...args) =>
  spawnSync(process.execPath, [path('scripts/tests-first.mjs'), '--repo', dir, ...args], { encoding: 'utf8' });

const TWICE = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;

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
