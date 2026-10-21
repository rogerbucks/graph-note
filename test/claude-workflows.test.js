// Every workflow that runs Claude keeps these rules, so the gaps found so far cannot come back in another one:
// - A comment wakes Claude only when its author is the owner, a member or a collaborator. Anyone can comment on a
//   public repository, and a comment is text Claude reads.
// - No step after Claude, in Claude's own job, runs code of the repository. Claude could have changed that code, so a
//   check of its work runs in a later job, from a checkout Claude never touched.
// - A file outside the checkout that Claude must read sits in a folder named by --add-dir. Without it, every read is
//   refused, as the daily fix job found on 21 Oct 2026.
// Read as text, by indentation, as policy.test.js reads the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, jobs, read, stripComment, workflowFiles } from './repository/repo.js';

const COMMENT_EVENTS = /^\s{2}(discussion_comment|issue_comment|pull_request_review_comment|discussion|issues):/m;
const HEARD =
  /contains\(fromJSON\('\["OWNER","MEMBER","COLLABORATOR"\]'\), github\.event\.comment\.author_association\)/;
const ACTION = /uses:\s*anthropics\/claude-code-action@/;
const RUNS_REPO_CODE = /\b(node|npm|npx|python3?|uv|bash|sh)\s+\S|\.\/scripts\//;

/** Each job of a workflow that runs the Claude action, with its lines as they stand, comments taken out. */
const claudeJobs = () =>
  workflowFiles().flatMap((file) =>
    Object.entries(jobs(read(file)))
      .map(([name, lines]) => ({ file, name, lines: lines.map(stripComment) }))
      .filter((j) => j.lines.some((l) => ACTION.test(l))),
  );

describe('every workflow that runs Claude', () => {
  test('there are such workflows, so the rules below are checked on something', () => {
    assert.ok(claudeJobs().length >= 3);
  });

  test('a workflow woken by a comment hears only the owner, members and collaborators (risk TRUST-5)', () => {
    for (const file of workflowFiles()) {
      const text = read(file);
      if (!ACTION.test(text)) continue;
      const on = (block(text.split('\n'), 'on', 0) ?? []).join('\n');
      if (!COMMENT_EVENTS.test(on)) continue;
      assert.match(text, HEARD, `${file}: a comment from anyone wakes Claude`);
    }
  });

  test('a file outside the checkout that Claude is told to read sits in a folder it may read (--add-dir)', () => {
    for (const { file, name, lines } of claudeJobs()) {
      const text = lines.join('\n');
      const allowed = [...text.matchAll(/--add-dir \$\{\{ runner\.temp \}\}\/([\w.-]+)/g)].map((m) => m[1]);
      for (const [, path] of text.matchAll(/(?<!--add-dir )\$\{\{ runner\.temp \}\}\/(\S+)/g)) {
        const folder = path.includes('/') ? path.split('/')[0] : null;
        assert.ok(folder && allowed.includes(folder), `${file} ${name}: Claude may not read ${path}`);
      }
    }
  });

  test('runs no code of the repository after Claude, in Claude’s own job (risk TRUST-5)', () => {
    for (const { file, name, lines } of claudeJobs()) {
      const after = lines.slice(lines.findIndex((l) => ACTION.test(l)) + 1);
      const steps = after
        .join('\n')
        .split(/\n\s{6}- /)
        .slice(1);
      for (const step of steps)
        if (/run:/.test(step)) assert.doesNotMatch(step, RUNS_REPO_CODE, `${file} ${name}: ${step.split('\n')[0]}`);
    }
  });
});
