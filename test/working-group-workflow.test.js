// The workflow that lets Sara (Claude) keep up with the pinned "Working group" discussion (docs/agents/ROLES.md, "How
// Sara keeps up"). Checked here: what wakes it, and that Claude runs only when Sara is named. Claude writes a draft;
// a separate job posts it, running no repository code. Read as text, by indentation, as policy.test.js reads
// the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, exists, jobs, permissionValues, read, runCommands, stripComment, usesRefs } from './repository/repo.js';

const FLOW = '.github/workflows/working-group.yml';

describe('the workflow that keeps Sara up with the working group discussion', () => {
  const text = exists(FLOW) ? read(FLOW) : '';
  const lines = text.split('\n');
  const given = (job) =>
    (block(jobs(text)[job] ?? [], 'permissions', 4) ?? [])
      .slice(1)
      .map((l) => stripComment(l).trim())
      .filter(Boolean)
      .sort();

  test('is there', () => {
    assert.ok(exists(FLOW), FLOW);
  });

  test('is woken by a new discussion comment and once each morning, and by nothing broad', () => {
    const on = block(lines, 'on', 0)?.join('\n') ?? '';
    assert.match(on, /discussion_comment:\s*\n\s*types: \[created\]/);
    assert.match(on, /schedule:\s*\n\s*- cron: '30 7 \* \* \*'/);
    assert.doesNotMatch(on, /push:|pull_request|issue_comment|issues:|workflow_run|release/);
  });

  test('looks only at the working group discussion, number 825', () => {
    assert.match(text, /DISCUSSION: 825/);
    assert.match(jobs(text).check?.join('\n') ?? '', /github\.event\.discussion\.number == 825/);
  });

  test('is woken only by a comment from the owner, a member or a collaborator, and hides the rest (risk TRUST-5)', () => {
    const check = jobs(text).check.join('\n');
    assert.match(
      check,
      /contains\(fromJSON\('\["OWNER","MEMBER","COLLABORATOR"\]'\), github\.event\.comment\.author_association\)/,
    );
    assert.match(check, /authorAssociation/);
    const runs = runCommands(check);
    const trimAt = runs.findIndex((r) => /working-group\.mjs trim/.test(r));
    assert.ok(
      trimAt >= 0 && trimAt < runs.findIndex((r) => /working-group\.mjs plan/.test(r)),
      'trimmed before the plan',
    );
  });

  test('defaults to read-only; only the post job may write, and only to discussions', () => {
    assert.deepEqual(permissionValues(block(lines, 'permissions', 0) ?? []), ['read']);
    assert.deepEqual(Object.keys(jobs(text)), ['check', 'draft', 'vet', 'post']);
    assert.deepEqual(given('check'), ['contents: read', 'discussions: read']);
    assert.deepEqual(given('draft'), ['contents: read']);
    assert.deepEqual(given('vet'), ['contents: read']);
    assert.deepEqual(given('post'), ['discussions: write']);
    assert.doesNotMatch(text, /write-all|contents: write|issues: write|pull-requests: write|id-token: write/);
  });

  test('runs Claude only when the check finds Sara named and her daily comment unused', () => {
    assert.match(jobs(text).check.join('\n'), /node scripts\/working-group\.mjs plan/);
    assert.match(jobs(text).draft.join('\n'), /if: needs\.check\.outputs\.act == 'true'/);
  });

  test('gives Claude no GitHub tools: it reads files and may write its two draft files, nothing else', () => {
    const allowed = text.match(/--allowedTools "([^"]+)"/)?.[1] ?? '';
    assert.deepEqual(allowed.split(','), [
      'Read',
      'Glob',
      'Grep',
      'Write(.working-group/reply.md)',
      'Write(.working-group/reply-to)',
    ]);
    assert.match(text, /--max-turns \d+/);
  });

  test('keeps the Claude token to the step that checks it and the action, and no secret else', () => {
    assert.equal((text.match(/secrets\.CLAUDE_CODE_OAUTH_TOKEN/g) ?? []).length, 2);
    assert.equal((text.match(/secrets\./g) ?? []).length, 2);
    assert.match(text, /::notice::CLAUDE_CODE_OAUTH_TOKEN is not set/);
  });

  test('posts from a job that checks the draft, checks out nothing and runs no Node or repository script', () => {
    const post = jobs(text).post.join('\n');
    assert.deepEqual(
      usesRefs(post).map((r) => r.split('@')[0]),
      ['actions/download-artifact'],
    );
    assert.doesNotMatch(post, /actions\/checkout|npm |node /);
    assert.match(post, /needs: vet\n/);
    assert.match(post, /addDiscussionComment/);
  });

  test('checks the draft in its own job, from a fresh checkout of the default branch, never where Claude wrote', () => {
    const draft = jobs(text).draft.join('\n');
    const vet = jobs(text).vet.join('\n');
    assert.doesNotMatch(runCommands(draft).join('\n'), /node /, 'the draft job runs no script after Claude');
    assert.match(vet, /needs: draft\n/);
    assert.match(vet, /ref: \$\{\{ github\.event\.repository\.default_branch \|\| 'main' \}\}/);
    const vetted = runCommands(vet).join('\n');
    assert.match(vetted, /^node scripts\/working-group\.mjs check vet\/discussion\/discussion\.json vet\/draft$/m);
    assert.equal((vetted.match(/node /g) ?? []).length, 1, 'the checker alone');
  });

  test('pins every action to a full commit and puts no event text in a command line', () => {
    assert.ok(usesRefs(text).length, 'the workflow uses actions');
    for (const ref of usesRefs(text)) assert.match(ref, /@[0-9a-f]{40}$/, ref);
    for (const run of runCommands(text)) assert.doesNotMatch(run, /\$\{\{/);
  });

  test('runs one at a time, so two wakes never post twice', () => {
    assert.match(text, /concurrency:\s*\n\s*group: working-group\s*\n\s*cancel-in-progress: false/);
  });
});
