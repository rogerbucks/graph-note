#!/usr/bin/env node
// What CI runs for a change (spec §13, touched_tests_only). A pull request, draft or ready, runs only the tests its
// change reaches, as `npm run test:changed` picks them. Everything else runs the whole suite: a push to main, the
// nightly and a release. So every merge is checked in full on main, just after it lands. A pull request labelled
// `ci:full` runs everything too, from its next push: use it for a change whose reach the plan may miss.
//
// The safety checks never depend on this plan, and always run. They are lint, the types, the build and tests-first,
// with the history scan, the sign-off and the dependency review. When this plan fails, every job runs.
//
// A doc (a `.md` file that no rule in changed-tests.mjs maps) runs the repository's own tests in test/. Those are the
// tests that read the repository's files. It also runs every other test that names the doc or its folder.
//
// Usage:
//   node scripts/ci-plan.mjs --base <sha>   the plan for HEAD since its merge base with <sha>. EVENT is the
//                                           GitHub event's name and LABELS the pull request's labels, as a JSON
//                                           list, both from the environment.
//                                           The plan goes to GITHUB_OUTPUT and GITHUB_STEP_SUMMARY when they are set.
//   node scripts/ci-plan.mjs --list [--base <sha>]   print the plan, as a pull request would get it.
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

/**
 * The guards that read the whole repository, so no import reaches them. They catch a new file in no area of
 * requirements/architecture.gql, a new export of the core, a colour the plugin names. A partial run with any
 * JavaScript test runs them too. They take seconds, and a merge no longer turns main red on them.
 */
export const GUARDS = [
  'packages/core/test/index.test.js',
  'packages/obsidian/test/accessibility.test.js',
  'test/code-structure.test.js',
  'test/plain-docs.test.js',
  'test/policy.test.js',
  'test/wiki-developers.test.js',
];

/** The label that asks for the whole suite on a pull request. */
export const FULL_LABEL = 'ci:full';

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
 * `event` is the GitHub event's name, `labels` the pull request's labels, `changed` the paths it changed.
 * `reach(path)` is the tests that reach a file through the import graph, and `read(path)` is a file's text.
 */
export function ciPlan({ event, labels = [], changed, tracked, reach, read }) {
  if (event !== 'pull_request') return whole(`a ${event ?? 'run'} runs everything`);
  if (labels.includes(FULL_LABEL)) return whole(`the pull request is labelled ${FULL_LABEL}`);
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
  if ([...files].some((f) => JS_TEST.test(f))) GUARDS.filter((f) => tracked.includes(f)).forEach((f) => files.add(f));
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
export function planHere({ base, event, labels }) {
  const from = git('merge-base', base, 'HEAD')[0];
  const changed = git('diff', '--name-only', from, 'HEAD');
  const tracked = git('ls-files').filter((f) => existsSync(join(ROOT, f)));
  const read = (f) => readFileSync(join(ROOT, f), 'utf8');
  const graph = importGraph(tracked, read);
  return ciPlan({ event, labels, changed, tracked, reach: (p) => testsReaching(graph, p), read });
}

/** The plan as a job summary: what runs, and why. */
export const summary = (plan) =>
  [
    plan.tier === 'full' ? '### CI plan: everything runs' : '### CI plan: a partial run, only what the change reaches',
    '',
    plan.reason,
    ...(plan.tier === 'subset'
      ? [
          '',
          `Python jobs: ${plan.python ? 'run' : 'skipped, as nothing they read changed'}.`,
          `The label ${FULL_LABEL} runs everything from the next push; a merge to main runs everything.`,
          '',
          ...plan.files.map((f) => `- \`${f}\``),
        ]
      : []),
    '',
  ].join('\n');

/** The labels from the LABELS JSON list. Anything else, such as on a push, is no label. */
export function labelsFrom(text) {
  try {
    const names = JSON.parse(text ?? '[]');
    return Array.isArray(names) ? names.filter((n) => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

function main(argv) {
  const at = argv.indexOf('--base');
  const base = at === -1 ? 'origin/main' : argv[at + 1];
  if (!base) {
    console.error('--base needs the commit to compare with');
    return 2;
  }
  const list = argv.includes('--list');
  const event = list ? 'pull_request' : process.env.EVENT;
  const labels = list ? [] : labelsFrom(process.env.LABELS);
  const plan = planHere({ base, event, labels });
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
