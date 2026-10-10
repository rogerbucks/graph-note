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
// only the code differs. A commit that cannot be replayed is recorded as such, never counted either way. But a run at the
// commit's own code that did not finish, a new test failing there, or a commit whose replay fails, is not known to be
// either: it fails the record, naming the commit, the file and the test, and nothing is written; --check warns of it.
// One run of one test file, and what it shows, is scripts/tests-first-run.mjs.
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
import { JS_TEST, PY_TEST, run } from './tests-first-run.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPPORT = /(^|\/)(test|tests)\//;

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
  // `faults`: what at the commit's own code cannot be trusted, which fails the record rather than being kept in it
  const out = { commit, files: [], faults: [] };
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
  // the tests a file held at the parent, run there, and whether that run finished; each file once
  const held = new Map();
  const before_ = (f) => {
    if (!held.has(f)) {
      let found = { names: [], ran: true };
      if (spawnSync('git', ['cat-file', '-e', `${parent}:${f}`], { cwd: repo }).status === 0) {
        const earlier = checkout(repo, parent);
        try {
          const r = run(earlier.dir, f, repo);
          found = { names: [...r.passed, ...r.failed], ran: r.ran };
        } finally {
          earlier.done();
        }
      }
      held.set(f, found);
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
      // a run starved or stopped by load is not a file whose tests do not run: nothing about it is known (10 Oct 2026)
      if (!now.ran) {
        const again = now.why?.includes('time limit') ? '; on a loaded machine, run again' : '';
        out.faults.push({ commit, file, problem: `its run at its own commit did not finish: ${now.why}${again}` });
        continue;
      }
      // a file with no test at its own commit has nothing to replay, so the parent's runs are not needed
      const none = { file, failedFirst: [], passedFirst: [], notReplayed: 'no test in it passes at its own commit' };
      if (!now.passed.length && !now.failed.length) {
        out.files.push(none);
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
      const earlier = sources.map((f) => before_(f));
      const old = earlier.flatMap((e) => e.names);
      const fresh = now.passed.filter((n) => !old.includes(n));
      // a new test failing at its own commit is neither seen failing first nor passing first: it would drop out unseen.
      // The file's other new tests are still judged, so one run shows every problem in it
      for (const test of now.failed.filter((n) => !old.includes(n)))
        out.faults.push({ commit, file, problem: `"${test}" fails at its own commit, so it cannot be replayed` });
      if (!now.passed.length) {
        out.files.push(none);
        continue;
      }
      // a run of the tests held before that did not finish holds only some of them, so which are new is not known
      if (earlier.some((e) => !e.ran)) {
        out.files.push({
          file,
          failedFirst: [],
          passedFirst: [],
          notReplayed: 'its run of the tests it held before did not finish, so which are new is not known',
          tests: fresh,
        });
        continue;
      }
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

/** A fault as one line: the commit, the file when there is one, and what at the commit's own code cannot be trusted. */
const faultLine = (f) => `${f.commit.slice(0, 7)}${f.file ? ` ${f.file}` : ''}: ${f.problem}`;

/** The record cannot be trusted, so it is not written; the message names every fault. */
class RecordFault extends Error {}

/**
 * Each commit's replay, added into `files` by test file. Every commit is replayed even after a fault, so one run shows
 * them all; then any fault fails the whole record, which is not written.
 */
function gather(repo, commits, files) {
  const faults = [];
  for (const commit of commits) {
    process.stderr.write(`${commit.slice(0, 7)}\n`);
    let r;
    try {
      r = replay(repo, commit);
    } catch (e) {
      // a commit missing from the record lowers every count it would have added, so it is a fault (review of #44)
      r = { commit, files: [], faults: [{ commit, problem: `could not be replayed: ${String(e).split('\n')[0]}` }] };
    }
    for (const f of r.faults) process.stderr.write(`  fails the record: ${faultLine(f)}\n`);
    faults.push(...r.faults);
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
  if (faults.length)
    throw new RecordFault(
      `the record is not written: ${faults.length} fault(s) at a commit's own code\n` +
        faults.map((f) => `  ${faultLine(f)}`).join('\n'),
    );
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
  /** Writes the record `make` gives; when a fault fails it, says why and writes nothing. Any other error is thrown. */
  const write = (make) => {
    try {
      writeFileSync(file, JSON.stringify(make(), null, 2) + '\n');
    } catch (e) {
      if (!(e instanceof RecordFault)) throw e;
      console.error(e.message);
      process.exitCode = 1;
    }
  };
  if (mode === '--record') {
    write(() => record(HERE));
  } else if (mode === '--update') {
    write(() => update(HERE, JSON.parse(readFileSync(file, 'utf8'))));
  } else if (mode === '--check') {
    const exceptions = JSON.parse(readFileSync(join(HERE, 'test', 'seen-failing.json'), 'utf8'));
    const replays = commits.map((c) => replay(HERE, c));
    const bad = unexplained(replays, exceptions);
    const faults = replays.flatMap((r) => r.faults);
    for (const b of bad)
      console.error(
        `${b.commit.slice(0, 7)} ${b.file}: "${b.name}" passed against the code before it — write the test first, or give the reason in test/seen-failing.json`,
      );
    // CI checks every commit of a branch, and a test may come a commit before its code, or run slow on a shared runner:
    // a fault here is a warning, and fails only the record (Roger, 10 Oct 2026)
    for (const f of faults) console.error(`warning: ${faultLine(f)}`);
    process.exitCode = bad.length ? 1 : 0;
  } else {
    console.error('usage: tests-first.mjs --check <commit>… | --record | --update');
    process.exitCode = 2;
  }
}
