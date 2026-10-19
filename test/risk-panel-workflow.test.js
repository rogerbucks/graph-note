// The workflow that runs the expert panel over what changed since the last stable release (spec §50, risk_panel). It
// checks what wakes it and that it spends a Claude session only when something it watches moved. It checks where its
// token goes, and that the one job that may write touches an issue alone. Read as text, by indentation, as policy.test.js reads
// the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, exists, jobs, permissionValues, read, stripComment, usesRefs } from './repository/repo.js';

const PANEL = '.github/workflows/risk-panel.yml';

describe('the workflow that runs the risk panel', () => {
  const text = exists(PANEL) ? read(PANEL) : '';
  const lines = text.split('\n');
  const all = jobs(text);
  const job = (name) => (all[name] ?? []).map(stripComment).join('\n');

  test('is there, run by hand alone, and never on a pull request from anyone', () => {
    assert.ok(exists(PANEL), PANEL);
    const on = block(lines, 'on', 0)?.join('\n') ?? '';
    assert.match(on, /workflow_dispatch:/);
    assert.doesNotMatch(on, /pull_request|push:|issue_comment|release:/);
    assert.doesNotMatch(text, /pull_request_target/);
  });

  test('has three jobs: the scope, the panel and the report', () => {
    assert.deepEqual(Object.keys(all), ['scope', 'panel', 'report']);
  });

  test('the scope runs the register script with no install, and the panel runs only when something moved', () => {
    assert.match(job('scope'), /node scripts\/risk-register\.mjs --stale --json/);
    assert.doesNotMatch(job('scope'), /npm ci|npm install/);
    assert.match(job('scope'), /fetch-depth: 0/);
    assert.match(job('panel'), /if: needs\.scope\.outputs\.changed == 'true' \|\| inputs\.all_roles/);
  });

  test('the token is checked first, goes only to the action, and the action may read, diff and write its own folder', () => {
    const panel = job('panel');
    assert.match(panel, /secrets\.CLAUDE_CODE_OAUTH_TOKEN/);
    assert.equal((panel.match(/secrets\.CLAUDE_CODE_OAUTH_TOKEN/g) ?? []).length, 2, 'the check and the action');
    assert.match(panel, /anthropics\/claude-code-action@[0-9a-f]{40}/);
    const allowed = /--allowedTools "([^"]+)"/.exec(panel)?.[1] ?? '';
    assert.ok(allowed.includes('Write(panel-out/*)'), allowed);
    assert.doesNotMatch(allowed, /git push|gh pr|gh issue|Edit|npm/);
    assert.match(panel, /push nothing/);
  });

  test('defaults to read-only, and only the report may write, to issues, running no code of the repository', () => {
    assert.deepEqual(permissionValues(block(lines, 'permissions', 0) ?? []), ['read']);
    const given = (name) =>
      (block(all[name], 'permissions', 4) ?? [])
        .slice(1)
        .map((l) => stripComment(l).trim())
        .filter(Boolean);
    assert.deepEqual(given('scope'), []);
    assert.deepEqual(given('panel'), []);
    assert.deepEqual(given('report'), ['issues: write']);
    const report = job('report');
    assert.deepEqual(
      usesRefs(report).map((r) => r.split('@')[0]),
      ['actions/download-artifact'],
    );
    assert.doesNotMatch(report, /\b(node|npm|npx)\b|scripts\/|actions\/checkout|git push/);
    assert.match(report, /--label risk-panel/);
    assert.match(report, /gh issue close/);
  });

  test('every job has a time limit, and one run at a time', () => {
    for (const name of Object.keys(all)) assert.match(job(name), /timeout-minutes: \d+/, name);
    assert.match(text, /concurrency:\n\s+group: risk-panel/);
  });
});
