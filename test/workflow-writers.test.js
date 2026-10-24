// Which workflow jobs may write to the repository, and what else each may touch. Moved out of policy.test.js, which
// had reached the longest test file the quality check allows. Spec §13, Delivery.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, jobs, permissionValues, read, stripComment, workflowFiles } from './repository/repo.js';

describe('GitHub Actions writers', () => {
  test('only sixteen jobs may write: the release, the nightly, its draft check and its wave-end call, the lock, the build status comment, the mirror’s issues, the review, Sara’s two working group replies, the wiki, its review issue, the risk panel’s issue, the home page, the security issue and the security fixes', () => {
    for (const f of workflowFiles()) {
      for (const [name, lines] of Object.entries(jobs(read(f)))) {
        const perms = block(lines, 'permissions', 4);
        if (!perms || !permissionValues(perms).some((v) => /write/.test(v))) continue;
        // the three other writers may touch nothing else. One locks pull request conversations. One leaves the build
        // status comment on a pull request, with read access to what it reads (test/build-status-workflow.test.js)
        const given = perms
          .slice(1)
          .map((l) => stripComment(l).trim())
          .filter(Boolean);
        const release = f.endsWith('release.yml') && name === 'release';
        const lock = f.endsWith('lock-conversations.yml') && name === 'lock' && given.join() === 'pull-requests: write';
        const comment =
          f.endsWith('/build-status.yml') &&
          name === 'update' &&
          given.filter((l) => /write/.test(l)).join() === 'pull-requests: write';
        // each other writer is its workflow's one job, given exactly these permissions, sorted
        const only = (file, job, wanted) => f.endsWith(file) && name === job && [...given].sort().join() === wanted;
        // one mirrors the requirements into their issues on a push to main (test/github-project-workflow.test.js)
        const mirror = only('/project-mirror.yml', 'mirror', 'contents: read,issues: write');
        // Claude's review on a pull request, and Sara's replies in the working group discussion (their own tests)
        const review =
          only('/claude-review.yml', 'review', 'contents: read,pull-requests: write') ||
          (/\/working-group(-reply)?\.yml$/.test(f) && name === 'post' && given.join() === 'discussions: write');
        // the wiki, its review issue, the nightly and the home page run no repository code (their own tests say so)
        const wiki = only('/wiki.yml', 'publish', 'contents: write') || only('/wiki.yml', 'report', 'issues: write');
        const nightly =
          only('/nightly.yml', 'publish', 'contents: write') ||
          only('/nightly.yml', 'drafts', 'contents: write') ||
          // a wave's end calls the nightly, handing it the most its own jobs ask for (test/wave-nightly-workflow.test.js)
          only('/wave-nightly.yml', 'wave-nightly', 'contents: write,security-events: read');
        // the risk panel's issue, the security issue and Claude's security branches: security-workflow.test.js
        const panel = only('/risk-panel.yml', 'report', 'issues: write');
        const pages = only('/pages.yml', 'publish', 'id-token: write,pages: write');
        const security = f.endsWith('/security.yml') && ['report', 'fix'].includes(name);
        assert.ok(release || lock || comment || mirror || review || wiki || nightly || panel || pages || security, f);
      }
      assert.doesNotMatch(read(f), /write-all/, f);
    }
  });
});
