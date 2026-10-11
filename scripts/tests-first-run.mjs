// One run of one test file for the tests-first replay (scripts/tests-first.mjs; spec §12, tests_first): which files are
// tests, how a JavaScript or Python test file is run in a checkout, and what its run shows — each test by its name,
// passed or failed, and whether the run finished.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** A JavaScript test file: under a test/ or tests/ folder, named `*.test.js` or `*.test.mjs`. */
export const JS_TEST = /(^|\/)(test|tests)\/.*\.test\.(js|mjs)$/;
/** A Python test file: `tests/test_*.py`. */
export const PY_TEST = /(^|\/)tests\/test_\w+\.py$/;
const RUN_MS = 10 * 60 * 1000;
/** The time limit for each run of a test file: ten minutes, unless TESTS_FIRST_RUN_MS sets another (its tests do). */
export const runMs = () => Number(process.env.TESTS_FIRST_RUN_MS) || RUN_MS;

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/**
 * An attribute value's entities, decoded in one pass, so `&amp;lt;` is the text `&lt;`. Node's reporter writes `"` and `'`
 * as `&amp;quot;` and `&amp;apos;` (it escapes `&` again after them), so those read as the character; a name that spelt
 * out `&quot;` itself cannot be told from a `"`, which the report does not let us.
 */
const unescape = (s) =>
  s.replace(
    /&(?:amp;(quot|apos)|#(\d+)|#x([0-9a-fA-F]+)|(lt|gt|amp|quot|apos));/g,
    (whole, reporter, dec, hex, named) => {
      if (reporter || named) return ENTITIES[reporter ?? named];
      const code = dec ? Number(dec) : parseInt(hex, 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    },
  );

// a name, `=`, and a value in double or single quotes; a quoted value may hold `>`, which the reporter leaves bare
const ATTR = String.raw`[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*')`;
const TAG = new RegExp(String.raw`<(\/?)(testsuite|testcase)\b((?:\s+${ATTR})*)\s*(\/?)>`, 'g');

/** The attributes of one tag, each by name, entities decoded. */
function attributes(text) {
  const attrs = new Map();
  for (const [, name, double, single] of text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs.set(name, unescape(double ?? single));
  }
  return attrs;
}

/** How a run with no report ended, from its spawnSync result: the time limit, a signal, an error, or its exit status. */
const ended = (r) =>
  r.error?.code === 'ETIMEDOUT'
    ? `stopped at the ${runMs() / 1000} s time limit`
    : r.signal
      ? `killed by ${r.signal}`
      : r.error
        ? `could not run: ${r.error.code ?? r.error.message}`
        : `ended with exit status ${r.status} and no report`;

/** Runs one JS test file; each test by its suites and name, passed or failed. */
function runJs(dir, file) {
  // a run inside another test run would report to it, not print its own report
  const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=junit', file], {
    cwd: dir,
    env,
    encoding: 'utf8',
    timeout: runMs(),
    maxBuffer: 1 << 28,
  });
  const read = fromJunit(r.stdout ?? '');
  return read.ran ? read : { ...read, why: ended(r) };
}

/** A JUnit report read: each test by its suites and name, passed or failed, and whether the run finished. */
export function fromJunit(report) {
  const passed = [],
    failed = [],
    suites = [];
  for (const m of report.matchAll(TAG)) {
    const [, close, tag, text = '', selfClose] = m;
    const attrs = attributes(text);
    const name = attrs.get('name') ?? '';
    if (tag === 'testsuite') {
      if (close) suites.pop();
      else if (!selfClose) suites.push(name);
      continue;
    }
    if (close) continue;
    (attrs.has('failure') ? failed : passed).push([...suites, name].join(' > '));
  }
  // the reporter writes <testsuites> at once; a run stopped at the time limit, or crashed, never closes it
  return { passed, failed, ran: report.includes('</testsuites>') };
}

const PY_RUNNER = `
import json, os, sys, unittest
path = sys.argv[1]
start = os.path.dirname(os.path.abspath(path))
sys.path.insert(0, start)
suite = unittest.defaultTestLoader.discover(start, pattern=os.path.basename(path), top_level_dir=start)
tests = []
def walk(s):
    for t in s:
        walk(t) if isinstance(t, unittest.TestSuite) else tests.append(t)
walk(suite)
result = unittest.TestResult()
suite.run(result)
name = lambda t: type(t).__name__ + "." + t._testMethodName
# a failing or skipped subTest is reported as its own _SubTest; it counts against the test it belongs to
bad = {id(getattr(t, "test_case", t)) for t, _ in result.failures + result.errors}
skipped = {id(getattr(t, "test_case", t)) for t, _ in result.skipped}
print(json.dumps({
    "passed": [name(t) for t in tests if id(t) not in bad and id(t) not in skipped and type(t).__name__ != "_FailedTest"],
    "failed": [name(t) for t in tests if id(t) in bad],
}))
`;

/**
 * Runs one Python test file, from the folder above its tests/ folder; each test by its class and name. A run with no
 * report — stopped at the time limit, killed, or crashed — did not finish.
 */
function runPy(dir, file, repo) {
  const venv = join(repo, 'python', 'graph_spec', '.venv', 'bin', 'python');
  const python = file.startsWith('python/graph_spec/') && existsSync(venv) ? venv : 'python3';
  const r = spawnSync(python, ['-c', PY_RUNNER, join(dir, file)], { cwd: dir, encoding: 'utf8', timeout: runMs() });
  try {
    return { ...JSON.parse(r.stdout.trim().split('\n').pop() ?? ''), ran: true };
  } catch {
    return { passed: [], failed: [], ran: false, why: ended(r) };
  }
}

/**
 * Runs one test file in the checkout `dir`: its tests passed and failed, whether the run finished, and when it did not,
 * `why`.
 */
export const run = (dir, file, repo) => (PY_TEST.test(file) ? runPy(dir, file, repo) : runJs(dir, file));
