// One run of one test file in the tests-first replay (scripts/tests-first-run.mjs; spec §12, tests_first): what its
// report shows, whether the run finished, and when it did not, why.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fromJunit, run } from '../scripts/tests-first-run.mjs';

describe('a run against the code before that did not finish', () => {
  // found at 7590e45 (10 Oct 2026): the JUnit reporter writes <testsuites> at once, so a run stopped at the time limit
  // left that much, and was read as finished; its guard, never run, was counted as seen failing
  test('a JUnit report cut off before </testsuites> did not finish, even though it began', () => {
    const cut = '<?xml version="1.0" encoding="utf-8"?>\n<testsuites>\n';
    assert.equal(fromJunit(cut).ran, false);
    const whole = `${cut}<testcase name="guards" time="0.1"/>\n</testsuites>\n`;
    assert.deepEqual(fromJunit(whole), { passed: ['guards'], failed: [], ran: true });
  });
});

describe('why a run did not finish', () => {
  // review of #44: every run with no report was blamed on load, so a run that fails the same way each time was retried
  test('a run that exits with no report says how it ended, and does not blame the time limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tests-first-run-'));
    try {
      mkdirSync(join(dir, 'py', 'tests'), { recursive: true });
      writeFileSync(join(dir, 'py', 'tests', 'test_gone.py'), 'import os\nos._exit(3)\n');
      const r = run(dir, 'py/tests/test_gone.py', dir);
      assert.equal(r.ran, false);
      assert.match(r.why ?? '', /exit status 3/);
      assert.doesNotMatch(r.why ?? '', /time limit/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
