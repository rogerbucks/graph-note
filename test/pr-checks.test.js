// What every AI agent's pull request must say (spec §13, pr_description_checked). Asked for by Eve, the working group's
// advisor, after five pull requests in a row missed the same things (Roger, 21 Oct 2026).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_LABELS, prProblems, specRequirements } from '../scripts/pr-checks.mjs';
import { read } from './repository/repo.js';

const requirements = new Set(['words_catalogue', 'tests_first']);
const good = {
  body: 'Before: …\n\nRequirements: words_catalogue, tests_first\n',
  labels: ['agent:claude'],
  branch: 'claude/project-thread-abc',
  requirements,
  testsChanged: true,
  failedFirst: 2,
};

describe("an AI agent's pull request", () => {
  test('passes with a Requirements line, its label, no private link and a test seen failing first', () => {
    assert.deepEqual(prProblems(good), []);
  });

  test('needs a Requirements line naming requirements the spec holds', () => {
    assert.match(prProblems({ ...good, body: 'No line here' }).join('\n'), /Requirements:/);
    assert.match(
      prProblems({ ...good, body: 'Requirements: words_catalog' }).join('\n'),
      /no requirement named: words_catalog/,
    );
    assert.deepEqual(prProblems({ ...good, body: '**Requirements:** `words_catalogue`' }), []);
  });

  test('needs the label for the agent whose branch it is', () => {
    assert.match(prProblems({ ...good, labels: [] }).join('\n'), /agent:claude/);
    const charles = { ...good, branch: 'antigravity/812-reflow', labels: ['agent:claude'] };
    assert.match(prProblems(charles).join('\n'), /agent:antigravity/);
    assert.deepEqual(prProblems({ ...charles, labels: ['agent:antigravity'] }), []);
  });

  test('refuses a private session link in the description', () => {
    for (const link of ['Claude-Session: https://example.test/x', 'See https://claude.ai/code/session_01abc'])
      assert.match(prProblems({ ...good, body: `${good.body}\n${link}` }).join('\n'), /private session link/);
  });

  test('that changes a test must show one failing on the old code, or say why not', () => {
    const none = { ...good, failedFirst: 0 };
    assert.match(prProblems(none).join('\n'), /failing on the old code/);
    assert.deepEqual(prProblems({ ...none, testsChanged: false }), []);
    const why = `${good.body}Tests first: the fix is to the test runner itself, so no test can fail first.\n`;
    assert.deepEqual(prProblems({ ...none, body: why }), []);
    assert.match(prProblems({ ...none, body: `${good.body}Tests first: n/a\n` }).join('\n'), /failing on the old code/);
  });

  test("is checked only on an agent's branch: Dependabot's and a person's are left alone", () => {
    for (const branch of ['dependabot/npm_and_yarn/x', 'copilot/y', 'roger-fix'])
      assert.deepEqual(prProblems({ branch, requirements }), []);
  });
});

test('the labels are the ones ROLES.md gives each agent', () => {
  const roles = read('docs/agents/ROLES.md');
  for (const label of Object.values(AGENT_LABELS)) assert.ok(roles.includes(`\`${label}\``), label);
});

test('the requirements are read from the spec', () => {
  const ids = specRequirements();
  assert.ok(ids.has('words_catalogue') && ids.has('pr_description_checked'));
});

test('a workflow runs it on every pull request, again when its description or labels change', () => {
  const flow = read('.github/workflows/pr-checks.yml');
  assert.match(flow, /types: \[opened, edited, labeled, unlabeled, synchronize, reopened, ready_for_review\]/);
  assert.match(flow, /BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
  assert.match(flow, /node scripts\/pr-checks\.mjs --base "\$BASE"/);
});

test('the pull request template asks for the Requirements line, the label and a test seen failing first', () => {
  const template = read('.github/pull_request_template.md');
  assert.match(template, /^Requirements:/m);
  assert.match(template, /agent:claude/);
  assert.match(template, /Tests first:/);
  assert.match(template, /private session link/i);
});
