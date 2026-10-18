#!/usr/bin/env node
// Runs a test command under a memory ceiling and a time ceiling (spec §13, capped_test_run), so a runaway test is
// stopped, with one line saying why, long before it can exhaust the machine. A single `node --test` run once grew to
// hundreds of gigabytes of swap in minutes, and the machine stopped dozens of other processes to survive it.
//
// The command runs in its own process group. About every 500 ms the resident memory of every process in the group is
// added up (`ps -A -o pgid=,rss=`, on macOS and Linux); over the memory ceiling, or past the time ceiling, the whole
// group is killed, one line is written to stderr, and the exit status is 1. Otherwise the command's output and exit
// status pass through unchanged. On Windows only the time ceiling is kept. The command also gets a JavaScript heap
// limit (`--max-old-space-size`) in NODE_OPTIONS, unless one is already set, so a heap runaway fails fast with a stack.
//
// Defaults, measured on 11 Oct 2026 with the whole suite (`node --test`, about 700 tests): it peaked at 1.3 GB
// resident across 21 processes and took 64 s, on a 10-core machine (more cores run more test files at once, and use
// more memory; fewer take longer). The slowest single test took 23 s. So:
//   THOUGHTKNOT_TEST_MEMORY_MB   memory ceiling for the whole run, in MB: default 4096, three times the measured peak,
//                               and inside a CI runner's 7 to 16 GB
//   THOUGHTKNOT_TEST_MINUTES     time ceiling for the whole run, in minutes (a fraction is allowed): default 20
//   the heap limit              3072 MB for each Node process, under the memory ceiling
//   --test-timeout=300000       each test's own limit, set in package.json: 5 minutes, well over the slowest test
//
// Usage:
//   node scripts/run-ceiling.mjs node --test                       (npm test; npm run test:ai and test:changed too)
//   THOUGHTKNOT_TEST_MEMORY_MB=8192 npm test                         a run that really needs more memory
//   THOUGHTKNOT_TEST_MINUTES=40 npm test                             or longer
//
// Writes: nothing (it only runs the command, and kills it when it passes a ceiling).
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The memory ceiling, in MB, when THOUGHTKNOT_TEST_MEMORY_MB is not set. */
export const DEFAULT_MEMORY_MB = 4096;
/** The time ceiling, in minutes, when THOUGHTKNOT_TEST_MINUTES is not set. */
export const DEFAULT_MINUTES = 20;
/** The JavaScript heap limit each Node process gets, in MB, when NODE_OPTIONS sets none. */
export const HEAP_MB = 3072;
const POLL_MS = 500;
const SAY = 'run-ceiling:';
/** How the one line begins when a run is stopped at a ceiling, for a caller that reads it from the run's stderr. */
export const STOPPED = `${SAY} stopped the run`;

/**
 * The ceilings from the environment: `{ memoryMb, minutes }`, or `{ error }`, one line, when a setting is not a
 * positive number.
 */
export function ceilings(env) {
  const read = (name, fallback) => {
    const text = env[name];
    if (text === undefined || text === '') return fallback;
    const value = Number(text);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };
  const memoryMb = read('THOUGHTKNOT_TEST_MEMORY_MB', DEFAULT_MEMORY_MB);
  const minutes = read('THOUGHTKNOT_TEST_MINUTES', DEFAULT_MINUTES);
  const bad =
    memoryMb === undefined ? 'THOUGHTKNOT_TEST_MEMORY_MB' : minutes === undefined ? 'THOUGHTKNOT_TEST_MINUTES' : '';
  if (bad) return { error: `${SAY} ${bad} must be a positive number, not ${JSON.stringify(env[bad])}` };
  return { memoryMb, minutes };
}

/** NODE_OPTIONS with the heap limit added, unless it already sets one. */
export const withHeapLimit = (options = '') =>
  /--max-old-space-size\b/.test(options) ? options : `${options} --max-old-space-size=${HEAP_MB}`.trim();

/** The total resident memory, in KB, of the processes in this group, from the output of `ps -A -o pgid=,rss=`. */
export function groupMemoryKb(psOutput, group) {
  let kb = 0;
  for (const line of psOutput.split('\n')) {
    const [pgid, rss] = line.trim().split(/\s+/).map(Number);
    if (pgid === group && Number.isFinite(rss)) kb += rss;
  }
  return kb;
}

function main(argv) {
  const limits = ceilings(process.env);
  if (limits.error) {
    process.stderr.write(`${limits.error}\n`);
    return Promise.resolve(2);
  }
  if (!argv.length) {
    process.stderr.write(`${SAY} give the command to run, such as: node scripts/run-ceiling.mjs node --test\n`);
    return Promise.resolve(2);
  }
  const [command, ...args] = argv;
  const windows = process.platform === 'win32';
  const child = spawn(command === 'node' ? process.execPath : command, args, {
    stdio: 'inherit',
    detached: !windows,
    env: { ...process.env, NODE_OPTIONS: withHeapLimit(process.env.NODE_OPTIONS) },
  });
  const started = Date.now();
  let stopped = '';
  const killGroup = (signal) => {
    try {
      if (windows) child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch {
      /* already gone */
    }
  };
  const stop = (why) => {
    if (stopped) return;
    stopped = why;
    killGroup('SIGKILL');
  };
  // An interrupt reaches only the foreground group, which the command has left: pass it on.
  const forward = (signal) => {
    stopped ||= ' ';
    killGroup(signal);
  };
  process.on('SIGINT', forward);
  process.on('SIGTERM', forward);

  const timer = setInterval(() => {
    const seconds = (Date.now() - started) / 1000;
    if (seconds > limits.minutes * 60) {
      const ceiling = `${limits.minutes}-minute`;
      return stop(
        `${STOPPED} after ${seconds.toFixed(1)} s, over its ${ceiling} time ceiling. ` +
          `If it really needs longer, set THOUGHTKNOT_TEST_MINUTES (default ${DEFAULT_MINUTES}).`,
      );
    }
    if (windows || child.pid === undefined) return;
    execFile('ps', ['-A', '-o', 'pgid=,rss='], { maxBuffer: 1 << 24 }, (error, out) => {
      if (error || stopped) return;
      const mb = Math.round(groupMemoryKb(out, child.pid) / 1024);
      if (mb > limits.memoryMb)
        stop(
          `${STOPPED} at ${mb} MB of memory, over its ${limits.memoryMb} MB ceiling. ` +
            `A test is probably growing without bound; if the run really needs more, set THOUGHTKNOT_TEST_MEMORY_MB ` +
            `(default ${DEFAULT_MEMORY_MB}).`,
        );
    });
  }, POLL_MS);

  return new Promise((resolve) => {
    child.on('error', (error) => {
      clearInterval(timer);
      process.stderr.write(`${SAY} could not run ${command}: ${error.message}\n`);
      resolve(2);
    });
    child.on('exit', (code, signal) => {
      clearInterval(timer);
      if (stopped.trim()) {
        process.stderr.write(`\n${stopped}\n`);
        return resolve(1);
      }
      resolve(code ?? 128 + (signal === 'SIGINT' ? 2 : signal === 'SIGTERM' ? 15 : 9));
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).then((status) => (process.exitCode = status));
