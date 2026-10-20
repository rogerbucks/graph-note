#!/usr/bin/env node
// What CI runs for a change (spec §13, touched_tests_only). A draft pull request runs only the tests its change
// reaches, as `npm run test:changed` picks them. Everything else runs the whole suite: a push to main, a release, and a
// pull request that is ready for review. A draft cannot merge, so every merge has had a full run on its last commit.
//
// The safety checks never depend on this plan, and always run. They are lint, the types, the build and tests-first,
// with the history scan, the sign-off and the dependency review. When this plan fails, every job runs.
//
// A doc (a `.md` file that no rule in changed-tests.mjs maps) runs the repository's own tests in test/. Those are the
// tests that read the repository's files. It also runs every other test that names the doc or its folder.
//
// Usage:
//   node scripts/ci-plan.mjs --base <sha>   the plan for HEAD since its merge base with <sha>. EVENT is the
//                                           GitHub event's name and DRAFT is true or false, both from the environment.
//                                           The plan goes to GITHUB_OUTPUT and GITHUB_STEP_SUMMARY when they are set.
//   node scripts/ci-plan.mjs --list [--base <sha>]   print the plan, as a draft pull request would get it.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testsForChanges } from './changed-tests.mjs';
import { importGraph, testsReaching } from './import-graph.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS_TEST = /\.test\.(js|mjs)$/;
const REPOSITORY_TEST = /^test\/[^/]+\.test\.(js|mjs)$/;

/** The most machines a subset is spread over, as the whole suite is; and the test files each one is given at least. */
export const SHARDS = 6;
const FILES_PER_SHARD = 25;

/** A path the shell can be given unquoted: it splits on spaces only, and nothing in it is a pattern or a command. */
const SAFE_NAME = /^[\w./@-]+$/;

const whole = (reason) => ({ tier: 'full', reason, files: [], shards: SHARDS, python: true });

/**
 * The tests that may read a doc. They are the repository tests in test/, and each other test whose text names the
 * doc's file or its first folder. `read(path)` is a file's text.
 */
export function docReaders(path, tracked, read) {
  const names = [path.slice(path.lastIndexOf('/') + 1), path.includes('/') ? `${path.split('/')[0]}/` : null];
  return tracked.filter(
    (f) => JS_TEST.test(f) && (REPOSITORY_TEST.test(f) || names.some((n) => n && read(f).includes(n))),
  );
}

/**
 * The plan for a change. Gives `{ tier, reason, files, shards, python }`:
 * - `tier` is `full` (the whole suite) or `subset` (only `files`, the JavaScript test files, sorted);
 * - `shards` is how many of the suite's machines a subset needs (none when it has no JavaScript test);
 * - `python` is whether the Python jobs run: always, unless a subset changed nothing their tests read.
 * `event` is the GitHub event's name, `draft` whether the pull request is a draft, `changed` the paths it changed.
 * `reach(path)` is the tests that reach a file through the import graph, and `read(path)` is a file's text.
 */
export function ciPlan({ event, draft, changed, tracked, reach, read }) {
  if (event !== 'pull_request') return whole(`a ${event ?? 'run'} runs everything`);
  if (draft !== true) return whole('a pull request ready for review runs everything');
  if (!changed.length) return whole('no changed file was found');
  const files = new Set();
  const rest = [];
  for (const path of changed) {
    const alone = testsForChanges([path], tracked, reach);
    if (alone.all && /\.md$/.test(path) && tracked.includes(path))
      docReaders(path, tracked, read).forEach((f) => files.add(f));
    else rest.push(path);
  }
  if (rest.length) {
    const plan = testsForChanges(rest, tracked, reach);
    if (plan.all) return whole(`whole suite: ${plan.reason}`);
    plan.files.forEach((f) => files.add(f));
  }
  const js = [...files].filter((f) => JS_TEST.test(f)).sort();
  const unsafe = js.find((f) => !SAFE_NAME.test(f));
  if (unsafe)
    return whole(`whole suite: the test file name ${JSON.stringify(unsafe)} cannot be passed to the shell as is`);
  const shards = Math.min(SHARDS, Math.ceil(js.length / FILES_PER_SHARD));
  // the Python tests read the Python library, and through Node the core, the format library and the plugin's code
  const python = changed.some((f) => /^(python|packages|scripts)\//.test(f));
  return { tier: 'subset', reason: `${js.length} test files that the change reaches`, files: js, shards, python };
}

const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n')
    .filter(Boolean);

/** The plan for HEAD against `base`, read from this repository. */
export function planHere({ base, event, draft }) {
  const from = git('merge-base', base, 'HEAD')[0];
  const changed = git('diff', '--name-only', from, 'HEAD');
  const tracked = git('ls-files').filter((f) => existsSync(join(ROOT, f)));
  const read = (f) => readFileSync(join(ROOT, f), 'utf8');
  const graph = importGraph(tracked, read);
  return ciPlan({ event, draft, changed, tracked, reach: (p) => testsReaching(graph, p), read });
}

/** The plan as a job summary: what runs, and why. */
export const summary = (plan) =>
  [
    plan.tier === 'full' ? '### CI plan: everything runs' : '### CI plan: a partial run, as this is a draft',
    '',
    plan.reason,
    ...(plan.tier === 'subset'
      ? [
          '',
          `Python jobs: ${plan.python ? 'run' : 'skipped, as nothing they read changed'}.`,
          'Marking the pull request ready for review runs everything.',
          '',
          ...plan.files.map((f) => `- \`${f}\``),
        ]
      : []),
    '',
  ].join('\n');

function main(argv) {
  const at = argv.indexOf('--base');
  const base = at === -1 ? 'origin/main' : argv[at + 1];
  if (!base) {
    console.error('--base needs the commit to compare with');
    return 2;
  }
  const list = argv.includes('--list');
  const event = list ? 'pull_request' : process.env.EVENT;
  const draft = list ? true : process.env.DRAFT === 'true';
  const plan = planHere({ base, event, draft });
  if (list || !process.env.GITHUB_OUTPUT) {
    process.stdout.write(summary(plan));
    return 0;
  }
  const out = {
    tier: plan.tier,
    shards: String(plan.shards),
    python: String(plan.python),
    tests: plan.files.join(' '),
  };
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(out)
      .map(([k, v]) => `${k}=${v}\n`)
      .join(''),
  );
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(plan));
  console.log(`${plan.tier}: ${plan.reason}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
