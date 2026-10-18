// The project's home page (spec §41, landing_page):
// - Made from site/index.html and its catalogue of words, every word used and none missing.
// - The search and AI basics: title, description, canonical address, structured data, sitemap, robots and llms.txt.
// - WCAG 2.2 AA in the light and the dark scheme, by the same check as every other page.
// - No side said by left or right, so it mirrors for a right-to-left language.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { THEMES, audit, openWindow, pageStyleFor } from './repository/wcag.js';
import { path, read, readJSON } from './repository/repo.js';
import { SITE_URL, fillTemplate, latestVersion, pngSize, renderSite } from '../scripts/site.mjs';

const template = read('site/index.html');
const catalogue = readJSON('site/words.json');
const IMAGE = { file: 'card.png', alt: 'A graph drawn in a note, with its toolbar above it', width: 800, height: 500 };
const made = (more = {}) =>
  renderSite({ template, catalogue, version: '0.6.0', sha: 'abc1234', today: '2026-10-18', image: IMAGE, ...more });
const pageOf = (html) => openWindow(html).window.document;

describe('the page is made from its template and its words', () => {
  test('fills every word and value, and leaves no placeholder', () => {
    const html = made()['index.html'];
    assert.doesNotMatch(html, /\{\{|\}\}/);
    assert.match(html, /<h1 id="hero-title">Draw the graphs you write in your notes<\/h1>/);
    assert.match(html, /Latest release: 0\.6\.0/);
    assert.match(html, /Made from commit abc1234 on 2026-10-18\./);
  });

  test('refuses a word the catalogue lacks, and a word nothing uses', () => {
    assert.throws(() => fillTemplate('<p>{{no.such}}</p>', {}, {}), /no\.such/);
    assert.throws(() => fillTemplate('<p>{{a.b}}</p>', { 'a.b': 'x', 'c.d': 'y' }, {}), /not used by the page: c\.d/);
    assert.throws(() => fillTemplate('<p>{{@nothing}}</p>', {}, {}), /@nothing/);
  });

  test('escapes what it fills in, so a word is text and never markup', () => {
    assert.equal(
      fillTemplate('<p title="{{a.b}}">{{a.b}}</p>', { 'a.b': '<b>"x" & y</b>' }, {}),
      '<p title="&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;">&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;</p>',
    );
  });

  test('takes its language and direction from the catalogue, so a right-to-left one reads right to left', () => {
    assert.match(made()['index.html'], /<html lang="en-GB" dir="ltr">/);
    const arabic = { ...catalogue, language: 'ar' };
    assert.match(made({ catalogue: arabic })['index.html'], /<html lang="ar" dir="rtl">/);
  });
});

describe('search engines and AI assistants can find and read it', () => {
  const html = made()['index.html'];
  const doc = pageOf(html);
  const meta = (sel) => doc.querySelector(sel)?.getAttribute('content');

  test('lives at the project’s own domain, thoughtknot.app', () => {
    assert.equal(SITE_URL, 'https://thoughtknot.app/');
  });

  test('has a short title and description, a canonical address and the sharing cards', () => {
    assert.ok(doc.title.length <= 60, doc.title);
    const description = meta('meta[name="description"]');
    assert.ok(description.length >= 70 && description.length <= 160, `${description.length}: ${description}`);
    assert.equal(doc.querySelector('link[rel="canonical"]').href, SITE_URL);
    assert.equal(meta('meta[property="og:url"]'), SITE_URL);
    assert.equal(meta('meta[property="og:title"]'), doc.title);
    assert.equal(meta('meta[property="og:image"]'), `${SITE_URL}card.png`);
    assert.equal(meta('meta[property="og:image:alt"]'), IMAGE.alt);
    assert.equal(doc.querySelectorAll('h1').length, 1);
  });

  test('describes the software as structured data', () => {
    const data = JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent);
    assert.equal(data['@context'], 'https://schema.org');
    assert.equal(data['@type'], 'SoftwareApplication');
    assert.equal(data.name, 'ThoughtKnot');
    assert.equal(data.url, SITE_URL);
    assert.equal(data.softwareVersion, '0.6.0');
    assert.equal(data.license, 'https://www.mozilla.org/en-US/MPL/2.0/');
    assert.equal(data.codeRepository, 'https://github.com/rogerbucks/thoughtknot');
    assert.equal(data.offers.price, '0');
    assert.equal(data.description, meta('meta[name="description"]'));
  });

  test('a mark-up character in a word cannot end the structured data early', () => {
    const words = { ...catalogue.words, 'page.description': 'x </script><script>alert(1)</script>' };
    const text = made({ catalogue: { ...catalogue, words } })['index.html'];
    assert.equal(text.match(/<\/script>/g).length, 1);
  });

  test('has a robots file, a sitemap and an llms.txt, each at the canonical address', () => {
    const files = made();
    assert.match(files['robots.txt'], /^User-agent: \*\nAllow: \/\n/m);
    assert.ok(files['robots.txt'].split('\n').includes(`Sitemap: ${SITE_URL}sitemap.xml`));
    assert.ok(files['sitemap.xml'].includes(`<loc>${SITE_URL}</loc>\n    <lastmod>2026-10-18</lastmod>`));
    const llms = files['llms.txt'];
    assert.match(llms, /^# ThoughtKnot\n\n> Free, open-source Obsidian plugin/);
    assert.match(
      llms,
      /\n## Docs\n\n- \[How to use ThoughtKnot\]\(https:\/\/github\.com\/rogerbucks\/thoughtknot\/wiki\/How-to-use-ThoughtKnot\)/,
    );
    assert.equal(files['.nojekyll'], '');
  });

  test('another address, such as a domain of its own, is used everywhere', () => {
    const url = 'https://thoughtknot.example.org/';
    const files = made({ url });
    assert.match(files['index.html'], /<link rel="canonical" href="https:\/\/thoughtknot\.example\.org\/" \/>/);
    assert.match(files['robots.txt'], /Sitemap: https:\/\/thoughtknot\.example\.org\/sitemap\.xml/);
    assert.doesNotMatch(Object.values(files).join('\n'), /rogerbucks\.github\.io/);
  });

  test('shows the picture only when there is one', () => {
    const doc2 = pageOf(made({ image: null })['index.html']);
    assert.equal(doc2.querySelector('figure'), null);
    assert.equal(doc2.querySelector('meta[property="og:image"]'), null);
    const img = doc.querySelector('figure img');
    assert.equal(img.getAttribute('alt'), IMAGE.alt);
    assert.equal(img.getAttribute('width'), '800');
  });
});

describe('the version it names', () => {
  const releases = [
    { tagName: '0.5.0', publishedAt: '2026-10-10T10:00:00Z', isPrerelease: false },
    { tagName: '0.6.0', publishedAt: '2026-10-17T10:00:00Z', isPrerelease: false },
    { tagName: '0.6.1-nightly.20261018', publishedAt: '2026-10-18T16:00:00Z', isPrerelease: true },
  ];

  test('is the newest stable release, never a nightly', () => {
    assert.equal(latestVersion(releases, '0.0.1'), '0.6.0');
  });

  test('is the manifest’s when there is no release', () => {
    assert.equal(latestVersion([], '0.4.2'), '0.4.2');
  });
});

describe('everyone can use it', () => {
  const sheet = read('site/site.css');

  for (const theme of THEMES)
    test(`meets WCAG 2.2 AA in the ${theme} scheme`, async () => {
      const { style, variables } = pageStyleFor(sheet, theme);
      const html = made()['index.html'].replace('<link rel="stylesheet" href="site.css" />', `<style>${style}</style>`);
      const r = await audit(openWindow(html), theme, variables['--page']);
      assert.ok(r.rules > 10, `${r.rules} rules ran`);
      assert.deepEqual(r.problems, []);
    });

  test('a planted fault is found, so a pass means the check looked', async () => {
    const { style, variables } = pageStyleFor(sheet, 'light');
    const html = made()
      ['index.html'].replace('<link rel="stylesheet" href="site.css" />', `<style>${style}</style>`)
      .replace(/ alt="A graph[^"]*"/, '');
    const r = await audit(openWindow(html), 'light', variables['--page']);
    assert.match(r.problems.join('\n'), /image-alt/);
  });

  test('can be reached by the keyboard: a skip link first, to the main content', () => {
    const doc = pageOf(made()['index.html']);
    const first = doc.querySelector('body a');
    assert.equal(first.getAttribute('href'), '#content');
    assert.equal(doc.querySelector('main').id, 'content');
    assert.match(sheet, /a:focus-visible\s*\{[^}]*outline: 3px solid/);
  });

  test('says no side by left or right, so it mirrors for a right-to-left language', () => {
    const physical =
      /^\s*((?:margin|padding|border)-(?:left|right)(?:-[a-z]+)?|left|right|float|clear|text-align)\s*:\s*([^;]+);/;
    const found = sheet
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => physical.test(l))
      .filter((l) => !/^\s*(text-align|float|clear)/.test(l) || /\b(left|right)\b/.test(l));
    assert.deepEqual(found, []);
  });
});

/** The start of a PNG file: its signature and the header that gives its size. */
function aPng(width, height) {
  const head = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write('IHDR', 12, 'latin1');
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  return head;
}

describe('the command', () => {
  test('reads a picture’s size from its header, and refuses a file that is not a PNG', () => {
    assert.deepEqual(pngSize(aPng(1322, 894)), { width: 1322, height: 894 });
    assert.throws(() => pngSize(Buffer.from('not a picture at all, not even close')), /not a PNG/);
  });

  test('writes the page, its files and the picture it is given', () => {
    const out = mkdtempSync(join(tmpdir(), 'site-'));
    const images = mkdtempSync(join(tmpdir(), 'site-images-'));
    try {
      writeFileSync(join(images, 'card.png'), aPng(640, 400));
      const releases = join(images, 'releases.json');
      writeFileSync(releases, JSON.stringify([{ tagName: '1.2.3', publishedAt: '2026-10-17T00:00:00Z' }]));
      const r = spawnSync(
        process.execPath,
        [
          path('scripts/site.mjs'),
          '--out',
          out,
          '--sha',
          'abc1234',
          '--date',
          '2026-10-18',
          '--releases',
          releases,
          '--images',
          images,
        ],
        { encoding: 'utf8' },
      );
      assert.equal(r.status, 0, r.stderr);
      for (const f of [
        'index.html',
        'site.css',
        'icon.svg',
        'card.png',
        'robots.txt',
        'sitemap.xml',
        'llms.txt',
        '.nojekyll',
      ])
        assert.ok(existsSync(join(out, f)), f);
      const page = readFileSync(join(out, 'index.html'), 'utf8');
      assert.match(page, /Latest release: 1\.2\.3/);
      assert.match(page, /<img src="card\.png" alt="A graph drawn in a note[^"]*" width="640" height="400" \/>/);
    } finally {
      rmSync(out, { recursive: true, force: true });
      rmSync(images, { recursive: true, force: true });
    }
  });
});
