// The community files (spec §13, community_files): a code of conduct that says how to report in private, a note that
// the licence gives no right to the name, and the rule that every commit in a pull request is signed off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read } from './repository/repo.js';

test('the community files are present: a code of conduct, a trademark note and the sign-off rule (Roger, 18 Oct 2026)', () => {
  const conduct = read('CODE_OF_CONDUCT.md');
  assert.match(conduct, /^# Code of conduct/m);
  assert.match(conduct, /## How to report/);
  const marks = read('TRADEMARKS.md');
  assert.match(marks, /Graph Note/);
  assert.match(marks, /fork/i);
  assert.match(marks, /Mozilla Public License/);
  const contributing = read('CONTRIBUTING.md');
  assert.match(contributing, /^## Signing off your work$/m);
  assert.match(contributing, /Signed-off-by:/);
  assert.match(contributing, /https:\/\/developercertificate\.org/);
  assert.match(read('.github/pull_request_template.md'), /- \[ \] Every commit is signed off/);
});
