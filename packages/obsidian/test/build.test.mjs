// The plugin's build: `npm run build` once, `npm run dev` on every save. Both write the files the
// plugin is installed from — main.js, manifest.json and styles.css at the repository root — which the
// vault's install script copies into .obsidian/plugins/graph-note/ for desktop and phone (spec §13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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

test('the files the plugin is installed from are at the repository root', () => {
  for (const f of ['manifest.json', 'styles.css']) assert.ok(existsSync(`${root}${f}`), f);
  assert.equal(pkg('manifest.json').id, 'graph-note', 'installed as .obsidian/plugins/graph-note');
});
