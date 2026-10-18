// The workflow that publishes the home page (spec §41, landing_page). Checked here:
// - What wakes it.
// - The job running the repository's code only reads.
// - The one job that may write to GitHub Pages runs no code of the repository, only GitHub's deploy action.
// Read as text, by indentation, as policy.test.js reads the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, jobs, permissionValues, read, runCommands, stripComment, usesRefs } from './repository/repo.js';

const PAGES = '.github/workflows/pages.yml';
const text = read(PAGES);
const lines = text.split('\n');
const given = (job) =>
  block(jobs(text)[job], 'permissions', 4)
    .slice(1)
    .map((l) => stripComment(l).trim())
    .filter(Boolean);

describe('the workflow that publishes the home page', () => {
  test('is woken by a push to main, each morning and by hand, never by a pull request', () => {
    const on = block(lines, 'on', 0).join('\n');
    assert.match(on, /push:\s*\n\s*branches: \[main\]/);
    assert.match(on, /schedule:\s*\n\s*- cron: '30 6 \* \* \*'/);
    assert.match(on, /workflow_dispatch:/);
    assert.doesNotMatch(on, /pull_request|workflow_run/);
  });

  test('makes the page with read access only, from main, keeping no credentials', () => {
    assert.deepEqual(permissionValues(block(lines, 'permissions', 0)), ['read']);
    assert.deepEqual(Object.keys(jobs(text)), ['make', 'publish']);
    assert.deepEqual(given('make'), ['contents: read']);
    const make = jobs(text).make.join('\n');
    assert.match(make, /ref: main\s*\n\s*persist-credentials: false/);
    const runs = runCommands(make);
    const at = (re) => runs.findIndex((r) => re.test(r));
    assert.ok(at(/^npm ci$/) >= 0, 'npm ci');
    assert.ok(at(/^npm audit signatures$/) > at(/^npm ci$/), 'signatures after the install');
    assert.ok(at(/node scripts\/site\.mjs --out site-out/) > at(/^npm audit signatures$/), 'the page after both');
    assert.match(make, /uses: actions\/upload-pages-artifact@[0-9a-f]{40} # v\d/);
    assert.match(make, /path: site-out/);
  });

  test('publishes a page with no picture rather than none, saying so', () => {
    const shot = runCommands(jobs(text).make.join('\n')).find((r) => /wiki-screens\.mjs/.test(r));
    assert.match(shot, /\|\| echo "::warning::/);
  });

  test('publishes with Pages access alone, running no code of the repository', () => {
    const publish = jobs(text).publish;
    assert.deepEqual([...given('publish')].sort(), ['id-token: write', 'pages: write']);
    assert.match(publish.join('\n'), /needs: make/);
    assert.match(publish.join('\n'), /environment:\s*\n\s*name: github-pages/);
    assert.deepEqual(
      usesRefs(publish.join('\n')).map((r) => r.split('@')[0]),
      ['actions/deploy-pages'],
    );
    assert.deepEqual(runCommands(publish.join('\n')), []);
  });

  test('runs one publish at a time and never cancels one', () => {
    assert.match(text, /concurrency:\s*\n\s*group: pages\s*\n\s*cancel-in-progress: false/);
  });
});
