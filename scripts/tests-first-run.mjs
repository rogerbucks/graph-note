// One run of one test file for the tests-first replay (scripts/tests-first.mjs; spec §12, tests_first): which files are
// tests, how a JavaScript or Python test file is run in a checkout, and what its run shows — each test by its name,
// passed or failed, and whether the run finished.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOPPED } from './run-ceiling.mjs';

const CEILING = fileURLToPath(new URL('./run-ceiling.mjs', import.meta.url));

/** A JavaScript test file: under a test/ or tests/ folder, named `*.test.js` or `*.test.mjs`. */
export const JS_TEST = /(^|\/)(test|tests)\/.*\.test\.(js|mjs)$/;
/** A Python test file: `tests/test_*.py`. */
export const PY_TEST = /(^|\/)tests\/test_\w+\.py$/;
const RUN_MS = 10 * 60 * 1000;
/** The time limit for each run of a test file: ten minutes, unless TESTS_FIRST_RUN_MS sets another (its tests do). */
export const runMs = () => Number(process.env.TESTS_FIRST_RUN_MS) || RUN_MS;

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/**
 * An attribute value's entities, decoded in one pass, so `&amp;lt;` is the text `&lt;`. Node's reporter writes `"` as
 * `&amp;quot;` (it escapes `&` again after `&quot;`), so that reads as the character; a name that spelt out `&quot;`
 * itself cannot be told from a `"`, which the report does not let us. It writes `'` as it is, so `&amp;apos;` is a name
 * that spelt out `&apos;`, and reads as that text.
 */
const unescape = (s) =>
  s.replace(/&(?:amp;(quot)|#(\d+)|#x([0-9a-fA-F]+)|(lt|gt|amp|quot|apos));/g, (whole, reporter, dec, hex, named) => {
    if (reporter || named) return ENTITIES[reporter ?? named];
    const code = dec ? Number(dec) : parseInt(hex, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });

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

/** A run stopped at a ceiling, as the result of a replay: not finished, with the ceiling's own line; else undefined. */
function stoppedLine(r) {
  const why = (r.stderr ?? '').split('\n').find((line) => line.startsWith(STOPPED));
  return why ? { passed: [], failed: [], ran: false, why } : undefined;
}

/** Runs one JS test file; each test by its suites and name, passed or failed. */
function runJs(dir, file) {
  // a run inside another test run would report to it, not print its own report
  // and where it runs is not told to the tests: a replay on GitHub sees what one on a Mac sees (review of #114)
  const { NODE_TEST_CONTEXT: _context, GITHUB_ACTIONS: _ci, ...env } = process.env;
  // under the run ceiling (spec §13, capped_test_run), which passes the report and the exit status through unchanged
  const r = spawnSync(process.execPath, [CEILING, process.execPath, '--test', '--test-reporter=junit', file], {
    cwd: dir,
    env,
    encoding: 'utf8',
    timeout: runMs(),
    maxBuffer: 1 << 28,
  });
  // a run stopped at a ceiling is an error with the ceiling's own line, never a run that was seen failing
  const stopped = stoppedLine(r);
  if (stopped) return stopped;
  const read = fromJunit(r.stdout ?? '');
  if (!read.ran) return { why: ended(r), ...read };
  // a parent test that fails after its subtests pass is a <testsuite> with no failure: only the exit status shows it. The
  // report does not name that parent, so the failure cannot be narrowed to it: the whole file is unjudged, not just it
  if (r.status !== 0 && read.failed.length === 0) {
    const why = r.status === null ? ended(r) : `ended with exit status ${r.status} though no failed test was read`;
    return { ...read, ran: false, why };
  }
  return read;
}

/**
 * A JUnit report read: each test by its suites and name, passed or failed, and whether the run finished. A report with a
 * testsuite or testcase tag that could not be read did not finish being read, and says how many (`why`): a test lost
 * without a word would be a test the check never saw.
 */
export function fromJunit(whole) {
  // the reporter writes t.diagnostic() text as comments, and turns `--` inside one into `&#45;&#45;`, so none ends early
  const report = whole.replace(/<!--[\s\S]*?-->/g, '');
  const passed = [],
    failed = [],
    suites = [],
    opened = { testsuite: 0, testcase: 0 };
  for (const m of report.matchAll(TAG)) {
    const [, close, tag, text = '', selfClose] = m;
    if (!close) opened[tag]++;
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
  if (!report.includes('</testsuites>')) return { passed, failed, ran: false };
  for (const tag of ['testsuite', 'testcase']) {
    const n = (report.match(new RegExp(String.raw`<${tag}\b`, 'g'))?.length ?? 0) - opened[tag];
    if (n > 0) return { passed, failed, ran: false, why: `${n} ${tag} tag${n === 1 ? '' : 's'} could not be read` };
  }
  return { passed, failed, ran: true };
}

const PY_RUNNER = `
import json, os, re, sys, unittest
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
# a failure that belongs to no listed test is a class or module hook that raised, and is read by its scope: a set-up that
# raised kept every test under it from running, so each is failed; a tear-down ran after the tests, which keep their own
# results, so it is a failure of its own, by name; one that matches no scope is unmatched, and the run is not read
known = {id(t) for t in tests}
hooks = re.compile(r"(setUpClass|tearDownClass|setUpModule|tearDownModule) \\((.+)\\)$")
extra, unmatched = [], []
for t, _ in result.failures + result.errors:
    if id(getattr(t, "test_case", t)) in known:
        continue
    found = hooks.match(str(t))
    kind, where = found.groups() if found else (None, None)
    if kind in ("tearDownClass", "tearDownModule"):
        extra.append(str(t))
        continue
    scoped = []
    if kind == "setUpClass":
        scoped = [x for x in tests if type(x).__module__ + "." + type(x).__qualname__ == where]
    elif kind == "setUpModule":
        scoped = [x for x in tests if type(x).__module__ == where]
    bad.update(id(x) for x in scoped)
    if not scoped:
        unmatched.append(str(t))
print(json.dumps({
    "passed": [name(t) for t in tests if id(t) not in bad and id(t) not in skipped and type(t).__name__ != "_FailedTest"],
    "failed": [name(t) for t in tests if id(t) in bad] + extra,
    "unmatched": unmatched,
}))
`;

/**
 * Runs one Python test file, from the folder above its tests/ folder; each test by its class and name. A run with no
 * report — stopped at the time limit, killed, or crashed — did not finish.
 */
function runPy(dir, file, repo) {
  const venv = join(repo, 'python', 'graph_spec', '.venv', 'bin', 'python');
  const python = file.startsWith('python/graph_spec/') && existsSync(venv) ? venv : 'python3';
  // under the run ceiling (spec §13, capped_test_run), as runJs is: the report and exit status pass through unchanged
  const { GITHUB_ACTIONS: _ci, ...env } = process.env;
  const r = spawnSync(process.execPath, [CEILING, python, '-c', PY_RUNNER, join(dir, file)], {
    cwd: dir,
    env,
    encoding: 'utf8',
    timeout: runMs(),
  });
  const stopped = stoppedLine(r);
  if (stopped) return stopped;
  let read;
  try {
    read = JSON.parse(r.stdout.trim().split('\n').pop() ?? '');
  } catch {
    return { passed: [], failed: [], ran: false, why: ended(r) };
  }
  const { unmatched = [], ...tests } = read;
  if (unmatched.length === 0) return { ...tests, ran: true };
  const n = unmatched.length;
  return {
    passed: [],
    failed: [],
    ran: false,
    why: `${n} failure${n === 1 ? '' : 's'} could not be matched to a test: ${unmatched.join(', ')}`,
  };
}

/**
 * Runs one test file in the checkout `dir`: its tests passed and failed, whether the run finished, and when it did not,
 * `why`.
 */
export const run = (dir, file, repo) => (PY_TEST.test(file) ? runPy(dir, file, repo) : runJs(dir, file));
