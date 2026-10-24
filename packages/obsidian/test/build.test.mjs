// The plugin's build: `npm run build` once, `npm run dev` on every save. Both write the files the
// plugin is installed from: main.js, manifest.json and styles.css at the repository root. The vault's
// install script copies them into .obsidian/plugins/thoughtknot/ for desktop and phone (spec §13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const pkg = (rel) => JSON.parse(readFileSync(`${root}${rel}`, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('npm run dev rebuilds the plugin on every save', () => {
  assert.equal(pkg('package.json').scripts.dev, 'npm run dev --workspace packages/obsidian');
  assert.equal(pkg('packages/obsidian/package.json').scripts.dev, 'node esbuild.config.mjs --watch');
});

test('in watch mode the build writes main.js and keeps watching', async (t) => {
  const started = Date.now();
  const child = spawn(process.execPath, ['esbuild.config.mjs', '--watch'], {
    cwd: `${root}packages/obsidian`,
    stdio: 'ignore',
  });
  t.after(() => child.kill());
  const main = `${root}main.js`;
  for (let i = 0; i < 100 && !(existsSync(main) && statSync(main).mtimeMs >= started - 1000); i++) await sleep(100);
  assert.ok(existsSync(main) && statSync(main).mtimeMs >= started - 1000, 'main.js was written');
  await sleep(500);
  assert.equal(child.exitCode, null, 'the build is still watching');
});

test('the plugin is built with whitespace and syntax minified, and every name kept for stack traces', async () => {
  const { options } = await import('../esbuild.config.mjs');
  assert.equal(options.minifyWhitespace, true);
  assert.equal(options.minifySyntax, true);
  assert.ok(!options.minify && !options.minifyIdentifiers, 'names are kept');
});

test('the files the plugin is installed from are at the repository root', () => {
  for (const f of ['manifest.json', 'styles.css']) assert.ok(existsSync(`${root}${f}`), f);
  assert.equal(pkg('manifest.json').id, 'thoughtknot', 'installed as .obsidian/plugins/thoughtknot');
});

// Tests across the plugin rebuild main.js in parallel. Obsidian reads it while `npm run dev` writes.
// A reader must see the old build or the new one, never half of one. A file swapped in whole by a rename is a new file.
// It has a new inode. Or the file system may hand a freed inode number straight back (ext4 does, under parallel builds).
// Then it has a newer creation time. One rewritten in place keeps both.
const identity = (file) => {
  if (!existsSync(file)) return null;
  const s = statSync(file);
  return { ino: s.ino, born: s.birthtimeMs };
};
const replaced = (before, after) => !before || after.ino !== before.ino || after.born > before.born;

test('a build swaps main.js in whole, so nothing ever reads half of it', () => {
  const main = `${root}main.js`;
  const before = identity(main);
  const r = spawnSync(process.execPath, ['esbuild.config.mjs'], { cwd: `${root}packages/obsidian`, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(replaced(before, identity(main)), 'main.js is a new file, renamed into place');
  assert.match(readFileSync(main, 'utf8'), /module\.exports ?= ?/, 'the whole build is there');
});

test('in watch mode too, each build swaps main.js in whole', async (t) => {
  const main = `${root}main.js`;
  const before = identity(main);
  const child = spawn(process.execPath, ['esbuild.config.mjs', '--watch'], {
    cwd: `${root}packages/obsidian`,
    stdio: 'ignore',
  });
  t.after(() => child.kill());
  for (let i = 0; i < 100 && !replaced(before, identity(main)); i++) await sleep(100);
  assert.ok(replaced(before, identity(main)), 'the watch build renamed a new main.js into place');
});
