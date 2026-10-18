// The review of the wiki pages people write or edit (spec §41, wiki_reviewed): such a page is checked and never
// changed, a person's edit to a page the wiki makes is reported, and the issue's text can ping no one. Pure: the wiki
// is given as text, with no clone and no network.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_EMAIL, checkPage, madePaths, quiet, review } from '../scripts/wiki-review.mjs';

const context = {
  pages: new Set(['Home', 'Status', 'Team-notes']),
  files: new Set(['images/card.png', 'Home.md']),
  exists: (path) => path === 'README.md',
  version: '0.5.0',
};
const texts = (found) => found.map((f) => `${f.line} ${f.text}`);

describe('checking a page a person wrote', () => {
  test('passes a page whose links, pictures and versions are all good', () => {
    const page = [
      '# Notes',
      'See [Status](Status), [[Home]] and the [README](https://github.com/rogerbucks/graph-note/blob/main/README.md).',
      '![A card](images/card.png) We are on version 0.5.0. [Docs](https://example.org/x)',
    ].join('\n');
    assert.deepEqual(checkPage(page, context), []);
  });

  test('suggests a fix for a missing page, repository file or picture, naming the line', () => {
    const page = [
      'See [Roadmap](Roadmap) and [[Old Plans]].',
      'The [guide](https://github.com/rogerbucks/graph-note/blob/main/docs/gone.md).',
      '![Shot](images/missing.png)',
    ].join('\n');
    assert.deepEqual(texts(checkPage(page, context)), [
      '1 links to the page `Roadmap`, which does not exist',
      '1 links to the page `Old Plans`, which does not exist',
      '2 links to `docs/gone.md`, which is not in the repository on main',
      '3 shows the picture `images/missing.png`, which is not in the wiki',
    ]);
  });

  test('flags a version older than the current one, and a sentence too long, but nothing in a code block', () => {
    const long = `${'word '.repeat(45).trim()}.`;
    const page = ['This is version 0.4.2.', long, '```', '[x](Nowhere)', long, '```', 'Version 0.6.0 is next.'].join(
      '\n',
    );
    assert.deepEqual(texts(checkPage(page, context)), [
      '1 says version 0.4.2; the current version is 0.5.0',
      '2 has a sentence of 45 words; one under 40 reads more easily',
    ]);
  });

  test('says when a page is empty', () => {
    assert.deepEqual(texts(checkPage('  \n', context)), ['1 is empty']);
  });
});

describe('the review', () => {
  const person = { sha: 'abcdef1234567', email: 'someone@users.noreply.github.com', name: 'Ann' };
  const bot = { sha: '1234567abcdef', email: BOT_EMAIL, name: 'github-actions[bot]' };
  const run = (changes, read = () => 'See [Nowhere](Nowhere).') =>
    review({
      files: ['Home.md', 'Status.md', 'Team-notes.md', 'images/card.png'],
      read,
      changes: (path) => changes[path] ?? bot,
      made: new Set(['Home.md', 'Status.md', 'images/card.png']),
      exists: () => true,
      version: '0.5.0',
    });

  test('says nothing when every page was last changed by the workflow', () => {
    assert.equal(run({}), '');
  });

  test('lists a person’s page with its suggestions, and never checks a page the workflow wrote last', () => {
    const body = run({ 'Team-notes.md': person });
    assert.match(body, /Suggestions for pages people wrote/);
    assert.match(body, /\[Team-notes\]\(.+\/wiki\/Team-notes\), last changed by Ann/);
    assert.match(body, /- \[ \] Line 1 links to the page `Nowhere`, which does not exist\./);
    assert.doesNotMatch(body, /Changes to pages the wiki makes/);
  });

  test('reports a person’s edit to a page the wiki makes, as the next run replaces it, and says where to make it', () => {
    const body = run({ 'Home.md': person, 'Status.md': person });
    assert.match(body, /Changes to pages the wiki makes/);
    assert.match(body, /\*\*\[Home\]\(.+\)\*\*, changed by Ann .+ make it in `wiki\/Home\.md` instead/);
    assert.match(body, /\*\*\[Status\]\(.+\)\*\*, changed by Ann .+ make it in the repository file it is made from/);
    assert.doesNotMatch(body, /Line 1/, 'a made page is reported, not checked');
  });

  test('a person’s page with nothing to suggest is not listed', () => {
    assert.equal(
      run({ 'Team-notes.md': person }, () => 'All good.'),
      '',
    );
  });
});

describe('the issue text', () => {
  test('pings no one: no mention, no issue reference, no line break and no backtick from a page gets through', () => {
    assert.equal(quiet('@roger see #12\n`x`'), '@​roger see #​12 x ');
  });

  test('knows every page and picture the workflow writes', () => {
    const made = madePaths();
    for (const p of ['Status.md', '_Sidebar.md', 'How-to-use-Thoughtknot.md', 'Home.md', 'images/card.png'])
      assert.ok(made.has(p), p);
  });
});
