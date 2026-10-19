#!/usr/bin/env node
// The changelog of a release (spec §41, lib_github_release). It says what changed since the last release:
// - each pull request merged into main since then, by number and title;
// - what the library's interface added, and what it changed or removed (from public-api.json).
//
// The release workflow puts it at the top of the release's notes.
//
// Usage:
//   node scripts/changelog.mjs --out FILE     writes the changelog since the last release, at the manifest's version.
//   node scripts/changelog.mjs --check FILE   exits 1 when release notes have no Library changes section.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakingChanges, declarationAt, lastRelease, readInterface } from './public-api.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MERGE = /^Merge pull request #(\d+) from /;
export const LIBRARY = '### Library changes';
// The version rule, said in every release's notes, so a user knows a minor step may break things before 1.0.0.
export const RULE =
  'Before 1.0.0, a step in the leftmost part that is not 0, such as 0.7 to 0.8, may change or remove what the library exports.';

// The pull requests merged into the current branch since `from` (a tag or a commit), oldest first: [{number, title}].
// GitHub writes a merge commit's subject as "Merge pull request #N from …" and puts the title on its first body line.
export function pullRequests(root, from) {
  const range = from ? [`${from}..HEAD`] : ['HEAD'];
  const log = execFileSync(
    'git',
    ['log', '--merges', '--first-parent', '--reverse', '--format=%s%x1f%b%x1e', ...range],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  return log
    .split('\x1e')
    .map((entry) => entry.trim().split('\x1f'))
    .map(([subject = '', body = '']) => ({ match: MERGE.exec(subject), body }))
    .filter(({ match }) => match)
    .map(({ match, body }) => ({
      number: Number(match[1]),
      title:
        body
          .split('\n')
          .find((line) => line.trim())
          ?.trim() ?? '',
    }));
}

// The exports added from `before` to `after`, as `entry name` text in each package.
function added(before, after) {
  const names = [];
  for (const [pkg, { entries }] of Object.entries(after))
    for (const [entry, exports] of Object.entries(entries))
      for (const name of Object.keys(exports))
        if (!before?.[pkg]?.entries?.[entry]?.[name]) names.push({ pkg, entry, name });
  return names;
}

const where = ({ pkg, entry, name }) => `${pkg}${entry === '.' ? '' : `/${entry.replace(/^\.\//, '')}`}: \`${name}\``;

// The changelog's text: a heading, the pull requests, and the library's changes with the version rule.
export function changelogText({ version, from, pulls, repo, before, after }) {
  const lines = [`## ${version}`, ''];
  lines.push(from ? `Changes since ${from}.` : 'The first release.', '', '### Pull requests', '');
  if (pulls.length === 0) lines.push('No pull requests were merged.');
  for (const { number, title } of pulls)
    lines.push(`- [#${number}](https://github.com/${repo}/pull/${number}) ${title}`);
  lines.push('', LIBRARY, '', RULE, '');
  if (!before) {
    lines.push(
      'This is the first release with a declared interface (public-api.json), so there is nothing to compare.',
    );
    return `${lines.join('\n')}\n`;
  }
  const more = added(before, after);
  const broken = [...new Map(breakingChanges(before, after).map((change) => [where(change), change])).keys()];
  if (more.length === 0 && broken.length === 0) lines.push('Nothing was added, changed or removed.');
  if (more.length) lines.push('Added:', '', ...more.map((change) => `- ${where(change)}`), '');
  if (broken.length) lines.push('Changed or removed (a breaking change):', '', ...broken.map((text) => `- ${text}`));
  return `${lines.join('\n').trimEnd()}\n`;
}

/** Whether release notes hold the Library changes section, as a line of its own. */
export const hasLibraryChanges = (notes) => notes.split('\n').some((line) => line.trim() === LIBRARY);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const checking = process.argv.indexOf('--check');
  if (checking !== -1 && process.argv[checking + 1]) {
    if (hasLibraryChanges(readFileSync(process.argv[checking + 1], 'utf8'))) process.exit(0);
    console.error(`changelog: the release notes have no "${LIBRARY}" section, so users would not hear what changed`);
    process.exit(1);
  }
  const at = process.argv.indexOf('--out');
  if (at === -1 || !process.argv[at + 1]) {
    console.error('usage: node scripts/changelog.mjs --out FILE | --check FILE');
    process.exit(2);
  }
  const { version } = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const from = lastRelease(ROOT);
  const text = changelogText({
    version,
    from,
    pulls: pullRequests(ROOT, from),
    repo: process.env.GITHUB_REPOSITORY || 'rogerbucks/thoughtknot',
    before: from ? declarationAt(from, ROOT) : null,
    after: readInterface(ROOT),
  });
  writeFileSync(process.argv[at + 1], text);
  console.log(`changelog: wrote the changes since ${from ?? 'the start'}`);
}
