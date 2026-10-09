#!/usr/bin/env node
// Readies the test vault, test-vault/, for a session in Obsidian, and clears it after: restores its notes and settings
// to what is committed, removes everything a session added (notes typed, workspace files, other plugins), and links the
// plugin build at the repository root into .obsidian/plugins/graph-note/. Nothing outside test-vault/ is touched.
//
// Usage:
//   node scripts/reset-test-vault.mjs               before and after every session in the vault
//   node scripts/reset-test-vault.mjs --root DIR    the same, in the repository at DIR (the tests use this)
//
// Run `npm run build` first, so the links find a build.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VAULT = 'test-vault';
export const PLUGIN_FILES = ['main.js', 'manifest.json', 'styles.css'];
const PLUGIN_DIR = join(VAULT, '.obsidian', 'plugins', 'graph-note');

/** Restores the vault in the repository at root to what is committed, then links the plugin build into it. */
export function fresh(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
  git('restore', '--source=HEAD', '--staged', '--worktree', '--', VAULT);
  git('clean', '-fdxq', '--', VAULT);
  const dir = join(root, PLUGIN_DIR);
  mkdirSync(dir, { recursive: true });
  for (const f of PLUGIN_FILES) {
    rmSync(join(dir, f), { force: true });
    // relative, so the link holds wherever the repository is
    symlinkSync(join('..', '..', '..', '..', f), join(dir, f));
  }
}

function main(args) {
  const at = args.indexOf('--root');
  const root = at >= 0 ? resolve(args[at + 1]) : join(dirname(fileURLToPath(import.meta.url)), '..');
  if (args.length !== (at >= 0 ? 2 : 0) || (at >= 0 && !args[at + 1])) {
    console.error('Usage: node scripts/reset-test-vault.mjs [--root DIR]');
    return 2;
  }
  fresh(root);
  console.log(`${VAULT}/ is as committed, with the plugin build linked in`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
