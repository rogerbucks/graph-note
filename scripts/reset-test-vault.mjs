#!/usr/bin/env node
// Readies the test vault, test-vault/, for a session in Obsidian, and clears it after. It:
// - restores its notes and settings to what is committed;
// - removes everything a session added (notes typed, workspace files, other plugins);
// - copies the plugin build at the repository root into .obsidian/plugins/thoughtknot/ as real files;
// - makes the test files the device checks need (scripts/make-test-files.mjs), the GIF over the size limit among them.
//
// Nothing outside test-vault/ is touched.
//
// The vault is synced to a phone with Obsidian Sync, so the reset is Sync-friendly:
// - it never removes Sync's own files in .obsidian/ (KEEP);
// - it copies the build rather than linking it (Sync may not upload links);
// - it changes only what differs. Git restores only changed tracked files, and a plugin file is written only when its
//   bytes differ.
//
// Usage:
//   node scripts/reset-test-vault.mjs               before and after every session in the vault.
//   node scripts/reset-test-vault.mjs --root DIR    the same, in the repository at DIR (the tests use this).
//
// Run `npm run build` first. The vault holds copies, not links. So a new build reaches it only when this reset is run
// again: build, then reset, then reload the plugin in Obsidian.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTestFiles } from './make-test-files.mjs';

export const VAULT = 'test-vault';
export const PLUGIN_FILES = ['main.js', 'manifest.json', 'styles.css'];
const PLUGIN_DIR = join(VAULT, '.obsidian', 'plugins', 'thoughtknot');

/**
 * Files in the vault's .obsidian/ that a reset never removes, or every reset would switch Obsidian Sync off. Patterns for
 * `git clean -e`, relative to .obsidian/:
 * - `sync*`: Sync's own state, any file or folder whose name starts with `sync` (for example sync.json).
 * - `core-plugins.json`: lists the enabled core plugins, and holds `"sync": true`, which turns the Sync core plugin
 *   on. It is not tracked, so without this entry the reset deletes it and Sync is off on every device.
 * Extend this list once it is clear which other files Sync needs there.
 */
export const KEEP = ['sync*', 'core-plugins.json'];

/** True when the file at path is a regular file (not a link) holding exactly the bytes of the file at source. */
function sameFile(path, source) {
  try {
    return lstatSync(path).isFile() && readFileSync(path).equals(readFileSync(source));
  } catch {
    return false;
  }
}

/** Restores the vault in the repository at root to what is committed, then copies the plugin build into it. */
export function fresh(root) {
  for (const f of PLUGIN_FILES)
    if (!existsSync(join(root, f))) throw new Error(`${f} is not built: run \`npm run build\` first`);
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
  // `git restore --worktree` rewrites every file it is given, changed or not. So it is given only the tracked files
  // that differ. The index is reset first (it holds no file content to rewrite), so a staged change counts as a change
  git('restore', '--source=HEAD', '--staged', '--', VAULT);
  const changed = git('diff', '--name-only', '-z', '--', VAULT).toString().split('\0').filter(Boolean);
  if (changed.length) git('restore', '--worktree', '--', ...changed);
  // the installed build stays too, so an unchanged file is not deleted and copied again
  const kept = [...KEEP.map((p) => `.obsidian/${p}`), ...PLUGIN_FILES.map((f) => `.obsidian/plugins/thoughtknot/${f}`)];
  const keep = kept.flatMap((p) => ['-e', `/${VAULT}/${p}`]);
  git('clean', '-fdxq', ...keep, '--', VAULT);
  const dir = join(root, PLUGIN_DIR);
  mkdirSync(dir, { recursive: true });
  for (const f of PLUGIN_FILES) {
    const target = join(dir, f);
    if (sameFile(target, join(root, f))) continue;
    rmSync(target, { force: true }); // an old link is replaced, never written through
    copyFileSync(join(root, f), target);
  }
  // the images and the PDF the device checks need. The small ones are committed (so this writes nothing). The GIF over
  // the size limit is ignored by git, and made here (tests_self_contained, test_files_generated)
  makeTestFiles(join(root, VAULT));
}

function main(args) {
  const at = args.indexOf('--root');
  const root = at >= 0 ? resolve(args[at + 1]) : join(dirname(fileURLToPath(import.meta.url)), '..');
  if (args.length !== (at >= 0 ? 2 : 0) || (at >= 0 && !args[at + 1])) {
    console.error('Usage: node scripts/reset-test-vault.mjs [--root DIR]');
    return 2;
  }
  try {
    fresh(root);
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  console.log(`${VAULT}/ is as committed, with the plugin build copied in and Obsidian Sync's files kept`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
