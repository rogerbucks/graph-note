// The security alerts in the workflows (spec §50, security_release_gate and security_daily). The release, its dry run
// and the nightly each read the alerts for themselves, in a job that installs nothing. The daily workflow keeps one issue
// up to date and fixes only on branches, never on main. Read as text, by indentation, as policy.test.js reads the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, exists, jobs, permissionValues, read, runCommands, stripComment, usesRefs } from './repository/repo.js';

const DAILY = '.github/workflows/security.yml';
const given = (lines) =>
  (block(lines, 'permissions', 4) ?? [])
    .slice(1)
    .map((l) => stripComment(l).trim())
    .filter(Boolean);

describe('the release and its dry run wait on the security alerts', () => {
  for (const file of ['release.yml', 'release-check.yml']) {
    const all = jobs(read(`.github/workflows/${file}`));

    test(`${file}: a job reads the alerts, with no install, and may read security events alone`, () => {
      const job = (all.security ?? []).join('\n');
      assert.deepEqual(runCommands(job), ['node scripts/security-alerts.mjs --release']);
      assert.deepEqual(given(all.security ?? []), ['contents: read', 'security-events: read']);
      assert.match(job, /SECURITY_ALERTS_TOKEN: \$\{\{ secrets\.SECURITY_ALERTS_TOKEN \}\}/);
    });
  }

  test('the release job waits on it', () => {
    const release = jobs(read('.github/workflows/release.yml')).release.join('\n');
    assert.match(release, /needs: \[[^\]]*\bsecurity\b[^\]]*\]/);
  });
});

describe('the daily security workflow', () => {
  const text = exists(DAILY) ? read(DAILY) : '';
  const lines = text.split('\n');
  const all = jobs(text);
  const job = (name) => (all[name] ?? []).map(stripComment).join('\n');

  test('runs each day and by hand, never on a pull request or a push', () => {
    assert.ok(exists(DAILY), DAILY);
    const on = block(lines, 'on', 0)?.join('\n') ?? '';
    assert.match(on, /schedule:\s*\n\s*- cron: '0 6 \* \* \*'/);
    assert.match(on, /workflow_dispatch:/);
    assert.doesNotMatch(on, /pull_request|push:|issue_comment|release:/);
  });

  test('has three jobs: the scan, the issue and the fixes, and reads only by default', () => {
    assert.deepEqual(Object.keys(all), ['scan', 'report', 'fix']);
    assert.deepEqual(permissionValues(block(lines, 'permissions', 0) ?? []), ['read']);
  });

  test('the scan installs nothing, and only the count of alerts not yet planned leaves its runner', () => {
    assert.deepEqual(given(all.scan), ['contents: read', 'security-events: read']);
    assert.doesNotMatch(job('scan'), /npm ci|npm install/);
    assert.match(job('scan'), /--plan --out security-out\/alerts\.md/);
    assert.match(job('scan'), /--details --out "\$RUNNER_TEMP\/alerts\.json"/);
    assert.match(job('scan'), /path: security-out\n/);
  });

  test('the issue is written with gh alone, running no code of the repository', () => {
    assert.deepEqual(given(all.report), ['issues: write']);
    assert.deepEqual(
      usesRefs(job('report')).map((r) => r.split('@')[0]),
      ['actions/download-artifact'],
    );
    assert.doesNotMatch(job('report'), /node |npm |actions\/checkout/);
    assert.match(job('report'), /gh issue close/);
  });

  test('the fixes run only when an alert is not planned, push security branches alone and open no pull request', () => {
    const fix = job('fix');
    assert.match(fix, /if: needs\.scan\.outputs\.unplanned != '0'/);
    assert.deepEqual(given(all.fix), ['contents: read', 'id-token: write', 'security-events: read']);
    assert.equal((fix.match(/secrets\.CLAUDE_CODE_OAUTH_TOKEN/g) ?? []).length, 2, 'the check and the action');
    assert.doesNotMatch(fix, /npm ci|npm install|github_token:/);
    assert.match(fix, /--details --out "\$RUNNER_TEMP\/security-alerts\.json"/);
    const allowed = /--allowedTools "([^"]+)"/.exec(fix)?.[1] ?? '';
    const pushes = allowed.split(',').filter((t) => /git push/.test(t));
    assert.deepEqual(pushes, ['Bash(git push -u origin security/:*)']);
    assert.doesNotMatch(allowed, /gh |npm|curl|WebFetch/);
    assert.match(fix, /Open no pull request/);
    assert.match(fix, /prevented_by/);
    assert.match(fix, /Signed-off-by: Roger Bucks/);
  });
});
