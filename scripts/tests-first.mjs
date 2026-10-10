#!/usr/bin/env node
// Every test is seen to fail before its code (spec §12, tests_first), proved mechanically: a commit is replayed by running
// its tests against its parent's code. Every test new in the commit, and passing at the commit, must fail there. A test
// that passes against the old code was not written first, unless test/seen-failing.json gives the reason.
//
// Usage:
//   node scripts/tests-first.mjs --check <commit>…   replay these commits; exit 1 on a new test that passed first
//                                                    without a recorded reason (CI, for each new commit)
//   node scripts/tests-first.mjs --record            replay every commit and write test/tests-first.json
//   node scripts/tests-first.mjs --update            replay the commits since the record's head, and add them in
//
// Only the commit's test files and test support (anything under a test/ or tests/ folder) go across to the parent, so
// only the code differs. A commit that cannot be replayed is recorded as such, never counted either way.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS_TEST = /(^|\/)(test|tests)\/.*\.test\.(js|mjs)$/;
const PY_TEST = /(^|\/)tests\/test_\w+\.py$/;
const SUPPORT = /(^|\/)(test|tests)\//;
const RUN_MS = 10 * 60 * 1000;

const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();

/** A detached checkout of a commit, wired to the repository's installed packages, with its own workspace links. */
function checkout(repo, commit) {
  const dir = mkdtempSync(join(tmpdir(), 'tests-first-wt-'));
  rmSync(dir, { recursive: true, force: true });
  git(repo, 'worktree', 'add', '-q', '--detach', dir, commit);
  const modules = join(repo, 'node_modules');
  if (existsSync(modules)) {
    // the installed packages, but this checkout's own workspace packages, so its code is what runs
    mkdirSync(join(dir, 'node_modules'));
    for (const name of readdirSync(modules))
      if (name !== '@graph-note') symlinkSync(join(modules, name), join(dir, 'node_modules', name));
    mkdirSync(join(dir, 'node_modules', '@graph-note'));
    const packages = join(dir, 'packages');
    for (const p of existsSync(packages) ? readdirSync(packages) : []) {
      const manifest = join(packages, p, 'package.json');
      if (!existsSync(manifest)) continue;
      const name = JSON.parse(readFileSync(manifest, 'utf8')).name ?? '';
      if (name.startsWith('@graph-note/')) symlinkSync(join(packages, p), join(dir, 'node_modules', name));
      const own = join(repo, 'packages', p, 'node_modules');
      if (existsSync(own)) symlinkSync(own, join(packages, p, 'node_modules'));
    }
  }
  return { dir, done: () => git(repo, 'worktree', 'remove', '--force', dir) };
}

const unescape = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Runs one JS test file; each test by its suites and name, passed or failed. */
function runJs(dir, file) {
  // a run inside another test run would report to it, not print its own report
  const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=junit', file], {
    cwd: dir,
    env,
    encoding: 'utf8',
    timeout: RUN_MS,
    maxBuffer: 1 << 28,
  });
  const passed = [],
    failed = [],
    suites = [];
  for (const m of (r.stdout ?? '').matchAll(/<(\/?)(testsuite|testcase)\b([^>]*?)(\/?)>/g)) {
    const [, close, tag, attrs = '', selfClose] = m;
    const name = unescape(/\bname="([^"]*)"/.exec(attrs)?.[1] ?? '');
    if (tag === 'testsuite') {
      if (close) suites.pop();
      else if (!selfClose) suites.push(name);
      continue;
    }
    if (close) continue;
    (/\bfailure="/.test(attrs) ? failed : passed).push([...suites, name].join(' > '));
  }
  return { passed, failed, ran: (r.stdout ?? '').includes('<testsuites') };
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
# a failing subTest is reported as its own _SubTest; it is a failure of the test it belongs to
bad = {id(getattr(t, "test_case", t)) for t, _ in result.failures + result.errors}
skipped = {id(t) for t, _ in result.skipped}
print(json.dumps({
    "passed": [name(t) for t in tests if id(t) not in bad and id(t) not in skipped and type(t).__name__ != "_FailedTest"],
    "failed": [name(t) for t in tests if id(t) in bad],
}))
`;

/** Runs one Python test file, from the folder above its tests/ folder; each test by its class and name. */
function runPy(dir, file, repo) {
  const venv = join(repo, 'python', 'graph_spec', '.venv', 'bin', 'python');
  const python = file.startsWith('python/graph_spec/') && existsSync(venv) ? venv : 'python3';
  const r = spawnSync(python, ['-c', PY_RUNNER, join(dir, file)], { cwd: dir, encoding: 'utf8', timeout: RUN_MS });
  try {
    return { ...JSON.parse(r.stdout.trim().split('\n').pop() ?? ''), ran: true };
  } catch {
    return { passed: [], failed: [], ran: false };
  }
}

const run = (dir, file, repo) => (PY_TEST.test(file) ? runPy(dir, file, repo) : runJs(dir, file));

/**
 * Replays one commit: for each test file it adds or changes, the tests new in it — passing at the commit — run against
 * the parent's code, with the commit's test files and test support across. Those that fail there were seen failing
 * first; those that pass were not.
 */
/** The test folder a test file sits in: a package's test/ or tests/, or the repository's own test/. */
const testFolder = (f) => /^(.*?\/?(?:test|tests)\/)/.exec(f)?.[1] ?? '';

export function replay(repo, commit) {
  const parent = git(repo, 'rev-list', '--parents', '-n', '1', commit).split(' ')[1];
  const changed = git(repo, 'diff-tree', '--no-commit-id', '--name-status', '-r', '-M', commit)
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'));
  const tests = changed
    .filter(([s]) => s !== 'D')
    .map((x) => x.at(-1) ?? '')
    .filter((f) => JS_TEST.test(f) || PY_TEST.test(f));
  const out = { commit, files: [] };
  if (!tests.length) return out;
  if (!parent) {
    out.files = tests.map((file) => ({
      file,
      failedFirst: [],
      passedFirst: [],
      notReplayed: 'the first commit has no parent',
    }));
    return out;
  }
  const at = checkout(repo, commit),
    before = checkout(repo, parent);
  // the tests a file held at the parent, run there; each file once
  const held = new Map();
  const before_ = (f) => {
    if (!held.has(f)) {
      let names = [];
      if (spawnSync('git', ['cat-file', '-e', `${parent}:${f}`], { cwd: repo }).status === 0) {
        const earlier = checkout(repo, parent);
        try {
          const r = run(earlier.dir, f, repo);
          names = [...r.passed, ...r.failed];
        } finally {
          earlier.done();
        }
      }
      held.set(f, names);
    }
    return held.get(f);
  };
  try {
    // the commit's test files and test support go across; what it removed from them goes too
    for (const [status, a, b] of changed) {
      const file = b ?? a ?? '';
      if (SUPPORT.test(a ?? '') && (status === 'D' || status.startsWith('R')))
        rmSync(join(before.dir, a ?? ''), { force: true });
      if (status === 'D' || !SUPPORT.test(file)) continue;
      mkdirSync(dirname(join(before.dir, file)), { recursive: true });
      writeFileSync(
        join(before.dir, file),
        execFileSync('git', ['show', `${commit}:${file}`], { cwd: repo, maxBuffer: 1 << 28 }),
      );
    }
    for (const file of tests) {
      const now = run(at.dir, file, repo);
      if (!now.ran || !now.passed.length) {
        out.files.push({
          file,
          failedFirst: [],
          passedFirst: [],
          notReplayed: 'its tests do not run at their own commit',
        });
        continue;
      }
      // the tests the file held before: the parent's own version of it, and of every other test file the commit changed
      // or removed in the same test folder, so a test moved between files is not taken for a new one (§13, 9 Oct 2026)
      const was = changed.find(([s, a, b]) => (b ?? a) === file && s.startsWith('R'))?.[1] ?? file;
      const folder = testFolder(was);
      const sources = [
        was,
        ...changed
          .filter(([s]) => s === 'M' || s === 'D' || s.startsWith('R'))
          .map(([, a]) => a ?? '')
          .filter((f) => f !== was && (JS_TEST.test(f) || PY_TEST.test(f)) && testFolder(f) === folder),
      ];
      const old = sources.flatMap((f) => before_(f));
      const fresh = now.passed.filter((n) => !old.includes(n));
      out.files.push(judged(file, fresh, run(before.dir, file, repo)));
    }
  } finally {
    at.done();
    before.done();
  }
  return out;
}

/**
 * What a file's run against the parent's code shows of its new tests (`fresh`): each failed first, or passed first. A run
 * that did not finish — stopped at the time limit, or crashed before its report — shows nothing: every test in it would
 * look failed. The file is then not replayed, and its new tests are named, so a reason may still be kept for one.
 */
export function judged(file, fresh, then) {
  if (!then.ran)
    return {
      file,
      failedFirst: [],
      passedFirst: [],
      notReplayed: 'its run against the code before it did not finish',
      tests: fresh,
    };
  return {
    file,
    failedFirst: fresh.filter((n) => !then.passed.includes(n)),
    passedFirst: fresh.filter((n) => then.passed.includes(n)),
  };
}

/** The new tests that passed against their parent's code with no reason recorded for them. */
export function unexplained(replays, exceptions) {
  return replays.flatMap((r) =>
    r.files.flatMap((f) =>
      f.passedFirst
        .filter((name) => !exceptions[f.file]?.[name])
        .map((name) => ({ commit: r.commit, file: f.file, name })),
    ),
  );
}

/** The test files the repository holds now. */
const testFiles = (repo) =>
  new Set(
    git(repo, 'ls-files')
      .split('\n')
      .filter((f) => JS_TEST.test(f) || PY_TEST.test(f)),
  );

/** Each commit's replay, added into `files` by test file. */
function gather(repo, commits, files) {
  for (const commit of commits) {
    process.stderr.write(`${commit.slice(0, 7)}\n`);
    let r;
    try {
      r = replay(repo, commit);
    } catch (e) {
      r = { commit, files: [] };
      process.stderr.write(`  could not replay: ${String(e).split('\n')[0]}\n`);
    }
    for (const f of r.files) {
      const e = (files[f.file] ??= {
        replayed: 0,
        notReplayed: 0,
        seenFailing: 0,
        excused: 0,
        passedFirst: [],
        notReplayedCommits: [],
      });
      if (f.notReplayed) {
        e.notReplayed++;
        e.notReplayedCommits.push({ commit, reason: f.notReplayed, ...(f.tests?.length ? { tests: f.tests } : {}) });
        continue;
      }
      e.replayed++;
      e.seenFailing += f.failedFirst.length;
      for (const name of f.passedFirst) e.passedFirst.push({ commit, name });
    }
  }
  return files;
}

/** The record: the files the repository holds now, each with its excused count from seen-failing.json, at `head`. */
function finish(repo, files) {
  const current = testFiles(repo);
  const exceptions = JSON.parse(readFileSync(join(repo, 'test', 'seen-failing.json'), 'utf8'));
  for (const [file, e] of Object.entries(files))
    e.excused = e.passedFirst.filter((p) => exceptions[file]?.[p.name]).length;
  const kept = Object.entries(files)
    .filter(([f]) => current.has(f))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return {
    note: 'Generated by scripts/tests-first.mjs (--record, or --update since its head): do not edit. Each test file: commits replayed, commits that could not be, new tests seen failing first against their parent, and those that passed first with a reason in seen-failing.json.',
    head: git(repo, 'rev-parse', 'HEAD'),
    files: Object.fromEntries(kept),
  };
}

/** Every commit's replay, gathered by the test files the repository holds now. */
export function record(repo) {
  return finish(repo, gather(repo, git(repo, 'rev-list', '--reverse', '--no-merges', 'HEAD').split('\n'), {}));
}

/** A record brought up to date: the commits since its head replayed and added in. */
export function update(repo, prior) {
  const since = git(repo, 'rev-list', '--reverse', '--no-merges', `${prior.head}..HEAD`).split('\n').filter(Boolean);
  return finish(repo, gather(repo, since, structuredClone(prior.files)));
}

if (process.argv[1] && basename(process.argv[1]) === 'tests-first.mjs') {
  const [mode, ...commits] = process.argv.slice(2);
  const file = join(HERE, 'test', 'tests-first.json');
  if (mode === '--record') {
    writeFileSync(file, JSON.stringify(record(HERE), null, 2) + '\n');
  } else if (mode === '--update') {
    writeFileSync(file, JSON.stringify(update(HERE, JSON.parse(readFileSync(file, 'utf8'))), null, 2) + '\n');
  } else if (mode === '--check') {
    const exceptions = JSON.parse(readFileSync(join(HERE, 'test', 'seen-failing.json'), 'utf8'));
    const bad = unexplained(
      commits.map((c) => replay(HERE, c)),
      exceptions,
    );
    for (const b of bad)
      console.error(
        `${b.commit.slice(0, 7)} ${b.file}: "${b.name}" passed against the code before it — write the test first, or give the reason in test/seen-failing.json`,
      );
    process.exitCode = bad.length ? 1 : 0;
  } else {
    console.error('usage: tests-first.mjs --check <commit>… | --record | --update');
    process.exitCode = 2;
  }
}
