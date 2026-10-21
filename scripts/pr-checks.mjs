#!/usr/bin/env node
// What every AI agent's pull request must say (spec §13, pr_description_checked). The PR checks workflow runs it on
// each pull request from a `claude/` or `antigravity/` branch. It fails the pull request when:
// - the description has no `Requirements:` line naming requirements the spec holds;
// - the pull request has no label for the agent whose branch it is, such as `agent:claude`;
// - the description holds a private session link;
// - the pull request changes a test, but its tests-first records show no test failing on the old code. A
//   `Tests first:` line in the description can say why none can.
//
// Usage, in CI: BODY, LABELS (a JSON list of label names) and BRANCH in the environment, then
//   node scripts/pr-checks.mjs --base <commit>
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVATE_LINK } from './private-links.mjs';
import { RECORDS } from './tests-first-records.mjs';
import { JS_TEST, PY_TEST } from './tests-first-run.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = 'requirements/editor-requirements.md';

/** The label each agent's branches must carry (docs/agents/ROLES.md). Other branches are not checked. */
export const AGENT_LABELS = { 'claude/': 'agent:claude', 'antigravity/': 'agent:antigravity' };

// A line such as `Requirements: words_catalogue, tests_first`, bold or not.
const REQUIREMENTS = /^\s*(?:\*\*)?Requirements:(?:\*\*)?\s*(.*)$/im;
const TESTS_FIRST = /^\s*(?:\*\*)?Tests first:(?:\*\*)?\s*(.*)$/im;

/** The ids of every requirement the spec holds. */
export function specRequirements(root = ROOT) {
  const spec = readFileSync(join(root, SPEC), 'utf8');
  return new Set([...spec.matchAll(/\((\w+):Requirement /g)].map((m) => m[1]));
}

/**
 * The problems in one pull request, each a short line saying what to fix. `testsChanged` is whether it changes a test
 * file. `failedFirst` is how many tests its tests-first records show failing on the old code.
 */
export function prProblems({
  body = '',
  labels = [],
  branch = '',
  requirements,
  testsChanged = false,
  failedFirst = 0,
}) {
  const prefix = Object.keys(AGENT_LABELS).find((p) => branch.startsWith(p));
  if (!prefix) return [];
  const problems = [];
  // the template's hints are HTML comments, which GitHub does not show
  body = body.replace(/<!--[\s\S]*?-->/g, '');
  const named = REQUIREMENTS.exec(body)?.[1].match(/[a-z][a-z0-9_]*/g) ?? [];
  if (!named.length)
    problems.push('Add a "Requirements:" line naming the spec requirements this builds, such as words_catalogue.');
  const unknown = named.filter((id) => !requirements.has(id));
  if (unknown.length) problems.push(`The spec has no requirement named: ${unknown.join(', ')}.`);
  const label = AGENT_LABELS[prefix];
  if (!labels.includes(label)) problems.push(`Add the label ${label}.`);
  if (PRIVATE_LINK.test(body)) problems.push('Take the private session link out of the description.');
  const why = TESTS_FIRST.exec(body)?.[1].trim() ?? '';
  if (testsChanged && !failedFirst && why.split(/\s+/).length < 3)
    problems.push(
      'No test is seen failing on the old code. Name a new test for what changed, with its code in the same commit,' +
        ' then run node scripts/tests-first.mjs --update. Or add a "Tests first:" line saying why none can fail.',
    );
  return problems;
}

/** Whether the commits since `base` change a test file, and how many tests their records show failing first. */
export function testsFirstSince(base, root = ROOT) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n');
  const testsChanged = changed.some((f) => JS_TEST.test(f) || PY_TEST.test(f));
  let failedFirst = 0;
  for (const sha of git('rev-list', '--no-merges', `${base}..HEAD`).split('\n').filter(Boolean)) {
    const file = join(root, RECORDS, `${sha}.json`);
    if (!existsSync(file)) continue;
    for (const entry of JSON.parse(readFileSync(file, 'utf8')).files ?? []) failedFirst += entry.failedFirst.length;
  }
  return { testsChanged, failedFirst };
}

function main(argv) {
  const at = argv.indexOf('--base');
  const base = at === -1 ? undefined : argv[at + 1];
  if (!base) {
    console.error('Usage: node scripts/pr-checks.mjs --base <commit>');
    return 2;
  }
  const problems = prProblems({
    body: process.env.BODY ?? '',
    labels: JSON.parse(process.env.LABELS || '[]'),
    branch: process.env.BRANCH ?? '',
    requirements: specRequirements(),
    ...testsFirstSince(base),
  });
  for (const p of problems) console.error(`  ${p}`);
  if (problems.length) {
    console.error(`${problems.length} to fix in this pull request (docs/agents/ROLES.md, "Claiming work").`);
    return 1;
  }
  console.log('pull request: requirements named, label set, no private link, tests seen failing first');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
