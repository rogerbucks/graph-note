// The workflow that runs the GitHub mirror on every push to main. Checked here:
// - What wakes it, and what it may do.
// - It runs main's own code only.
// - One mirror runs at a time.
// - The project secret goes only to the one step that runs the script.
// Read as text, by indentation, as policy.test.js reads the others. Editor spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { readBoard } from '../scripts/slice-board.mjs';
import { block, jobs, permissionValues, read, runCommands, stripComment, usesRefs } from './repository/repo.js';

const MIRROR = '.github/workflows/project-mirror.yml';
const COMMAND = 'node scripts/github-project.mjs --apply --slices 3,4,5,6,7,8,9,10';
const text = read(MIRROR);
const lines = text.split('\n');
const code = lines.map(stripComment).join('\n');

describe('the workflow that mirrors the requirements on main', () => {
  test('is woken by a push to main alone: never by a pull request, its checks or a person', () => {
    const on = block(lines, 'on', 0).join('\n');
    assert.match(on, /push:\s*\n\s*branches: \[main\]/);
    assert.doesNotMatch(on, /pull_request|workflow_run|workflow_dispatch|schedule|release/);
    assert.doesNotMatch(text, /pull_request_target/);
  });

  test('defaults to read-only, and its one job may write the issues and nothing else', () => {
    assert.deepEqual(permissionValues(block(lines, 'permissions', 0)), ['read']);
    assert.deepEqual(Object.keys(jobs(text)), ['mirror']);
    const given = block(jobs(text).mirror, 'permissions', 4)
      .slice(1)
      .map((l) => stripComment(l).trim())
      .filter(Boolean);
    assert.deepEqual(given.sort(), ['contents: read', 'issues: write']);
    assert.doesNotMatch(code, /write-all|pull-requests: write|contents: write/);
  });

  test('runs one mirror at a time for the whole repository, cancelling none, and says how GitHub queues them', () => {
    assert.match(text, /concurrency:\s*\n\s*group: project-mirror\s*\n\s*cancel-in-progress: false/);
    assert.match(text, /GitHub keeps at most one run waiting in a group/);
    assert.match(text, /a newer push replaces the run that was waiting/);
  });

  test('checks out main, never anything of a pull request, and keeps no credentials', () => {
    const checkouts = lines.filter((l) => /uses:\s*actions\/checkout@/.test(l));
    assert.equal(checkouts.length, 1);
    assert.match(
      text,
      /uses: actions\/checkout@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*\n\s*with:\s*\n\s*ref: main\s*\n\s*persist-credentials: false/,
    );
    assert.doesNotMatch(code, /head_ref|head\.sha|head\.ref|pull_request|github\.event/);
  });

  test('sets up Node without a package cache and installs nothing, so no dependency runs beside the secret', () => {
    assert.match(
      text,
      /uses: actions\/setup-node@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*\n\s*with:\s*\n\s*node-version: 24\s*\n\s*package-manager-cache: false/,
    );
    assert.deepEqual(runCommands(text), [COMMAND]);
    assert.doesNotMatch(code, /npm (ci|install)|yarn|pnpm|actions\/cache/);
  });

  test('runs the full mirror of slices 3 to 10, never passing --accept-warnings or --allow-removals', () => {
    assert.doesNotMatch(code, /--accept-warnings|--allow-removals/);
    const slices = new Set(readBoard(read(REQUIREMENTS)).requirements.map((r) => r.slice));
    assert.deepEqual(
      [...slices].filter((s) => s >= 3).sort((a, b) => a - b),
      [3, 4, 5, 6, 7, 8, 9, 10],
      'a new slice is added to the command here',
    );
  });

  test('gives PROJECT_TOKEN to the one step that runs the script, and the workflow’s own token for the issues', () => {
    assert.equal((text.match(/secrets\.PROJECT_TOKEN/g) ?? []).length, 1);
    assert.match(
      text,
      /env:\s*\n\s*GH_TOKEN: \$\{\{ github\.token \}\}\s*\n\s*PROJECT_TOKEN: \$\{\{ secrets\.PROJECT_TOKEN \}\}\s*\n\s*run: node scripts\/github-project\.mjs --apply --slices 3,4,5,6,7,8,9,10\s*$/m,
    );
    assert.equal((text.match(/secrets\./g) ?? []).length, 1);
  });

  test('puts no text of an event into a command line', () => {
    for (const run of runCommands(text)) assert.doesNotMatch(run, /\$\{\{/);
    assert.doesNotMatch(text, /run:[^\n]*\$\{\{/);
  });

  test('pins every action to a full commit hash, its version in a comment, and has a time limit', () => {
    for (const ref of usesRefs(text)) {
      assert.match(ref, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
      assert.match(
        lines.find((l) => l.includes(ref)),
        /#\s*v\d+(\.\d+){0,2}\s*$/,
      );
    }
    assert.match(text, /timeout-minutes: \d+/);
  });
});
