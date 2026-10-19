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
