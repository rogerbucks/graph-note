#!/usr/bin/env node
// Every test is seen to fail before its code (spec §12, tests_first), proved mechanically: a commit is replayed by running
// its tests against its parent's code. Every test new in the commit, and passing at the commit, must fail there. A test
// that passes against the old code was not written first, unless its reason is kept in test/seen-failing/.
//
// Usage:
//   node scripts/tests-first.mjs --check <commit>…   replay these commits; exit 1 on a new test that passed first
//                                                    without a recorded reason (CI, for each new commit)
//   node scripts/tests-first.mjs --update            replay each commit since the baseline not yet recorded, keep each
//                                                    in test/tests-first/, and drop those no longer in the history
//   node scripts/tests-first.mjs --record            replay every commit since the baseline afresh
//   node scripts/tests-first.mjs --complete          exit 1 on a commit since the baseline that changed a test and has
//                                                    no record (CI), so each is recorded on its own branch
//   node scripts/tests-first.mjs --excuse [--force] <test file> <test> <reason>
//                                                    keep the reason a test passed first, in test/seen-failing/; one
//                                                    kept already is replaced only with --force
//   node scripts/tests-first.mjs --migrate           move the old single files, test/tests-first.json and
//                                                    test/seen-failing.json, over into those folders
// Each runs on this repository, or on the one `--repo <dir>`, given first, names.
//
// How the records are kept, so that two branches never conflict in them, is scripts/tests-first-records.mjs.
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
import { dirname, join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JS_TEST, PY_TEST, run } from './tests-first-run.mjs';
import {
  RECORDS,
  RecordsError,
  exceptionsIn,
  excuse,
  excused,
  migrate,
  readRecords,
  removeRecord,
  tally,
  writeRecord,
} from './tests-first-records.mjs';

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

/** What a commit changed: a status and its path, or a rename's two paths, for each file. A first commit shows none. */
const changes = (repo, commit) =>
  git(repo, 'diff-tree', '--no-commit-id', '--name-status', '-r', '-M', commit)
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'));

/** The test files among `changed` that the commit added or changed: those its replay runs. */
const testsIn = (changed) =>
  changed
    .filter(([s]) => s !== 'D')
    .map((x) => x.at(-1) ?? '')
    .filter((f) => JS_TEST.test(f) || PY_TEST.test(f));

export function replay(repo, commit) {
  const parent = git(repo, 'rev-list', '--parents', '-n', '1', commit).split(' ')[1];
  const changed = changes(repo, commit);
  const tests = testsIn(changed);
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
        .filter((name) => !excused(exceptions, f.file, name))
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
 * Each commit's replay that changed a test, oldest first. Every commit is replayed even after a fault, so one run shows
 * them all; then any fault fails the whole record, and nothing is written.
 */
function gather(repo, commits) {
  const faults = [];
  const replays = [];
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
    if (r.files.length) replays.push({ commit, files: r.files });
  }
  if (faults.length)
    throw new RecordFault(
      `the record is not written: ${faults.length} fault(s) at a commit's own code\n` +
        faults.map((f) => `  ${faultLine(f)}`).join('\n'),
    );
  return replays;
}

/** The commits since the baseline (every commit, when there is none), oldest first, merges left out. */
const history = (repo, baseline) =>
  git(repo, 'rev-list', '--reverse', '--no-merges', 'HEAD', ...(baseline ? [`^${baseline.head}`] : []))
    .split('\n')
    .filter(Boolean);

/**
 * What the records prove now: `files`, by each test file the repository holds, the commits replayed and not, the tests
 * seen failing first, those that passed first and how many of those are excused; `baseline`, the baseline's head.
 */
export function summary(repo) {
  const { baseline, commits } = readRecords(repo);
  const replays = history(repo, baseline).flatMap((c) => commits.get(c) ?? []);
  return { baseline: baseline?.head ?? null, files: tally(baseline, replays, exceptionsIn(repo), testFiles(repo)) };
}

/** Every commit since the baseline replayed afresh, its records rewritten; gives the summary. */
export function record(repo) {
  const replays = gather(repo, history(repo, readRecords(repo).baseline));
  for (const commit of readRecords(repo).commits.keys()) removeRecord(repo, commit);
  for (const r of replays) writeRecord(repo, r);
  return summary(repo);
}

/**
 * The records brought up to date: each commit since the baseline with no record yet replayed and kept, and the record
 * of a commit no longer in the history, after a rebase, removed. Gives the summary.
 */
export function update(repo) {
  const { baseline, commits } = readRecords(repo);
  const since = history(repo, baseline);
  const fresh = since.filter((c) => !commits.has(c));
  const replays = gather(repo, fresh);
  const held = new Set(since);
  for (const commit of commits.keys()) if (!held.has(commit)) removeRecord(repo, commit);
  for (const r of replays) writeRecord(repo, r);
  return summary(repo);
}

/**
 * The commits since the baseline that changed a test and have no record: each is recorded by --update on the branch
 * that made it, so no other branch replays it again, perhaps differently (review of #69).
 */
export function unrecorded(repo) {
  const { baseline, commits } = readRecords(repo);
  return history(repo, baseline).filter((c) => !commits.has(c) && testsIn(changes(repo, c)).length > 0);
}

if (process.argv[1] && basename(process.argv[1]) === 'tests-first.mjs') {
  // the repository is this one, or the one --repo names, as the tests of this command line give
  const given = process.argv.slice(2);
  const repo = given[0] === '--repo' ? resolve(given[1] ?? '') : HERE;
  const [mode, ...rest] = given[0] === '--repo' ? given.slice(2) : given;
  const force = mode === '--excuse' && rest[0] === '--force';
  const args = force ? rest.slice(1) : rest;
  try {
    main(repo, mode, args, force);
  } catch (e) {
    // a record that cannot be trusted, or records that cannot be read: say why, and write nothing
    if (!(e instanceof RecordFault || e instanceof RecordsError)) throw e;
    console.error(e.message);
    process.exitCode = 1;
  }
}

/** Runs one mode of the command line on `repo`. */
function main(repo, mode, args, force) {
  if (mode === '--record') {
    record(repo);
  } else if (mode === '--update') {
    update(repo);
  } else if (mode === '--complete') {
    const missing = unrecorded(repo);
    for (const c of missing)
      console.error(`${c.slice(0, 7)} changed a test and has no record in ${RECORDS}/: run --update and commit it`);
    process.exitCode = missing.length ? 1 : 0;
  } else if (mode === '--check') {
    const exceptions = exceptionsIn(repo);
    const replays = args.map((c) => replay(repo, c));
    const bad = unexplained(replays, exceptions);
    const faults = replays.flatMap((r) => r.faults);
    for (const b of bad)
      console.error(
        `${b.commit.slice(0, 7)} ${b.file}: "${b.name}" passed against the code before it — write the test first, or keep the reason: node scripts/tests-first.mjs --excuse <test file> <test> <reason>`,
      );
    // CI checks every commit of a branch, and a test may come a commit before its code, or run slow on a shared runner:
    // a fault here is a warning, and fails only the record (Roger, 10 Oct 2026)
    for (const f of faults) console.error(`warning: ${faultLine(f)}`);
    process.exitCode = bad.length ? 1 : 0;
  } else if (mode === '--excuse' && args.length === 3 && args.every(Boolean)) {
    console.log(excuse(repo, args[0], args[1], args[2], force));
  } else if (mode === '--migrate') {
    for (const line of migrate(repo)) console.log(line);
  } else {
    console.error(
      'usage: tests-first.mjs [--repo <dir>] --check <commit>… | --update | --record | --complete | ' +
        '--excuse [--force] <test file> <test> <reason> | --migrate',
    );
    process.exitCode = 2;
  }
}
