// The workflow that makes the wiki (spec §41, wiki_generated): what wakes it, that the job running the repository's
// code only reads, and that the one job that may write runs no code of the repository, only git. Read as text, by
// indentation, as policy.test.js reads the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, jobs, permissionValues, read, runCommands, stripComment, usesRefs } from './repository/repo.js';

const WIKI = '.github/workflows/wiki.yml';
const text = read(WIKI);
const lines = text.split('\n');
const given = (job) =>
  block(jobs(text)[job], 'permissions', 4)
    .slice(1)
    .map((l) => stripComment(l).trim())
    .filter(Boolean);

describe('the workflow that makes the wiki', () => {
  test('is woken by a push to main, a published stable release (never a pre-release) and an edit of the wiki, never by a pull request', () => {
    const on = block(lines, 'on', 0).join('\n');
    assert.match(on, /push:\s*\n\s*branches: \[main\]/);
    assert.match(on, /release:\s*\n\s*types: \[released\]/);
    assert.match(on, /gollum:/);
    assert.doesNotMatch(on, /pull_request|workflow_run/);
  });

  test('makes the pages with read access only, from main, keeping no credentials', () => {
    assert.deepEqual(permissionValues(block(lines, 'permissions', 0)), ['read']);
    assert.deepEqual(Object.keys(jobs(text)), ['make', 'review', 'report', 'publish']);
    assert.deepEqual(given('make'), ['contents: read']);
    assert.deepEqual(given('review'), ['contents: read']);
    assert.match(jobs(text).make.join('\n'), /ref: main\s*\n\s*persist-credentials: false/);
  });

  test('takes the screenshots and writes the pages with the repository’s own scripts', () => {
    const runs = runCommands(jobs(text).make.join('\n')).join('\n');
    assert.match(runs, /^npm ci$/m);
    assert.match(runs, /node scripts\/wiki-screens\.mjs --out wiki-out\/images/);
    assert.match(runs, /node scripts\/wiki\.mjs --out wiki-out --sha "\$GITHUB_SHA"/);
  });

  test('asks gh only for the release fields it offers, stable releases alone', () => {
    const runs = runCommands(jobs(text).make.join('\n')).join('\n');
    assert.match(runs, /gh release list .*--exclude-pre-releases --json tagName,name,publishedAt /);
  });

  test('says how to start the wiki when it has no pages yet: the review checks nothing, the publish stops', () => {
    const review = jobs(text).review.join('\n');
    assert.match(review, /if ! git clone .*\.wiki\.git/);
    assert.match(review, /::warning::The wiki has no pages yet/);
    const publish = jobs(text).publish.join('\n');
    assert.match(publish, /::error::The wiki has no pages yet.*first page/);
  });

  test('writes only in the publish job, which checks out nothing and runs no Node, npm or script of the repository', () => {
    assert.deepEqual(given('publish'), ['contents: write']);
    const publish = jobs(text).publish.join('\n');
    assert.deepEqual(
      usesRefs(publish).map((r) => r.split('@')[0]),
      ['actions/download-artifact'],
    );
    const runs = jobs(text).publish.map(stripComment).join('\n');
    assert.doesNotMatch(runs, /\b(node|npm|npx)\b|scripts\/|actions\/checkout|\.\/\S+\.sh/);
    assert.match(runs, /\.wiki\.git/);
    assert.match(runs, /git push/);
  });

  test('reviews the pages people edited on every run, and makes and publishes pages only on a push or a release', () => {
    assert.match(
      jobs(text).review.join('\n'),
      /node scripts\/wiki-review\.mjs --wiki "\$RUNNER_TEMP\/wiki" --out review-out\/review\.md/,
    );
    for (const job of ['make', 'publish']) assert.match(jobs(text)[job][0], /if: github\.event_name != 'gollum'/, job);
    assert.doesNotMatch(jobs(text).review.join('\n'), /\bif:/);
    assert.match(jobs(text).publish.join('\n'), /needs: \[make, review\]/);
  });

  test('keeps the review issue with no code of the repository: it may write issues alone, and only gh and the shell run', () => {
    assert.deepEqual(given('report'), ['issues: write']);
    const report = jobs(text).report.map(stripComment).join('\n');
    assert.deepEqual(
      usesRefs(report).map((r) => r.split('@')[0]),
      ['actions/download-artifact'],
    );
    assert.doesNotMatch(report, /\b(node|npm|npx)\b|scripts\/|actions\/checkout|\.\/\S+\.sh|git push/);
    assert.match(report, /--label wiki-review/);
    assert.match(report, /gh issue close/);
  });

  test('never deletes a page it did not make, and never pushes the list of button labels', () => {
    const publish = jobs(text).publish.join('\n');
    assert.doesNotMatch(publish, /--delete/);
    assert.match(publish, /--exclude images\/labels\.json/);
  });
});
