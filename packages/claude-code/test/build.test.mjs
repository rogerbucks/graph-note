// The mod's build (spec §10, a Claude Code host): `npm run build --workspace packages/claude-code` writes what the mod
// loads, graph.js for its hooks module, which must hold no WebAssembly engine and stay under the 1 MiB a mod file may be;
// and bin/render.mjs, the core's Graphviz engine that node runs, which draws SVG from DOT on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = fileURLToPath(new URL('../', import.meta.url));
const built = spawnSync(process.execPath, ['esbuild.config.mjs'], { cwd: pkg, encoding: 'utf8' });

test('the build runs, and the root build builds the mod too', () => {
  assert.equal(built.status, 0, built.stderr);
  const root = JSON.parse(readFileSync(`${pkg}../../package.json`, 'utf8'));
  assert.match(root.scripts.build, /--workspace packages\/claude-code/);
});

test("the hooks module's bundle holds no WebAssembly engine, and a mod may read it", () => {
  const graph = `${pkg}mod/hooks/graph.js`;
  assert.ok(statSync(graph).size < 1024 * 1024, `${statSync(graph).size} bytes`);
  const text = readFileSync(graph, 'utf8');
  // the engine's code, not its licence comment, which esbuild keeps where the import was
  assert.doesNotMatch(text, /WebAssembly|renderString|graphvizVersion/);
  assert.doesNotMatch(text, /\bimport\s*\(/, 'a module holding import() does not load');
  assert.doesNotMatch(text, /^import /m, 'one file: it imports nothing');
});

test('bin/render.mjs draws SVG from DOT on its own, through node', () => {
  const r = spawnSync(process.execPath, [`${pkg}mod/bin/render.mjs`], {
    input: JSON.stringify(['digraph { a -> b }']),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout)[0], /<svg /);
});

test('bin/editor-server.mjs is the editor server, built whole: it refuses to be told where to listen', () => {
  const r = spawnSync(process.execPath, [`${pkg}mod/bin/editor-server.mjs`, '--port', '8080'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /takes no argument but --test-note/);
  assert.doesNotMatch(readFileSync(`${pkg}mod/bin/editor-server.mjs`, 'utf8'), /^import .* from ['"](?!node:)/m);
});

test('the repository is a marketplace listing the mod by its folder, so an install reads the working copy', () => {
  const market = JSON.parse(readFileSync(`${pkg}../../.claude-plugin/marketplace.json`, 'utf8'));
  const manifest = JSON.parse(readFileSync(`${pkg}mod/.claude-plugin/plugin.json`, 'utf8'));
  assert.equal(market.name, 'graph-note', 'installed as graph-note@graph-note');
  assert.deepEqual(market.plugins, [
    { name: manifest.name, source: './packages/claude-code/mod', description: manifest.description },
  ]);
});

test("the mod's test fixtures are the test vault's sample note and what Graphviz draws for it", async () => {
  const { NOTE, SVGS } = await import(`${pkg}mod/tests/fixtures.js`);
  assert.equal(NOTE, readFileSync(`${pkg}../../test-vault/Sample graph note.md`, 'utf8'));
  assert.ok(SVGS.length >= 1 && SVGS.every((s) => s.includes('<svg ')));
});
