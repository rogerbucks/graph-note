#!/usr/bin/env node
// Runs only the tests of the modules a change touches (spec §13, touched_tests_only), found by the tests-mirror-the-code
// naming (CONTRIBUTING.md, "Naming"): `zoom.ts` is tested by `zoom.test.js` and `zoom-limits.test.js` in the same
// package's test folder, `graph_svg.py` by `test_graph_svg*.py`. A changed test file runs itself.
//
// This is the quick check while working. The whole suite still runs before every merge, and CI runs it (`npm test`).
// When a change touches anything shared, the whole suite is the answer, and one line says which file made it so:
// a package's `index.ts`, a module no test is named after, `package.json` and the lock file, test support (the files
// under test/ or tests/ that are not tests themselves), workflows, and any file this script does not know.
//
// Usage:
//   node scripts/changed-tests.mjs                 run the tests of what changed since main (npm run test:changed)
//   node scripts/changed-tests.mjs --list          only print the plan: the test files, or `whole suite: <why>`
//   node scripts/changed-tests.mjs --base <ref>    compare with this commit instead of main's
//   node scripts/changed-tests.mjs [--list] <path>…   plan for these paths, instead of asking git
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS_TEST = /\.test\.(js|mjs)$/;
const PY_TEST = /(^|\/)tests\/test_\w+\.py$/;

/** Files whose tests do not carry their name: the test that checks each. */
const OWNED = {
  'AGENTS.md': 'test/cheap-checks.test.js',
  'CLAUDE.md': 'test/cheap-checks.test.js',
  '.ignore': 'test/cheap-checks.test.js',
  'scripts/quiet-reporter.mjs': 'test/cheap-checks.test.js',
  'scripts/quiet_unittest.py': 'test/cheap-checks.test.js',
  'scripts/changed-tests.mjs': 'test/cheap-checks.test.js',
  'scripts/check-classification.mjs': 'test/classification.test.js',
  'scripts/notices.mjs': 'test/licences.test.js',
  'THIRD_PARTY_NOTICES.md': 'test/licences.test.js',
  'test/seen-failing.json': 'test/tests-first.test.js',
  'test/tests-first.json': 'test/tests-first.test.js',
};
/** Any other document is checked by the conventions test (CONTRIBUTING.md, the guides, the README). */
const DOCUMENT_TEST = 'test/conventions.test.js';

const base = (file) => file.slice(file.lastIndexOf('/') + 1);
const stem = (file) => base(file).replace(/(\.d)?\.[^.]+$/, '');
/** Tests named after a module: the module's own name, or the name and an aspect after a hyphen (or an underscore). */
const named = (test, module, joiner) => test === module || test.startsWith(module + joiner);

/**
 * The tests a change touches. Gives `{ all: false, files }`, the tracked test files, sorted and with none twice, or
 * `{ all: true, reason }` with one line saying which changed path is shared. `changed` is the paths git reports (a
 * deleted file among them); `tracked` is every file now in the repository. A deleted module still runs the tests named
 * after it; a deleted test file has nothing left to run.
 */
export function testsForChanges(changed, tracked) {
  const present = new Set(tracked);
  const files = new Set();
  const shared = (path, why = '') => ({ all: true, reason: `${path} is shared${why}` });
  const add = (list) => list.filter((f) => present.has(f)).forEach((f) => files.add(f));
  for (const path of changed) {
    let m;
    if (JS_TEST.test(path) || PY_TEST.test(path)) add([path]);
    else if (OWNED[path]) add([OWNED[path]]);
    else if ((m = /^(packages\/[^/]+)\/(?:src|bin|harness)\/.+\.(?:ts|js|mjs)$/.exec(path))) {
      if (base(path) === 'index.ts') return shared(path, ': the package’s entry');
      const mirrored = tracked.filter(
        (f) =>
          f.startsWith(`${m[1]}/test/`) && JS_TEST.test(f) && named(stem(f).replace(/\.test$/, ''), stem(path), '-'),
      );
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
    } else if (/\.md$/.test(path)) add([DOCUMENT_TEST]);
    else return shared(path);
  }
  return { all: false, files: [...files].sort() };
}

/** Runs a command in the repository with its output going straight through; the exit status. */
const execute = (command, args) => spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' }).status ?? 1;

const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n')
    .filter(Boolean);

/** The commit the change is measured from: where this branch left main, or HEAD when there is no main to compare with. */
function baseCommit(ref) {
  for (const candidate of ref ? [ref] : ['main', 'origin/main']) {
    try {
      return git('merge-base', 'HEAD', candidate)[0];
    } catch {
      /* no such branch here: try the next */
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
  const plan = testsForChanges(changed, repositoryFiles());
  const python = changed.some((f) => f.startsWith('python/'));
  if (list) {
    process.stdout.write(plan.all ? `whole suite: ${plan.reason}\n` : plan.files.map((f) => `${f}\n`).join(''));
    return 0;
  }
  const reporter = '--test-reporter=./scripts/quiet-reporter.mjs';
  const pyRunner = ['run', '--locked', '--directory', 'python/graph_spec', 'python', '../../scripts/quiet_unittest.py'];
  if (plan.all) {
    process.stdout.write(`whole suite: ${plan.reason}\n`);
    const js = execute(process.execPath, ['--test', reporter]);
    return (python ? execute('uv', pyRunner) : 0) || js;
  }
  const js = plan.files.filter((f) => JS_TEST.test(f));
  const py = plan.files.filter((f) => PY_TEST.test(f));
  if (!plan.files.length) process.stdout.write('no tests touched by this change\n');
  const jsStatus = js.length ? execute(process.execPath, ['--test', reporter, ...js]) : 0;
  const pyStatus = py.length ? execute('uv', [...pyRunner, ...py.map(base)]) : 0;
  return jsStatus || pyStatus;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
