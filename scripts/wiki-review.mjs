#!/usr/bin/env node
// Reviews the wiki pages people write or edit (spec §41, wiki_reviewed): the wiki is made from the repository
// (scripts/wiki.mjs), but anyone with access may also edit it. Such a page is never changed here. Each is checked and
// every suggestion is written up for the "Wiki review" issue that .github/workflows/wiki.yml keeps: a link to a page
// or a repository file that is not there, a picture that is missing, a version older than the current one, or a
// sentence too long to read easily. A person's edit to a page the wiki makes is reported too, as the next run
// replaces it: the change belongs in the repository. Plain text only: it reads the wiki and the repository, nothing more.
//
// Usage:
//   node scripts/wiki-review.mjs --wiki DIR --out FILE
// DIR is a clone of the wiki with its history. FILE gets the issue's body in Markdown, or is left empty when nothing
// needs saying.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MADE_PAGES } from './wiki.mjs';
import { SHOTS } from './wiki-screens.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/rogerbucks/graph-note';
/** The account the wiki workflow commits as: a page whose last change is by anyone else was edited by a person. */
export const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';
/** The longest sentence a page should have, in words, as the user guide is held to (test/wiki-guide.test.js). */
export const LONGEST_SENTENCE = 40;

/** Every page and picture the wiki workflow writes, by its path in the wiki. */
export function madePaths(root = ROOT) {
  const copied = readdirSync(join(root, 'wiki')).filter((f) => f.endsWith('.md'));
  return new Set([...MADE_PAGES, ...copied, ...SHOTS.map((s) => `images/${s.name}.png`)]);
}

/** Text safe to put in the issue: no mention or reference pings anyone, and no line can break out of its code span. */
export const quiet = (text) =>
  String(text)
    .replace(/[`\r\n]+/g, ' ')
    .replace(/@/g, '@\u200b')
    .replace(/#(\d)/g, '#\u200b$1')
    .slice(0, 120);

/**
 * The suggestions for one page written by a person: [{line, text}]. `pages` is the set of the wiki's page names
 * (without .md), `files` the wiki's other files by path, `exists` says whether a path is in the repository, and
 * `version` is the current version.
 */
export function checkPage(text, { pages, files, exists, version }) {
  const found = [];
  const lines = text.split('\n');
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) return;
    const at = i + 1;
    for (const m of line.matchAll(/(!?)\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
      const [, image, target] = m;
      const repoFile = target.match(/^https:\/\/github\.com\/rogerbucks\/graph-note\/(?:blob|tree)\/main\/([^#?]+)/);
      if (repoFile && !exists(decodeURIComponent(repoFile[1])))
        found.push({ line: at, text: `links to \`${quiet(repoFile[1])}\`, which is not in the repository on main` });
      else if (/^[a-z]+:|^#|^mailto:/i.test(target)) continue;
      else if (image || /\.(png|jpe?g|gif|svg|webp)$/i.test(target)) {
        if (!files.has(decodeURIComponent(target).replace(/^\.?\//, '')))
          found.push({ line: at, text: `shows the picture \`${quiet(target)}\`, which is not in the wiki` });
      } else {
        const page = decodeURIComponent(target.split('#')[0]).replace(/\.md$/, '');
        if (page && !pages.has(page))
          found.push({ line: at, text: `links to the page \`${quiet(page)}\`, which does not exist` });
      }
    }
    for (const m of line.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
      const page = m[1].trim().replace(/ /g, '-');
      if (!pages.has(page) && !files.has(m[1].trim()))
        found.push({ line: at, text: `links to the page \`${quiet(m[1])}\`, which does not exist` });
    }
    for (const m of line.matchAll(/\bversion\s+v?(\d+\.\d+\.\d+)\b/gi))
      if (older(m[1], version))
        found.push({ line: at, text: `says version ${m[1]}; the current version is ${version}` });
    if (!/^\s*(\||#|<)/.test(line))
      for (const sentence of line.split(/(?<=[.!?])\s+/)) {
        const words = sentence
          .replace(/\([^)]*\)|`[^`]*`/g, 'x')
          .split(/\s+/)
          .filter(Boolean).length;
        if (words > LONGEST_SENTENCE)
          found.push({
            line: at,
            text: `has a sentence of ${words} words; one under ${LONGEST_SENTENCE} reads more easily`,
          });
      }
  });
  if (!text.trim()) found.push({ line: 1, text: 'is empty' });
  return found;
}

/** Whether version a comes before version b. */
const older = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};

/** The last commit to a file of the wiki: {sha, email, name}, or null for a file git does not know. */
function lastChange(wiki, path) {
  const out = execFileSync('git', ['-C', wiki, 'log', '-1', '--format=%H%x00%ae%x00%an', '--', path], {
    encoding: 'utf8',
  }).trim();
  if (!out) return null;
  const [sha, email, name] = out.split('\0');
  return { sha, email, name };
}

/** Every file of the wiki, by its path, the .git folder left out. */
function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name === '.git'
      ? []
      : e.isDirectory()
        ? walk(join(dir, e.name), base)
        : [relative(base, join(dir, e.name)).split('\\').join('/')],
  );
}

/**
 * The issue's body for a wiki: one section for each page made here that a person changed, then one for each page a
 * person wrote with its suggestions. Empty when there is nothing to say. `changes` gives the last change to a path.
 */
export function review({ files, read, changes, made, exists, version }) {
  const pages = new Set(files.filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')));
  const others = new Set(files);
  const edited = [];
  const written = [];
  for (const path of files.filter((f) => f.endsWith('.md')).sort()) {
    const change = changes(path);
    if (!change || change.email === BOT_EMAIL) continue;
    const page = path.replace(/\.md$/, '');
    const by = quiet(change.name);
    const commit = `[${change.sha.slice(0, 7)}](${REPO}/wiki/_compare/${change.sha})`;
    if (made.has(path)) {
      const source = existsSync(join(ROOT, 'wiki', path)) ? `\`wiki/${path}\`` : 'the repository file it is made from';
      edited.push(
        `- [ ] **[${page}](${REPO}/wiki/${encodeURIComponent(page)})**, changed by ${by} (${commit}). This page is made ` +
          `from the repository, so the next run replaces the change. To keep it, make it in ${source} instead.`,
      );
      continue;
    }
    const found = checkPage(read(path), { pages, files: others, exists, version });
    if (found.length)
      written.push(
        `#### [${page}](${REPO}/wiki/${encodeURIComponent(page)}), last changed by ${by} (${commit})\n\n` +
          found.map((f) => `- [ ] Line ${f.line} ${f.text}.`).join('\n'),
      );
  }
  if (!edited.length && !written.length) return '';
  return [
    'The wiki run checks every page people write or edit, and never changes those pages itself. ' +
      'These are its suggestions. The list is rewritten on each run, so a fixed item drops off by itself.',
    ...(edited.length ? ['### Changes to pages the wiki makes', edited.join('\n')] : []),
    ...(written.length ? ['### Suggestions for pages people wrote', written.join('\n\n')] : []),
  ].join('\n\n');
}

/** The value of a flag, or undefined. */
const flag = (args, name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const wiki = flag(args, '--wiki');
  const out = flag(args, '--out');
  if (!wiki || !out) throw new Error('give the wiki clone and the file to write: --wiki DIR --out FILE');
  const versions = JSON.parse(readFileSync(join(ROOT, 'versions.json'), 'utf8'));
  const body = review({
    files: walk(wiki),
    read: (path) => readFileSync(join(wiki, path), 'utf8'),
    changes: (path) => lastChange(wiki, path),
    made: madePaths(),
    exists: (path) => existsSync(join(ROOT, path)),
    version: Object.keys(versions).at(-1),
  });
  writeFileSync(out, body);
  console.log(body ? `wrote the review to ${out}` : 'nothing to suggest');
}
