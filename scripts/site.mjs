#!/usr/bin/env node
// Makes the project's home page from the repository (spec §41, landing_page): site/index.html filled with the words of
// site/words.json, the version of the newest stable release and the commit it came from, with what search engines and
// AI assistants read beside it: structured data, a sitemap, a robots file and an llms.txt. The picture is the user
// guide's own, taken by scripts/wiki-screens.mjs. .github/workflows/pages.yml runs it and publishes the folder.
//
// Usage:
//   node scripts/site.mjs --out DIR [--sha SHA] [--date YYYY-MM-DD] [--releases FILE] [--images DIR] [--url URL]
// --releases is `gh release list --json tagName,publishedAt,isPrerelease` saved to a file; without it the version is
// the manifest's. --images is the folder scripts/wiki-screens.mjs wrote: its card.png is shown when it is there. --url
// is the page's address, for a domain of its own; GitHub Pages' address is the default.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS } from './wiki-screens.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/rogerbucks/graph-note';
const WIKI = `${REPO}/wiki`;
const LICENCE = 'https://www.mozilla.org/en-US/MPL/2.0/';

/** The page's address on GitHub Pages, used when no other is given. */
export const SITE_URL = 'https://rogerbucks.github.io/graph-note/';

/** The languages written right to left, by their primary code. */
const RIGHT_TO_LEFT = new Set(['ar', 'dv', 'fa', 'he', 'ps', 'ur', 'yi']);

/** The guide's picture the page shows, by its name in scripts/wiki-screens.mjs. */
const PICTURE = 'card';

/** A PNG's width and height, from its header, so the page keeps the picture's place before it loads. */
export function pngSize(bytes) {
  if (bytes.length < 24 || bytes.toString('latin1', 12, 16) !== 'IHDR') throw new Error('not a PNG picture');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `text` with each {name} filled from `values`; a name `values` lacks is left as it is. */
const withPlaceholders = (text, values) =>
  text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(values, name) ? values[name] : whole));

/**
 * `template` with each {{key}} replaced by the word `words` gives it and each {{@name}} by `values[name]`, words escaped
 * as text. Values are markup the page makes itself and are put in as they are. Throws on a key or a name with nothing to
 * fill it, and on a word nothing uses, so the catalogue and the page never drift apart.
 */
export function fillTemplate(template, words, values) {
  const used = new Set();
  const filled = template.replace(/\{\{(@?)([\w.-]+)\}\}/g, (_whole, at, key) => {
    if (at) {
      if (!Object.hasOwn(values, key)) throw new Error(`the page names {{@${key}}}, which nothing fills`);
      return values[key];
    }
    if (!Object.hasOwn(words, key)) throw new Error(`the page names {{${key}}}, which the catalogue lacks`);
    used.add(key);
    return escapeHtml(words[key]);
  });
  const unused = Object.keys(words).filter((k) => !used.has(k));
  if (unused.length) throw new Error(`words not used by the page: ${unused.join(', ')}`);
  return filled;
}

/** The newest stable release's version from `gh release list` entries, never a pre-release; `fallback` if none. */
export function latestVersion(releases, fallback) {
  const stable = releases
    .filter((r) => !r.isPrerelease && /^v?\d+\.\d+\.\d+$/.test(r.tagName))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return stable.length ? stable[0].tagName.replace(/^v/, '') : fallback;
}

/** JSON for inside a <script>: no "<" can end the element early. */
const scriptJson = (data) => JSON.stringify(data, null, 2).replace(/</g, '\\u003c');

/** The structured data a search engine reads: the software, its version, its licence and its price. */
function structuredData({ description, url, version, image }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Graph Note',
    description,
    url,
    applicationCategory: 'ProductivityApplication',
    applicationSubCategory: 'Obsidian plugin',
    operatingSystem: 'Windows, macOS, Linux, iOS, Android',
    softwareVersion: version,
    license: LICENCE,
    codeRepository: REPO,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    ...(image ? { screenshot: `${url}${image.file}` } : {}),
  };
}

/** The llms.txt of llmstxt.org: what the project is, then where an assistant reads more. */
function llmsText({ words, url }) {
  return [
    '# Graph Note',
    '',
    `> ${words['page.description']}`,
    '',
    words['hero.lede'],
    '',
    '## Docs',
    '',
    `- [How to use Graph Note](${WIKI}/How-to-use-Graph-Note): the guide, in plain words, with pictures`,
    `- [Roadmap](${WIKI}/Roadmap): what is done and what comes next`,
    `- [Releases](${REPO}/releases): the plugin's files and both libraries, for each version`,
    `- [Source code](${REPO}): the plugin, the core and the graph format libraries in JavaScript and Python`,
    '',
    '## Optional',
    '',
    `- [Home page](${url}): this page for people`,
    `- [Licence](${LICENCE}): Mozilla Public License 2.0`,
    '',
  ].join('\n');
}

/**
 * Every file of the site but the ones copied as they are, by name: the page, robots.txt, sitemap.xml, llms.txt and the
 * .nojekyll that tells GitHub Pages to publish the folder as it is. `catalogue` is site/words.json; `image` is
 * {file, alt, width, height} or null.
 */
export function renderSite({ template, catalogue, version, sha, today, url = SITE_URL, image = null }) {
  const lang = catalogue.language;
  const words = Object.fromEntries(
    Object.entries(catalogue.words).map(([k, w]) => [k, withPlaceholders(w, { version, sha, date: today })]),
  );
  const description = words['page.description'];
  const values = {
    lang: escapeHtml(lang),
    dir: RIGHT_TO_LEFT.has(lang.split('-')[0]) ? 'rtl' : 'ltr',
    locale: escapeHtml(lang.replace('-', '_')),
    url: escapeHtml(url),
    repo: REPO,
    wiki: WIKI,
    'structured-data': scriptJson(structuredData({ description, url, version, image })),
    'image-meta': image
      ? `<meta property="og:image" content="${escapeHtml(url + image.file)}" />\n    <meta property="og:image:alt" content="${escapeHtml(image.alt)}" />`
      : '',
    'image-figure': image
      ? `<figure class="shot"><img src="${escapeHtml(image.file)}" alt="${escapeHtml(image.alt)}" width="${image.width}" height="${image.height}" /></figure>`
      : '',
  };
  return {
    'index.html': fillTemplate(template, words, values),
    'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${url}sitemap.xml\n`,
    'sitemap.xml': [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      `  <url>\n    <loc>${escapeHtml(url)}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`,
      '</urlset>',
      '',
    ].join('\n'),
    'llms.txt': llmsText({ words, url }),
    '.nojekyll': '',
  };
}

const flag = (args, name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const out = flag(args, '--out');
  if (!out) throw new Error('give the folder for the site: --out DIR');
  const json = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
  const releasesFile = flag(args, '--releases');
  const releases = releasesFile ? JSON.parse(readFileSync(releasesFile, 'utf8')) : [];
  const images = flag(args, '--images');
  const picture = images && join(images, `${PICTURE}.png`);
  const shown = picture && existsSync(picture);
  const files = renderSite({
    template: readFileSync(join(ROOT, 'site/index.html'), 'utf8'),
    catalogue: json('site/words.json'),
    version: latestVersion(releases, json('manifest.json').version),
    sha: (flag(args, '--sha') ?? 'main').slice(0, 7),
    today: flag(args, '--date') ?? new Date().toISOString().slice(0, 10),
    url: flag(args, '--url') ?? SITE_URL,
    image: shown
      ? { file: `${PICTURE}.png`, alt: SHOTS.find((s) => s.name === PICTURE).alt, ...pngSize(readFileSync(picture)) }
      : null,
  });
  mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(out, name), text);
  for (const name of ['site.css', 'icon.svg']) copyFileSync(join(ROOT, 'site', name), join(out, name));
  if (shown) copyFileSync(picture, join(out, `${PICTURE}.png`));
}
