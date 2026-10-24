// The workflow that flags an auto-merge pull request stuck on a conflict with main, so the session watching it wakes.
// Read as text, by indentation, as policy.test.js reads the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, exists, jobs, permissionValues, read, runCommands, usesRefs } from './repository/repo.js';

const STUCK = '.github/workflows/stuck-prs.yml';

describe('the workflow that flags a stuck auto-merge pull request', () => {
  const text = exists(STUCK) ? read(STUCK) : '';
  const lines = text.split('\n');

  test('runs after each push to main and each half hour, never on a pull request’s own event', () => {
    const on = block(lines, 'on', 0)?.join('\n') ?? '';
    assert.match(on, /push:\s*\n\s*branches: \[main\]/);
    assert.match(on, /cron: '\*\/30 \* \* \* \*'/);
    assert.doesNotMatch(on, /pull_request/);
  });

  test('may write pull request labels and comments and nothing else, and checks out no code', () => {
    assert.deepEqual(permissionValues(block(lines, 'permissions', 0) ?? []), ['read']);
    assert.deepEqual(Object.keys(jobs(text)), ['flag']);
    assert.deepEqual(permissionValues(block(jobs(text).flag, 'permissions', 4) ?? []), ['write']);
    assert.match(jobs(text).flag.join('\n'), /pull-requests: write/);
    assert.deepEqual(usesRefs(text), []);
  });

  test('flags only a ready auto-merge pull request that conflicts, once, and clears the flag when it is gone', () => {
    const run = runCommands(text).join('\n');
    assert.match(run, /select\(\.auto_merge != null and \(\.draft \| not\)\)/);
    assert.match(run, /"\$state" = dirty \] && \[ "\$labelled" = false \]/);
    assert.match(run, /-X DELETE "repos\/\$REPO\/issues\/\$n\/labels\/merge-conflict"/);
    assert.doesNotMatch(run, /\$\{\{/);
  });
});
