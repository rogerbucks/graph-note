// The ceiling on a test run (spec §13, capped_test_run): every run through the npm test commands is stopped, with one
// line saying which ceiling it hit, before it can take the machine's memory or run on for ever. The runner is tried on
// small fixtures made in a temporary folder, never picked up by `npm test`, each under a small ceiling of its own: a
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
  GRAPH_NOTE_TEST_MEMORY_MB: _memory,
  GRAPH_NOTE_TEST_MINUTES: _minutes,
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

// Grows by 4 MB every 10 ms, as a test that allocates without bound does; stops itself at 1.5 GB, and then waits.
const RUNAWAY = `import { test } from 'node:test';
import { writeFileSync } from 'node:fs';
test('grows without bound', async () => {
  writeFileSync('pid', String(process.pid));
  const kept = [];
  while (kept.length < 384) {
    kept.push(Buffer.alloc(4 * 2 ** 20, 1));
    await new Promise((r) => setTimeout(r, 10));
  }
  await new Promise((r) => setTimeout(r, 60000));
});
`;

// Run directly, not under `node --test`, whose start-up under load can outlast a short ceiling: writes its own pid first
// thing, starts a child of its own and writes that pid too, then sleeps.
const SLEEPER = `const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
writeFileSync('pid', String(process.pid));
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
writeFileSync('child-pid', String(child.pid));
setTimeout(() => {}, 60000);
`;

describe('a test run under the ceiling', () => {
  test('a run that allocates without bound is stopped at the memory ceiling, with one line and a failed exit', async () => {
    const dir = scratch({ 'runaway.test.js': RUNAWAY });
    const started = Date.now();
    const r = capped(dir, { GRAPH_NOTE_TEST_MEMORY_MB: '300' }, '--test', 'runaway.test.js');
    assert.ok(Date.now() - started < 30000, 'stopped long before the fixture stops itself');
    assert.notEqual(r.status, 0);
    const lines = r.stderr.split('\n').filter((l) => l.startsWith('run-ceiling:'));
    assert.equal(lines.length, 1, r.stderr);
    assert.match(lines[0], /^run-ceiling: stopped the run at \d+ MB of memory, over its 300 MB ceiling\. /);
    assert.match(lines[0], /GRAPH_NOTE_TEST_MEMORY_MB/);
    assert.ok(await gone(fixturePid(dir)), 'the test file’s own process, a grandchild, was stopped too');
  });

  test('a run that goes on past the time ceiling is stopped, with one line and a failed exit', async () => {
    const dir = scratch({ 'sleeper.js': SLEEPER });
    const started = Date.now();
    // plain `node`, which starts in tens of milliseconds even under load: the pid files exist long before 1.8 s
    const r = capped(dir, { GRAPH_NOTE_TEST_MINUTES: '0.03' }, 'sleeper.js');
    assert.ok(Date.now() - started < 30000, 'stopped long before the fixture wakes');
    assert.ok(
      existsSync(join(dir, 'child-pid')),
      'the fixture never started within the 1.8 s ceiling: the machine is overloaded',
    );
    assert.notEqual(r.status, 0);
    const lines = r.stderr.split('\n').filter((l) => l.startsWith('run-ceiling:'));
    assert.equal(lines.length, 1, r.stderr);
    assert.match(lines[0], /^run-ceiling: stopped the run after \d+(\.\d+)? s, over its 0\.03-minute time ceiling\. /);
    assert.match(lines[0], /GRAPH_NOTE_TEST_MINUTES/);
    assert.ok(await gone(fixturePid(dir)), 'the fixture, a child of the runner, was stopped');
    assert.ok(await gone(Number(readFileSync(join(dir, 'child-pid'), 'utf8'))), 'its own child was stopped too');
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
    for (const env of [{ GRAPH_NOTE_TEST_MEMORY_MB: 'lots' }, { GRAPH_NOTE_TEST_MINUTES: '0' }]) {
      const r = capped(dir, env, 'ran.js');
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /^run-ceiling: GRAPH_NOTE_TEST_(MEMORY_MB|MINUTES) must be a positive number[^\n]*\n$/);
      assert.ok(!existsSync(join(dir, 'ran')), 'the command was not run');
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
    for (const word of ['GRAPH_NOTE_TEST_MEMORY_MB', 'GRAPH_NOTE_TEST_MINUTES', 'measured', 'Usage:'])
      assert.ok(head.includes(word), word);
  });
});
