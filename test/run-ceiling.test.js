// The ceiling on a test run (spec §13, capped_test_run). Every run through the npm test commands is stopped before it
// can take the machine's memory or run on for ever. One line says which ceiling it hit. The runner is tried on small
// fixtures made in a temporary folder, never picked up by `npm test`. Each is under a small ceiling of its own. A
// runaway fixture also stops itself well short of harm, so it is safe even before the runner exists.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { path, read, readJSON } from './repository/repo.js';

// a run inside another test run would report to it, not print its own report; and each case sets its own ceilings
const {
  NODE_TEST_CONTEXT: _context,
  NODE_OPTIONS: _options,
  THOUGHTKNOT_TEST_MEMORY_MB: _memory,
  THOUGHTKNOT_TEST_MINUTES: _minutes,
  ...CLEAN_ENV
} = process.env;
const RUNNER = path('scripts/run-ceiling.mjs');
/** Runs `node scripts/run-ceiling.mjs node <args>` in a folder, with these settings added to a clean environment. */
const capped = (cwd, env, ...args) =>
  spawnSync(process.execPath, [RUNNER, 'node', ...args], {
    cwd,
    env: { ...CLEAN_ENV, ...env },
    encoding: 'utf8',
    timeout: 60000,
  });

const made = [];
/** A temporary folder holding these files; removed when the file's tests are done. */
const scratch = (files) => {
  const folder = mkdtempSync(join(tmpdir(), 'run-ceiling-'));
  for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
  made.push(folder);
  return folder;
};
after(() => made.forEach((folder) => rmSync(folder, { recursive: true, force: true })));

/** True while a process with this id is still running. */
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};
/** True once the process has gone, given up to 3 s to finish dying: a big process takes a moment to be torn down. */
const gone = async (pid) => {
  for (let waited = 0; waited < 3000 && alive(pid); waited += 50) await new Promise((r) => setTimeout(r, 50));
  return !alive(pid);
};
/** The id the fixture wrote, once it has run; the fixture runs as a grandchild of the runner, inside `node --test`. */
const fixturePid = (dir) => Number(readFileSync(join(dir, 'pid'), 'utf8'));

// Grows by 4 MB every 40 ms, as a test that allocates without bound does. It stops itself at 1.5 GB, about 15 s on,
// writes `grown`, and then waits. It reaches the 300 MB ceiling about 3 s on, and the runner looks every 500 ms. So it
// is stopped some 12 s before it could write `grown`, inside the run's 60 s limit. At 10 ms a step it grew to 1.5 GB in
// 4 s. That was too near the ceiling's look for a loaded machine (the review of #109). Before it grows, it writes its
// own pid. It then starts a child of its own and writes that pid too. The memory ceiling can only be reached after both
// exist. So the stopping of the whole group is seen however slowly the fixture starts.
const RUNAWAY = `import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
test('grows without bound', async () => {
  writeFileSync('pid', String(process.pid));
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  writeFileSync('child-pid', String(child.pid));
  const kept = [];
  while (kept.length < 384) {
    kept.push(Buffer.alloc(4 * 2 ** 20, 1));
    await new Promise((r) => setTimeout(r, 40));
  }
  writeFileSync('grown', '');
  await new Promise((r) => setTimeout(r, 60000));
});
`;

// Sleeps 30 s, then writes `woke`. Whether a run was stopped at its time ceiling is read from that file. A stopped
// run's whole group is killed, so the fixture never wakes. A run that was not stopped lasts the 30 s and leaves the
// file. The run's output is the fixture's too, so the run does not end before it. It is never read from how long the
// run took. Nor is it read from whether the fixture had started by the ceiling, which a loaded machine's start-up
// decides. A start-up slower than the 1.8 s ceiling failed the test though the ceiling worked. A run under load took
// longer by the clock alike (12 Oct 2026). The stopping of a started fixture and its own child is seen at the memory
// ceiling, which only a started fixture can reach. Both ceilings stop a run through the runner's one `stop`, which
// kills the whole group.
const SLEEPER = `const { writeFileSync } = require('node:fs');
setTimeout(() => writeFileSync('woke', ''), 30000);
`;

describe('a test run under the ceiling', () => {
  test('a run that allocates without bound is stopped at the memory ceiling, with one line and a failed exit', async () => {
    const dir = scratch({ 'runaway.test.js': RUNAWAY });
    const r = capped(dir, { THOUGHTKNOT_TEST_MEMORY_MB: '300' }, '--test', 'runaway.test.js');
    assert.ok(!existsSync(join(dir, 'grown')), 'stopped before the fixture stops itself');
    assert.notEqual(r.status, 0);
    const lines = r.stderr.split('\n').filter((l) => l.startsWith('run-ceiling:'));
    assert.equal(lines.length, 1, r.stderr);
    assert.match(lines[0], /^run-ceiling: stopped the run at \d+ MB of memory, over its 300 MB ceiling\. /);
    assert.match(lines[0], /THOUGHTKNOT_TEST_MEMORY_MB/);
    assert.ok(await gone(fixturePid(dir)), 'the test file’s own process, a grandchild, was stopped too');
    assert.ok(await gone(Number(readFileSync(join(dir, 'child-pid'), 'utf8'))), 'and its own child');
  });

  test('a run that goes on past the time ceiling is stopped, with one line and a failed exit', () => {
    const dir = scratch({ 'sleeper.js': SLEEPER });
    const r = capped(dir, { THOUGHTKNOT_TEST_MINUTES: '0.03' }, 'sleeper.js');
    assert.notEqual(r.status, 0);
    const lines = r.stderr.split('\n').filter((l) => l.startsWith('run-ceiling:'));
    assert.equal(lines.length, 1, r.stderr);
    assert.match(lines[0], /^run-ceiling: stopped the run after \d+(\.\d+)? s, over its 0\.03-minute time ceiling\. /);
    assert.match(lines[0], /THOUGHTKNOT_TEST_MINUTES/);
    assert.ok(!existsSync(join(dir, 'woke')), 'stopped before the fixture woke');
  });

  test('a run within its ceilings passes through its output and its exit status unchanged', () => {
    const dir = scratch({
      'plain.js': "process.stdout.write('out\\n'); process.stderr.write('err\\n'); process.exit(3);\n",
    });
    const r = capped(dir, {}, 'plain.js');
    assert.equal(r.status, 3);
    assert.equal(r.stdout, 'out\n');
    assert.equal(r.stderr, 'err\n');
  });

  test('the run gets a JavaScript heap limit, so a heap runaway fails fast; a limit already set is kept', () => {
    const dir = scratch({ 'options.js': 'process.stdout.write(process.env.NODE_OPTIONS ?? "");\n' });
    assert.equal(capped(dir, {}, 'options.js').stdout, '--max-old-space-size=3072');
    assert.equal(
      capped(dir, { NODE_OPTIONS: '--no-warnings' }, 'options.js').stdout,
      '--no-warnings --max-old-space-size=3072',
    );
    const own = '--max-old-space-size=512';
    assert.equal(capped(dir, { NODE_OPTIONS: own }, 'options.js').stdout, own);
  });

  test('a ceiling that is not a positive number is refused in one line, and nothing is run', () => {
    const dir = scratch({ 'ran.js': "require('node:fs').writeFileSync('ran', '');\n" });
    for (const env of [{ THOUGHTKNOT_TEST_MEMORY_MB: 'lots' }, { THOUGHTKNOT_TEST_MINUTES: '0' }]) {
      const r = capped(dir, env, 'ran.js');
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /^run-ceiling: THOUGHTKNOT_TEST_(MEMORY_MB|MINUTES) must be a positive number[^\n]*\n$/);
      assert.ok(!existsSync(join(dir, 'ran')), 'the command was not run');
    }
  });
});

// the quality ratchet's own two full runs of the suite (scripts/quality-suite.mjs) are test runs too. A bare
// `node --test` there is the uncapped run the requirement forbids (11 Oct 2026)
describe('the quality ratchet’s runs of the suite run under the ceiling', () => {
  // it does not look for the fixture's process. The ceiling stops the run at its time, whether or not `node --test`
  // has started the file yet. So the test does not depend on start-up time. The ceiling's own kill of the group is
  // tested above
  test('a run it starts that goes on past the time ceiling is stopped, with the ceiling’s line, and does not pass', async () => {
    const suite = await import('../scripts/quality-suite.mjs');
    const dir = scratch({ 'sleeper.test.js': SLEEPER });
    const was = process.env.THOUGHTKNOT_TEST_MINUTES;
    process.env.THOUGHTKNOT_TEST_MINUTES = '0.1';
    try {
      const run = suite.nodeTest(dir, []);
      assert.equal(run.passed, false);
      assert.match(run.stderr, /run-ceiling: stopped the run after \d+(\.\d+)? s, over its 0\.1-minute time ceiling/);
      assert.ok(!existsSync(join(dir, 'woke')), 'stopped before the fixture ends by itself');
    } finally {
      if (was === undefined) delete process.env.THOUGHTKNOT_TEST_MINUTES;
      else process.env.THOUGHTKNOT_TEST_MINUTES = was;
    }
  });
});

describe('the npm test commands run under the ceiling', () => {
  const scripts = () => readJSON('package.json').scripts;

  test('npm test, test:ai and test:changed each go through the runner', () => {
    assert.equal(scripts().test, 'node scripts/run-ceiling.mjs node --test --test-timeout=300000');
    assert.equal(
      scripts()['test:ai'],
      'node scripts/run-ceiling.mjs node --test --test-timeout=300000 --test-reporter=./scripts/quiet-reporter.mjs',
    );
    assert.equal(scripts()['test:changed'], 'node scripts/run-ceiling.mjs node scripts/changed-tests.mjs');
  });

  test('test:ai:py goes through the runner', () => {
    assert.match(scripts()['test:ai:py'], /^node scripts\/run-ceiling\.mjs uv run .*scripts\/quiet_unittest\.py$/);
  });

  test('the Python test steps in CI go through the runner, in the same folder and environment', () => {
    const ci = read('.github/workflows/ci.yml');
    const steps = ci.split('\n').filter((line) => /python -m unittest/.test(line));
    assert.equal(steps.length, 2, 'both Python jobs run unittest');
    for (const line of steps) assert.match(line, /run: node \.\.\/\.\.\/scripts\/run-ceiling\.mjs uv run /);
  });

  test('the runs test:changed starts carry the same per-test time limit', () => {
    assert.ok(read('scripts/changed-tests.mjs').includes("'--test-timeout=300000'"));
  });

  test('the AI guide says to run tests only through the npm scripts, and what the ceiling’s line means', () => {
    const guide = read('AGENTS.md').replace(/\s+/g, ' ');
    assert.match(guide, /Never run bare `node --test`: only these npm scripts and `npm test` are capped/);
    assert.match(guide, /`run-ceiling: stopped the run …` means a test runs away/);
  });

  test('the runner says what the defaults are and what they were measured against', () => {
    const head = read('scripts/run-ceiling.mjs').split('\n').slice(0, 30).join('\n');
    for (const word of ['THOUGHTKNOT_TEST_MEMORY_MB', 'THOUGHTKNOT_TEST_MINUTES', 'measured', 'Usage:'])
      assert.ok(head.includes(word), word);
  });
});
