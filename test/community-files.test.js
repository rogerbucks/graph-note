// The community files (spec §13, community_files). They are:
// - a code of conduct that says how to report in private.
// - a note that the licence gives no right to the name.
// - the rule that every commit in a pull request is signed off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from './repository/repo.js';

test('the community files are present: a code of conduct, a trademark note and the sign-off rule (Roger, 18 Oct 2026)', () => {
  const conduct = read('CODE_OF_CONDUCT.md');
  assert.match(conduct, /^# Code of conduct/m);
  assert.match(conduct, /## How to report/);
  const marks = read('TRADEMARKS.md');
  assert.match(marks, /ThoughtKnot/);
  assert.match(marks, /fork/i);
  assert.match(marks, /Mozilla Public License/);
  const contributing = read('CONTRIBUTING.md');
  assert.match(contributing, /^## Signing off your work$/m);
  assert.match(contributing, /Signed-off-by:/);
  assert.match(contributing, /https:\/\/developercertificate\.org/);
  assert.match(read('.github/pull_request_template.md'), /- \[ \] Every commit is signed off/);
});

// The security policy (spec §13, security_policy): which versions get fixes, a private way to report, and a reply time.
test('the security policy names the supported versions, a private way to report and a reply time (Roger, 18 Oct 2026)', () => {
  const policy = read('SECURITY.md');
  assert.match(policy, /^# Security policy/m);
  assert.match(policy, /^## Supported versions$/m);
  assert.match(policy, /^## How to report a problem$/m);
  assert.match(policy, /https:\/\/github\.com\/rogerbucks\/thoughtknot\/security\/advisories\/new/);
  assert.match(policy, /not .*public issue/i);
  assert.match(policy, /^## What happens next$/m);
  assert.match(policy, /\d+ (working )?days/);
});

// Who may contribute (spec §13, contribution_by_invitation). The settings keep pull requests to collaborators, so the
// docs say so first and never invite a stranger to send one.
test('the contributing guide says pull requests are by invitation, and no doc invites a stranger to send one (Roger, 19 Oct 2026)', () => {
  const contributing = read('CONTRIBUTING.md');
  const top = contributing.slice(0, contributing.indexOf('\n## '));
  assert.match(top, /collaborators/i, 'the top of CONTRIBUTING.md names the collaborators-only rule');
  assert.match(top, /https:\/\/github\.com\/rogerbucks\/thoughtknot\/discussions/);
  assert.match(top, /ask to join/i);
  const collaboratorsOnly = /repoField\('pull_request_creation_policy', 'collaborators_only'\)/.test(
    read('scripts/public-readiness.mjs'),
  );
  if (collaboratorsOnly)
    for (const file of ['README.md', 'CONTRIBUTING.md', 'wiki/Home.md', 'wiki/For-developers.md'])
      assert.doesNotMatch(read(file), /(anyone|everyone)[^.]*\bsend a pull request/i, file);
});

// The rules an AI session needs before a pull request (spec §13, agents_pr_rules). Each command rewrites a file that CI
// checks, so a session that skips one fails CI.
const REGENERATING = [
  'node scripts/tests-first.mjs --update',
  'node scripts/tests-first.mjs --excuse',
  'node scripts/plain-docs.mjs',
  'node scripts/public-api.mjs --update',
  'node scripts/notices.mjs',
  'node scripts/readme-status.mjs --write',
  'node scripts/fixed-sleeps.mjs --tighten',
];

test('AGENTS.md lists the rules for a pull request: merge commits, the regenerating commands, sign-off and approval', () => {
  const agents = read('AGENTS.md');
  const at = agents.indexOf('\n## Before you open a pull request\n');
  assert.ok(at !== -1, 'AGENTS.md has a "Before you open a pull request" section');
  const list = agents.slice(at, agents.indexOf('\n## ', at + 1));
  assert.match(list, /merge commit/i);
  assert.match(list, /never squash/i);
  assert.match(list, /sign off as Roger/i);
  assert.match(list, /all good/);
  assert.match(list, /auto-merge/);
  for (const command of REGENERATING) assert.ok(list.includes(command), `names ${command}`);
});

// Asks to an AI agent wait in the working group's discussion, #825, and were being missed (spec §13,
// agents_read_asks; issue #846). So every session reads its own there first.
test('AGENTS.md tells each session to read its asks in discussion #825 before new work (Roger, 21 Oct 2026)', () => {
  const agents = read('AGENTS.md');
  const top = agents.slice(0, agents.indexOf('\n## ', agents.indexOf('\n## ') + 1));
  assert.match(top, /discussions\/825/);
  assert.match(top, /To \[your name\]/);
  assert.match(top, /before new work/i);
  assert.match(read('docs/agents/ROLES.md'), /discussions\/825/);
});

// How posts say who wrote them and who acts (spec §13, roles_from_to): "From [writer]:" and "To [name]:", no
// signature at the bottom (Roger, 21 Oct 2026).
test('ROLES.md uses "From" and "To" lines with no signature', () => {
  const roles = read('docs/agents/ROLES.md');
  assert.match(roles, /\*\*From \[writer\]:\*\*/);
  assert.match(roles, /\*\*To \[name\]:\*\*/);
  assert.match(roles, /no signature/i);
  assert.doesNotMatch(roles, /signs its comments/);
});
