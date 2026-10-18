// The workflow that leaves Claude's review on a pull request. It checks what wakes it, whom it skips and what it may
// do. It checks that its token goes only to the step that checks it and to the action. Read as text, by indentation,
// as policy.test.js reads the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, exists, jobs, permissionValues, read, runCommands, stripComment, usesRefs } from './repository/repo.js';

const REVIEW = '.github/workflows/claude-review.yml';

describe('the workflow that leaves Claude’s review on a pull request', () => {
  const text = exists(REVIEW) ? read(REVIEW) : '';
  const lines = text.split('\n');
  const code = lines.map(stripComment).join('\n');

  test('is there', () => {
    assert.ok(exists(REVIEW), REVIEW);
  });

  test('is woken by a pull request alone, never pull_request_target', () => {
    const on = block(lines, 'on', 0)?.join('\n') ?? '';
    assert.match(on, /pull_request:\s*\n\s*types: \[opened, synchronize, reopened, ready_for_review\]/);
    assert.doesNotMatch(on, /push:|workflow_run|workflow_dispatch|schedule|release|issue_comment/);
    assert.doesNotMatch(text, /pull_request_target/);
  });

  test('skips forks, drafts and Dependabot, whose runs are given no secrets', () => {
    const job = jobs(text).review?.join('\n') ?? '';
    assert.match(job, /!github\.event\.pull_request\.draft/);
    assert.match(job, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
    assert.match(job, /github\.event\.pull_request\.user\.login != 'dependabot\[bot\]'/);
  });

  test('defaults to read-only, and its one job may write pull request comments and nothing else', () => {
    assert.deepEqual(permissionValues(block(lines, 'permissions', 0) ?? []), ['read']);
    assert.deepEqual(Object.keys(jobs(text)), ['review']);
    const given = (block(jobs(text).review, 'permissions', 4) ?? [])
      .slice(1)
      .map((l) => stripComment(l).trim())
      .filter(Boolean);
    assert.deepEqual(given.sort(), ['contents: read', 'pull-requests: write']);
    assert.doesNotMatch(code, /write-all|contents: write|issues: write|id-token: write/);
  });

  test('gives the token only to the step that checks it and to the action, and no secret else', () => {
    assert.equal((text.match(/secrets\.CLAUDE_CODE_OAUTH_TOKEN/g) ?? []).length, 2);
    assert.equal((text.match(/secrets\./g) ?? []).length, 2);
    assert.match(text, /env:\s*\n\s*TOKEN: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN \}\}\s*\n\s*run: \|/);
    assert.match(text, /claude_code_oauth_token: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN \}\}/);
  });

  test('passes with a notice when the token is not set', () => {
    assert.match(text, /::notice::CLAUDE_CODE_OAUTH_TOKEN is not set/);
    const gated = lines.filter((l) => /^\s*- if: steps\.token\.outputs\.set == 'true'$/.test(l));
    assert.equal(gated.length, usesRefs(text).length, 'every action waits for the token');
  });

  test('checks out without keeping credentials, and runs no event text in a command line', () => {
    assert.match(
      text,
      /uses: actions\/checkout@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*\n\s*with:\s*\n\s*fetch-depth: 1\s*\n\s*persist-credentials: false/,
    );
    for (const run of runCommands(text)) assert.doesNotMatch(run, /\$\{\{/);
  });

  test('lets the review comment and read, and never approve, push or edit', () => {
    const allowed = text.match(/--allowedTools "([^"]+)"/)?.[1] ?? '';
    assert.deepEqual(allowed.split(','), [
      'mcp__github_inline_comment__create_inline_comment',
      'Bash(gh pr comment:*)',
      'Bash(gh pr diff:*)',
      'Bash(gh pr view:*)',
    ]);
    assert.match(text, /Never approve, request\s+changes, push or edit files\./);
  });
});
