#!/usr/bin/env node
// Renames the product from Graph Note to ThoughtKnot across the tracked files: the name people read, the plugin and
// package ids, the CSS class and variable prefix, and the paths that hold the name. It is mechanical and safe to run
// again, so a branch made before the rename runs it after merging main and is renamed the same way.
//
// Kept as they are: the repository's address (rogerbucks/graph-note, its wiki and its Pages site) until the repository
// itself is renamed; the GitHub Project's title, which the mirror finds it by; "graph note" in lower case, which names
// the kind of note, not the product; and generated or historical files, which their own commands remake.
//
// Usage:
//   node scripts/rename-to-thoughtknot.mjs           renames in place, then: npm install && npm run build && npm run format
//   node scripts/rename-to-thoughtknot.mjs --check   exits 1 if any file still needs renaming
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Files the rename leaves alone: generated (remade by their command), historical records, and this script and its test. */
const SKIP = [
  /^package-lock\.json$/,
  /(^|\/)uv\.lock$/,
  /^main\.js$/,
  /(^|\/)dist\//,
  /^packages\/claude-code\/mod\/hooks\/graph\.js$/,
  /^packages\/claude-code\/mod\/bin\//,
  /^test\/tests-first\//,
  /^test\/seen-failing\//,
  /^THIRD_PARTY_NOTICES\.md$/,
  /^licences\/texts\//,
  /^scripts\/rename-to-thoughtknot\.mjs$/,
  /^test\/rename-to-thoughtknot\.test\.js$/,
  /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|gz)$/i,
];

/** Text that names the repository or the live GitHub Project, which stay as they are until those are renamed. */
const KEEP = [
  /rogerbucks(\\?\/)graph-note/g,
  /rogerbucks\\?\.github\\?\.io(\\?\/)graph-note/g,
  /graph-note requirements/g,
  /name = 'graph-note'/g,
  /RogerBucks\/Graph-Note/g,
  /\\\/graph-note(?=\(\\\.git\)\?\$|\$\/)/g,
];

/** The renames, in order: longer and cased forms first. Lower-case "graph note" is the kind of note and stays. */
const RENAMES = [
  [/Graph Note/g, 'ThoughtKnot'],
  [/Graph-Note/g, 'ThoughtKnot'],
  [/GraphNote/g, 'ThoughtKnot'],
  [/Thoughtknot/g, 'ThoughtKnot'],
  [/GRAPH_NOTE/g, 'THOUGHTKNOT'],
  [/GRAPH-NOTE/g, 'THOUGHTKNOT'],
  [/graphNote/g, 'thoughtknot'],
  [/graph-note/g, 'thoughtknot'],
];

/** The text renamed, with the kept text untouched. */
export function renameText(text) {
  const kept = [];
  let out = text;
  for (const re of KEEP) out = out.replace(re, (m) => `\u0000${kept.push(m) - 1}\u0000`);
  for (const [re, to] of RENAMES) out = out.replace(re, to);
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
}

/** A path renamed the same way. */
export const renamePath = (path) => RENAMES.reduce((p, [re, to]) => p.replace(re, to), path);

const skipped = (path) => SKIP.some((re) => re.test(path));

function main() {
  const check = process.argv.includes('--check');
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  const pending = [];
  for (const file of files) {
    if (skipped(file)) continue;
    const to = renamePath(file);
    let text;
    try {
      text = readFileSync(join(ROOT, file), 'utf8');
    } catch {
      continue; // a tracked file deleted in the working tree
    }
    const renamed = renameText(text);
    if (renamed === text && to === file) continue;
    pending.push(to === file ? file : `${file} -> ${to}`);
    if (check) continue;
    if (renamed !== text) writeFileSync(join(ROOT, file), renamed);
    if (to !== file) {
      mkdirSync(dirname(join(ROOT, to)), { recursive: true });
      execFileSync('git', ['mv', file, to], { cwd: ROOT });
    }
  }
  if (check) {
    for (const p of pending) console.log(`not renamed: ${p}`);
    process.exit(pending.length ? 1 : 0);
  }
  console.log(`renamed ${pending.length} files; now run: npm install && npm run build && npm run format`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
