// The test-suite metrics of the quality ratchet (spec §12, quality_ratchet): how long the whole suite takes, which tests
// are flaky, how big a passing quiet run is, and how much of the core the tests cover. Two full runs of `node --test` do
// it: the first, plain, gives the duration and the quiet reporter's output; the second, with coverage, is compared with
// the first to find the tests whose result differs. The readers of Node's JUnit and lcov reports are here too.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const RUN_MS = 20 * 60 * 1000;

const unescape = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Every test of a JUnit report, as `file > suite > name` against 'pass' or 'fail'; files are relative to `root`. */
export function parseJunit(xml, root) {
  const tests = new Map(),
    suites = [];
  const tag = /<(\/?)(testsuite|testcase)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  for (const [, close, kind, attrs, selfClose] of xml.matchAll(tag)) {
    const attr = (name) => unescape(new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1] ?? '');
    if (kind === 'testsuite') {
      if (close) suites.pop();
      else if (!selfClose) suites.push(attr('name'));
    } else if (!close) {
      const file = attr('file') ? relative(root, attr('file')) : '';
      tests.set(
        [file, ...suites, attr('name')].filter(Boolean).join(' > '),
        /\sfailure="/.test(attrs) ? 'fail' : 'pass',
      );
    }
  }
  return tests;
}

/** The tests whose result differs between two runs: the flaky ones, by name. */
export function flakyBetween(first, second) {
  return [...first].filter(([name, result]) => second.has(name) && second.get(name) !== result).map(([name]) => name);
}

/** The line coverage of the files under a folder, from an lcov report: the files, their lines, those hit, and the share. */
export function parseLcov(lcov, folder) {
  const total = { files: 0, lines: 0, hit: 0, percent: 0 };
  for (const record of lcov.split('end_of_record')) {
    const file = /^SF:(.*)$/m.exec(record)?.[1];
    if (!file?.startsWith(folder)) continue;
    total.files++;
    total.lines += Number(/^LF:(\d+)$/m.exec(record)?.[1] ?? 0);
    total.hit += Number(/^LH:(\d+)$/m.exec(record)?.[1] ?? 0);
  }
  if (total.lines) total.percent = Math.round((total.hit / total.lines) * 1000) / 10;
  return total;
}

/** Runs `node --test` over the repository with these arguments; how long it took and whether it passed. */
function nodeTest(root, args) {
  // a run inside a test run would report to it instead of printing its own report
  const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
  const started = performance.now();
  const r = spawnSync(process.execPath, ['--test', ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: RUN_MS,
    maxBuffer: 1 << 28,
  });
  return { seconds: (performance.now() - started) / 1000, passed: r.status === 0, stderr: r.stderr };
}

/**
 * Measures the suite: `suite_seconds` and `quiet_run_bytes` from a plain run (the bytes are null if it did not pass:
 * a failing run's output is not the figure being kept down), `flaky_tests` from comparing it with a second run, and
 * `coverage_percent` for packages/core/src from that second run. `details` names the flaky and failing tests. With
 * `files`, only those test files run (the whole suite when it is empty).
 */
export function measureSuite(root, files = []) {
  const dir = mkdtempSync(join(tmpdir(), 'quality-suite-'));
  try {
    const quiet = join(dir, 'quiet.txt'),
      one = join(dir, 'one.xml'),
      two = join(dir, 'two.xml'),
      lcov = join(dir, 'lcov.info');
    const first = nodeTest(root, [
      '--test-reporter=./scripts/quiet-reporter.mjs',
      `--test-reporter-destination=${quiet}`,
      '--test-reporter=junit',
      `--test-reporter-destination=${one}`,
      ...files,
    ]);
    const second = nodeTest(root, [
      '--experimental-test-coverage',
      '--test-coverage-include=packages/core/src/**',
      '--test-reporter=junit',
      `--test-reporter-destination=${two}`,
      '--test-reporter=lcov',
      `--test-reporter-destination=${lcov}`,
      ...files,
    ]);
    const a = parseJunit(readFileSync(one, 'utf8'), root),
      b = parseJunit(readFileSync(two, 'utf8'), root);
    const failing = [...a].filter(([, r]) => r === 'fail').map(([name]) => name);
    const flaky = flakyBetween(a, b);
    const coverage = parseLcov(readFileSync(lcov, 'utf8'), 'packages/core/src/');
    return {
      metrics: {
        suite_seconds: Math.round(first.seconds * 10) / 10,
        flaky_tests: flaky.length,
        quiet_run_bytes: first.passed ? statSync(quiet).size : null,
        coverage_percent: coverage.files ? coverage.percent : null,
      },
      details: {
        tests: a.size,
        failing,
        flaky,
        coverage_files: coverage.files,
        coverage_lines: coverage.lines,
        second_run_passed: second.passed,
      },
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
