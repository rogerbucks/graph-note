// The workflows of the build status: what wakes them, what each may do, and that the project secret is only ever given to
// the copy of the script that is on main. Read as text, by indentation, as policy.test.js reads the others. Editor spec
// §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, jobs, permissionValues, read, runCommands, stripComment, usesRefs } from './repository/repo.js';
import { IGNORED_CHECKS } from '../scripts/build-status-gh.mjs';

const UPDATE = '.github/workflows/build-status.yml';
const TRIGGER = '.github/workflows/build-status-trigger.yml';
const lines = (file) => read(file).split('\n');
const permissionLines = (blockLines) =>
  blockLines
    .slice(1)
    .map((l) => stripComment(l).trim())
    .filter(Boolean);

describe('the workflow that updates the board and the comment', () => {
  const text = read(UPDATE);

  test('wakes on the checks of a pull request, on a push to main and on a published release', () => {
    const on = block(lines(UPDATE), 'on', 0).join('\n');
    assert.match(on, /workflow_run:/);
    assert.match(on, /workflows: \[CI, Build status trigger\]/);
    assert.match(on, /types: \[completed\]/);
    assert.match(on, /push:\s*\n\s*branches: \[main\]/);
    assert.match(on, /release:\s*\n\s*types: \[published\]/);
  });

  test('is not woken by a pull request itself, so its definition is always the one on main', () => {
    const on = block(lines(UPDATE), 'on', 0).join('\n');
    assert.doesNotMatch(on, /pull_request/);
    assert.doesNotMatch(text, /pull_request_target/);
  });

  test('waits for the workflows it is named after: CI, and the one that wakes it on a close', () => {
    assert.match(read('.github/workflows/ci.yml'), /^name: CI$/m);
    assert.match(read(TRIGGER), /^name: Build status trigger$/m);
  });

  test('defaults to read-only, and its one job may write only a pull request’s comment', () => {
    const top = permissionValues(block(lines(UPDATE), 'permissions', 0));
    assert.deepEqual(top, ['read']);
    const job = block(jobs(text).update, 'permissions', 4);
    assert.deepEqual(permissionLines(job).sort(), [
      'checks: read',
      'contents: read',
      'pull-requests: write',
      'statuses: read',
    ]);
  });

  test('checks out main, never a pull request, and keeps no credentials', () => {
    const checkouts = text.split('\n').filter((l) => /uses:\s*actions\/checkout@/.test(l));
    assert.equal(checkouts.length, 1);
    assert.match(
      text,
      /uses: actions\/checkout@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*\n\s*with:\s*\n\s*ref: main\s*\n\s*persist-credentials: false/,
    );
    assert.doesNotMatch(text, /head_ref|head\.sha|head\.ref|pull_request\.head|workflow_run\.head/);
  });

  test('gives PROJECT_TOKEN to the one step that runs the script on main, and the workflow’s own token for the repository', () => {
    assert.equal((text.match(/secrets\.PROJECT_TOKEN/g) ?? []).length, 1);
    assert.match(
      text,
      /env:\s*\n\s*GH_TOKEN: \$\{\{ github\.token \}\}\s*\n\s*PROJECT_TOKEN: \$\{\{ secrets\.PROJECT_TOKEN \}\}\s*\n\s*run: node scripts\/build-status-run\.mjs\s*$/m,
    );
    assert.doesNotMatch(text, /secrets\.(?!PROJECT_TOKEN)/);
  });

  test('runs nothing but that script: no install, so no install script ever sees the secret', () => {
    const runs = runCommands(text);
    assert.deepEqual(runs, ['node scripts/build-status-run.mjs']);
  });

  test('puts no text of an event into a command line', () => {
    for (const run of runCommands(text)) assert.doesNotMatch(run, /\$\{\{/);
    assert.doesNotMatch(text, /run:[^\n]*\$\{\{/);
  });

  test('pins every action to a full commit hash, its version in a comment', () => {
    for (const ref of usesRefs(text)) {
      assert.match(ref, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
      assert.match(
        text.split('\n').find((l) => l.includes(ref)),
        /#\s*v\d+(\.\d+){0,2}\s*$/,
      );
    }
  });

  test('has a time limit, and one run at a time for a pull request, none cancelled', () => {
    assert.match(text, /timeout-minutes: \d+/);
    assert.match(text, /concurrency:\s*\n\s*group: build-status-/);
    assert.match(text, /cancel-in-progress: false/);
  });
});

describe('the workflow that only wakes it', () => {
  const text = read(TRIGGER);

  test('runs on a pull request opened, pushed to, reopened and closed', () => {
    const on = block(lines(TRIGGER), 'on', 0).join('\n');
    assert.match(on, /pull_request:\s*\n\s*types: \[opened, synchronize, reopened, closed\]/);
    assert.doesNotMatch(text, /pull_request_target/);
  });

  test('can read the repository and nothing more, and has no secret and no checkout', () => {
    assert.deepEqual(permissionValues(block(lines(TRIGGER), 'permissions', 0)), ['read']);
    const code = text.split('\n').map(stripComment).join('\n');
    assert.doesNotMatch(code, /secrets\.|github\.token|checkout|write/);
    assert.deepEqual(usesRefs(text), []);
  });

  test('is one job named as the checks leave out, so it is never taken for a check of the change', () => {
    assert.deepEqual(Object.keys(jobs(text)), IGNORED_CHECKS);
  });

  test('puts no text of the event into a command line', () => {
    assert.doesNotMatch(text, /\$\{\{/);
  });
});
