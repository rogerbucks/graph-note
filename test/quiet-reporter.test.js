// The quiet reporter (scripts/quiet-reporter.mjs) when a failure cannot be passed on whole. The test runner copies each
// failure from the process that ran it. An assertion whose values hold a function, a DOM node or anything else it
// cannot copy arrives as an empty object with no prototype. The run still reports every failure and its file. It says
// the details were lost, and fails. It never crashes, which would lose the rest of the run's report.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { path } from './repository/repo.js';
import { describeFailure } from '../scripts/quiet-reporter.mjs';

// a run inside another test run would report to it, not print its own report
const { NODE_TEST_CONTEXT: _context, ...CLEAN_ENV } = process.env;

const folder = mkdtempSync(join(tmpdir(), 'quiet-reporter-'));
after(() => rmSync(folder, { recursive: true, force: true }));

describe('a failure whose details the test runner could not pass on', () => {
  test('is described in words, never a crash', () => {
    const error = { code: 'ERR_TEST_FAILURE', cause: Object.create(null) };
    let lines;
    assert.doesNotThrow(() => (lines = describeFailure(error)));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^ {2}error: .*could not pass on/);
  });

  test('is reported with the failures after it, and the run fails rather than crashing', () => {
    writeFileSync(
      join(folder, 'uncopied.test.mjs'),
      [
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        "test('holds a function', () => assert.deepEqual([Object], [undefined]));",
        "test('after it', () => assert.equal(1, 2));",
      ].join('\n'),
    );
    const r = spawnSync(
      process.execPath,
      ['--test', `--test-reporter=${path('scripts/quiet-reporter.mjs')}`, 'uncopied.test.mjs'],
      { cwd: folder, env: CLEAN_ENV, encoding: 'utf8', timeout: 60000 },
    );
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /holds a function/);
    assert.match(r.stdout, /could not pass on/);
    assert.match(r.stdout, /after it/);
    assert.match(r.stdout, /FAIL 2 of 2 tests/);
  });
});
