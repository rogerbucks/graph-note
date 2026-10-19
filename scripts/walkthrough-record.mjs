#!/usr/bin/env node
// The record of the accessibility walk-through, one for each stable release (spec §11, walkthrough_recorded; UX-1).
// RELEASING.md holds the checks, AX-01 to AX-21. A person walks them by hand on the build in every host and theme.
// They write what they found in test/walkthroughs/<version>.md. The release and its dry run run `--release`, which
// fails while that record is missing or not whole.
//
//   node scripts/walkthrough-record.mjs --new [version]      writes an empty record to fill in
//   node scripts/walkthrough-record.mjs --release [version]  fails unless the record is whole
//
// The version is manifest.json's when none is given: the one the release builds.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The hosts walked, as RELEASING.md names them. A host added later is added here in the same pull request. */
export const HOSTS = ['Obsidian on a desktop', 'Obsidian on a phone', "the browser editor's page"];

/** The themes each host is walked in. */
export const THEMES = ['light', 'dark'];

/** The ids of the checks RELEASING.md holds, such as AX-01, in the order it lists them. */
export function checkIds(releasing) {
  return [...releasing.matchAll(/\*\*(AX-\d\d)\*\*/g)].map((m) => m[1]);
}

/** Where the record of `version` is kept, from the repository's root. */
export const recordPath = (version) => `test/walkthroughs/${version}.md`;

/** The heading of one host in one theme. */
const part = (host, theme) => `${host} · ${theme}`;

/** An empty record of `version`: every check unticked, for a person to walk and fill in. */
export function template(version, ids, { commit, date }) {
  const head = [
    `# Accessibility walk-through: ${version}`,
    '',
    'Walk each check in RELEASING.md on this build. Tick it, or leave it unticked with the reason after it:',
    '`- [ ] AX-05 — fails: Escape leaves the focus on the page; stays because …`.',
    '',
    `- Build: ${version} (${commit})`,
    `- Date: ${date}`,
    '- By: ',
  ];
  const parts = HOSTS.flatMap((host) =>
    THEMES.flatMap((theme) => ['', `## ${part(host, theme)}`, '', ...ids.map((id) => `- [ ] ${id}`)]),
  );
  return [...head, ...parts, ''].join('\n');
}

/** What is wrong with a record, one line each; nothing when it is whole. */
export function checkRecord(text, { ids, version }) {
  const out = [];
  const field = (name) => new RegExp(`^- ${name}:[ \\t]*(.*)$`, 'm').exec(text)?.[1].trim() ?? '';
  const build = field('Build');
  if (!new RegExp(`^${version.replace(/\./g, '\\.')}(\\s|$)`).test(build))
    out.push(`the build walked is "${build}", not ${version}: walk the build to be released`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(field('Date'))) out.push('give the day it was walked, as YYYY-MM-DD');
  if (!field('By')) out.push('say who walked it, after "- By:"');

  const sections = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      current = heading[1].trim();
      sections.set(current, []);
    } else if (current && /^- \[[ xX]\]/.test(line)) sections.get(current).push(line);
  }
  for (const host of HOSTS)
    for (const theme of THEMES) {
      const name = part(host, theme);
      const lines = sections.get(name);
      if (!lines) {
        out.push(`${name} is not walked: add its part, with every check`);
        continue;
      }
      for (const id of ids) {
        const line = lines.find((l) => new RegExp(`^- \\[[ xX]\\] ${id}(\\s|$)`).test(l));
        if (!line) out.push(`${name}: ${id} is missing`);
        else if (/^- \[ \]/.test(line) && !/ — \S.{3,}/.test(line))
          out.push(`${name}: ${id} is not ticked, and no reason is written after it`);
      }
      for (const line of lines) {
        const id = /^- \[[ xX]\] (\S+)/.exec(line)?.[1];
        if (id && !ids.includes(id)) out.push(`${name}: ${id} is not a check RELEASING.md holds`);
      }
    }
  return out;
}

/** The version manifest.json gives: the one the release builds. */
const manifestVersion = () => JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')).version;

function main(args) {
  const [mode, given] = args;
  const version = given ?? manifestVersion();
  const ids = checkIds(readFileSync(join(ROOT, 'RELEASING.md'), 'utf8'));
  const file = join(ROOT, recordPath(version));
  if (mode === '--new') {
    if (existsSync(file)) {
      console.error(`${recordPath(version)} is already there: fill it in, or remove it first`);
      return 1;
    }
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const date = new Date().toISOString().slice(0, 10);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, template(version, ids, { commit, date }));
    console.log(`wrote ${recordPath(version)}: walk each check, then tick it or write its reason`);
    return 0;
  }
  if (mode === '--release') {
    if (!existsSync(file)) {
      console.error(
        `no walk-through recorded for ${version}: run node scripts/walkthrough-record.mjs --new ${version}, ` +
          'walk the build as RELEASING.md says, and commit the record',
      );
      return 1;
    }
    const problems = checkRecord(readFileSync(file, 'utf8'), { ids, version });
    for (const p of problems) console.error(`${recordPath(version)}: ${p}`);
    if (!problems.length) console.log(`${recordPath(version)}: every check walked, in every host and theme`);
    return problems.length ? 1 : 0;
  }
  console.error('use --new [version] or --release [version]');
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
