#!/usr/bin/env node
// Runs only the tests of the modules a change touches (spec §13, touched_tests_only). They are found by the
// tests-mirror-the-code naming (CONTRIBUTING.md, "Naming"). `zoom.ts` is tested by `zoom.test.js` and
// `zoom-limits.test.js` in the same package's test folder, `graph_svg.py` by `test_graph_svg*.py`. A changed test file
// runs itself.
//
// This is the quick check while working. The whole suite still runs before every merge, and CI runs it (`npm test`).
//
// Some files run the tests that reach them through the import graph instead (affected_tests_by_imports,
// `import-graph.mjs`). They are a module no test is named after, a package's `index.ts`, a page module and test
// support. Test support is the files under test/ or tests/ that are not tests themselves. The tests that reach a file
// are every test that imports it, directly or through others, or names it to build.
//
// When a change touches anything else shared, the whole suite is the answer, and one line says which file made it so.
// That is `package.json` and the lock file, workflows, a file no test reaches, and any file this script does not know.
//
// Usage:
//   node scripts/changed-tests.mjs                 run the tests of what changed since main. npm run test:changed
//                                                  runs it under the ceiling of scripts/run-ceiling.mjs.
//   node scripts/changed-tests.mjs --list          only print the plan: the test files, or `whole suite: <why>`.
//   node scripts/changed-tests.mjs --base <ref>    compare with this commit instead of main's.
//   node scripts/changed-tests.mjs [--list] <path>…   plan for these paths, instead of asking git.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importGraph, testsReaching } from './import-graph.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS_TEST = /\.test\.(js|mjs)$/;
const PY_TEST = /(^|\/)tests\/test_\w+\.py$/;

const CHEAP = 'test/cheap-checks.test.js';
const GUIDE = 'test/agents-guide.test.js';
const CEILING = 'test/run-ceiling.test.js';
const CONVENTIONS = 'test/conventions.test.js';
const DEVICE_NOTES = 'test/device-check-notes.test.js';
const DEVICE_QUOTES = 'test/device-check-quotes.test.js';

/**
 * Files whose tests do not carry their name: the tests that read each. A file matched here needs only those tests.
 * Each is what the test opens:
 * - conventions.test.js reads CONTRIBUTING.md, every GUIDE.md and the README;
 * - policy.test.js reads the README;
 * - test-vault.test.js reads test-vault/ and its reset script;
 * - device-check-notes.test.js reads its Device checks notes and the device checklist;
 * - requirements.test.js reads requirements/ and its check;
 * - cheap-checks.test.js reads AGENTS.md, CLAUDE.md, .ignore and its own three tools;
 * - agents-guide.test.js reads AGENTS.md, its handbook, CLAUDE.md and .ignore;
 * - run-ceiling.test.js reads AGENTS.md and changed-tests.mjs as well as its own runner, and runs quality-suite.mjs.
 */
const READERS = [
  [/^(AGENTS\.md|scripts\/changed-tests\.mjs)$/, [CHEAP, GUIDE, CEILING, 'test/community-files.test.js']],
  [/^docs\/agents\/HANDBOOK\.md$/, [GUIDE, 'test/community-files.test.js', 'test/public-readiness.test.js']],
  [/^scripts\/import-graph\.mjs$/, [CHEAP, 'test/import-graph.test.js']],
  [/^(CLAUDE\.md|\.ignore|scripts\/quiet-reporter\.mjs|scripts\/quiet_unittest\.py)$/, [CHEAP, GUIDE]],
  [/^(CONTRIBUTING\.md|(packages|python)\/[^/]+\/(GUIDE\.md|guide\/[^/]+\.md))$/, [CONVENTIONS]],
  [/^README\.md$/, [CONVENTIONS, 'test/policy.test.js']],
  [/^(test-vault\/.*|scripts\/reset-test-vault\.mjs)$/, ['test/test-vault.test.js', DEVICE_NOTES, DEVICE_QUOTES]],
  [/^packages\/obsidian\/test\/device-checklist\.md$/, [DEVICE_NOTES, DEVICE_QUOTES]],
  [/^requirements\/workstreams\.json$/, ['test/github-project.test.js']],
  [/^(requirements\/.*|scripts\/check-requirements\.mjs)$/, ['test/requirements.test.js']],
  [/^scripts\/check-requirements-flips\.mjs$/, ['test/check-requirements-flips.test.js']],
  [/^(scripts\/check-classification\.mjs)$/, ['test/classification.test.js']],
  [/^scripts\/quality-secrets\.mjs$/, ['test/quality-metrics.test.js']],
  [/^scripts\/quality-suite\.mjs$/, ['test/quality-metrics.test.js', CEILING]],
  [
    /^(scripts\/quality-(check|spec)\.mjs|quality\/(baseline|accepted)\.json)$/,
    ['test/quality-baseline.test.js', 'test/quality-metrics.test.js'],
  ],
  [/^quality\/advisories\.json$/, ['test/engine-version.test.js']],
  [/^(scripts\/notices\.mjs|THIRD_PARTY_NOTICES\.md)$/, ['test/licences.test.js']],
  [
    /^test\/(seen-failing|tests-first)\//,
    ['test/tests-first.test.js', 'test/tests-first-records.test.js', 'test/tests-first-records-history.test.js'],
  ],
];

const base = (file) => file.slice(file.lastIndexOf('/') + 1);
const stem = (file) => base(file).replace(/(\.d)?\.[^.]+$/, '');
/** Tests named after a module: the module's own name, or the name and an aspect after a hyphen (or an underscore). */
const named = (test, module, joiner) => test === module || test.startsWith(module + joiner);

/** The tests in a module's package named after it. */
const namedTests = (path, tracked) => {
  const pkg = /^packages\/[^/]+/.exec(path)[0];
  return tracked.filter(
    (f) => f.startsWith(`${pkg}/test/`) && JS_TEST.test(f) && named(stem(f).replace(/\.test$/, ''), stem(path), '-'),
  );
};

/**
 * The tests a change touches. Gives `{ all: false, files }`, the tracked test files, sorted and with none twice, or
 * `{ all: true, reason }` with one line saying which changed path is shared. `changed` is the paths git reports (a
 * deleted file among them); `tracked` is every file now in the repository. A deleted module still runs the tests named
 * after it; a deleted test file has nothing left to run. `reach(path)`, when given, is the tests that reach a file
 * through the import graph. A module no test is named after, an entry, a page module or test support then runs those.
 * It is shared only when no test reaches it.
 */
export function testsForChanges(changed, tracked, reach) {
  const present = new Set(tracked);
  const files = new Set();
  const shared = (path, why = '') => ({ all: true, reason: `${path} is shared${why}` });
  const add = (list) => list.filter((f) => present.has(f)).forEach((f) => files.add(f));
  for (const path of changed) {
    let m;
    if (JS_TEST.test(path) || PY_TEST.test(path)) add([path]);
    else if ((m = READERS.find(([pattern]) => pattern.test(path)))) add(m[1]);
    else if (reach && /^(packages\/[^/]+\/(src|bin|page|test)|test)\/.+\.(?:ts|js|mjs)$/.test(path)) {
      const mirrored = /^packages\/[^/]+\/(src|bin)\//.test(path) ? namedTests(path, tracked) : [];
      const reached = [...mirrored, ...reach(path)];
      if (!reached.length) return shared(path, ': no test reaches it');
      add(reached);
    } else if ((m = /^(packages\/[^/]+)\/(?:src|bin)\/.+\.(?:ts|js|mjs)$/.exec(path))) {
      if (base(path) === 'index.ts') return shared(path, ': the package’s entry');
      const mirrored = namedTests(path, tracked);
      if (!mirrored.length) return shared(path, ': no test is named after it');
      add(mirrored);
    } else if ((m = /^(python\/[^/]+)\/src\/.+\.py$/.exec(path))) {
      const mirrored = tracked.filter(
        (f) => f.startsWith(`${m[1]}/tests/`) && PY_TEST.test(f) && named(stem(f).slice(5), stem(path), '_'),
      );
      if (!mirrored.length) return shared(path, ': no test is named after it');
      add(mirrored);
    } else if ((m = /^scripts\/([^/]+)\.(?:mjs|js)$/.exec(path))) {
      const mirrored = tracked.filter(
        (f) => /^test\/[^/]+\.test\.(js|mjs)$/.test(f) && named(stem(f).replace(/\.test$/, ''), m[1], '-'),
      );
      if (!mirrored.length) return shared(path, ': no test is named after it');
      add(mirrored);
    } else return shared(path);
  }
  // paths changed, yet no test left to run for any (a deleted test file, say): not safe to run nothing
  if (changed.length && !files.size) return { all: true, reason: `${changed[0]} maps to no test` };
  return { all: false, files: [...files].sort() };
}

/** Runs a command in the repository with its output going straight through; the exit status. */
const execute = (command, args) => spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' }).status ?? 1;

const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n')
    .filter(Boolean);

/**
 * The commit the change is measured from: where this branch left main. On main itself there is no such point, so it is
 * the commit before the last one (the last commit is the change). HEAD when there is no main to compare with.
 */
function baseCommit(ref) {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')[0];
  for (const candidate of ref ? [ref] : ['main', 'origin/main']) {
    try {
      const base = git('merge-base', 'HEAD', candidate)[0];
      if (ref || branch !== candidate.replace(/^origin\//, '') || base !== git('rev-parse', 'HEAD')[0]) return base;
      return git('rev-parse', 'HEAD~1')[0];
    } catch {
      /* no such branch here, or no commit before this one: try the next */
    }
  }
  return 'HEAD';
}

/** Every path changed since the base: committed, staged, unstaged and not yet tracked (a deleted file among them). */
const changedPaths = (ref) => [
  ...new Set([...git('diff', '--name-only', baseCommit(ref)), ...git('ls-files', '--others', '--exclude-standard')]),
];

/** Every file now in the repository, tracked or new. */
const repositoryFiles = () =>
  [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard'))].filter((f) => existsSync(join(ROOT, f)));

function main(argv) {
  const list = argv.includes('--list');
  const at = argv.indexOf('--base');
  const ref = at === -1 ? undefined : argv[at + 1];
  const given = argv.filter((a, i) => !a.startsWith('--') && (at === -1 || i !== at + 1));
  const changed = given.length ? given : changedPaths(ref);
  if (!changed.length) {
    process.stdout.write('nothing has changed, so no tests were chosen\n');
    return 0;
  }
  const tracked = repositoryFiles();
  const graph = importGraph(tracked, (f) => readFileSync(join(ROOT, f), 'utf8'));
  const plan = testsForChanges(changed, tracked, (path) => testsReaching(graph, path));
  const python = changed.some((f) => f.startsWith('python/'));
  if (list) {
    process.stdout.write(plan.all ? `whole suite: ${plan.reason}\n` : plan.files.map((f) => `${f}\n`).join(''));
    return 0;
  }
  const reporter = '--test-reporter=./scripts/quiet-reporter.mjs';
  // each test's own time limit, as npm test sets it; the run as a whole is under scripts/run-ceiling.mjs
  const timeout = '--test-timeout=300000';
  const pyRunner = ['run', '--locked', '--directory', 'python/graph_spec', 'python', '../../scripts/quiet_unittest.py'];
  if (plan.all) {
    process.stdout.write(`whole suite: ${plan.reason}\n`);
    const js = execute(process.execPath, ['--test', timeout, reporter]);
    return (python ? execute('uv', pyRunner) : 0) || js;
  }
  const js = plan.files.filter((f) => JS_TEST.test(f));
  const py = plan.files.filter((f) => PY_TEST.test(f));
  const jsStatus = js.length ? execute(process.execPath, ['--test', timeout, reporter, ...js]) : 0;
  const pyStatus = py.length ? execute('uv', [...pyRunner, ...py.map(base)]) : 0;
  return jsStatus || pyStatus;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
