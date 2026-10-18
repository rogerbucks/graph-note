// The core imports no host (spec §10, "host-free core"): no obsidian, no vscode, no CodeMirror, and nothing from Node, so
// the same core runs in Obsidian on desktop and phone and, later, in VS Code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../src/', import.meta.url);
const sources = readdirSync(dir).filter((f) => /\.ts$/.test(f));
const imports = (text) =>
  [
    ...text.matchAll(
      /(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ),
  ].map((m) => m[1] ?? m[2] ?? m[3]);
const HOSTS = /^(obsidian|vscode|@codemirror\/|@lezer\/|node:|fs$|path$|child_process$|electron$)/;
const ALLOWED = /^(\.\.?\/|@thoughtknot\/graph-spec(\/|$)|@viz-js\/viz$)/;

test('there is core source to check', () => assert.ok(sources.length >= 5));

for (const f of sources) {
  test(`${f} imports no host`, () => {
    const found = imports(readFileSync(new URL(f, dir), 'utf8'));
    assert.deepEqual(
      found.filter((m) => HOSTS.test(m)),
      [],
      'a host module',
    );
    assert.deepEqual(
      found.filter((m) => !ALLOWED.test(m)),
      [],
      'only the core, the graph library and the Graphviz engine',
    );
  });
}

// The display layer (src/display/, shared by the Obsidian plugin and the browser editor's page) is DOM code, but it too
// imports no host: only itself, the core by its name and the graph library. The host comes in through display/host.ts.
const displayFiles = (d = new URL('display/', dir)) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? displayFiles(new URL(`${e.name}/`, d)) : /\.ts$/.test(e.name) ? [new URL(e.name, d)] : [],
  );
for (const f of displayFiles()) {
  test(`display/${f.pathname.split('/src/display/')[1]} imports no host`, () => {
    const found = imports(readFileSync(f, 'utf8'));
    assert.deepEqual(
      found.filter((m) => HOSTS.test(m)),
      [],
      'a host module',
    );
    assert.deepEqual(
      found.filter((m) => !(ALLOWED.test(m) || /^@thoughtknot\/core(\/|$)/.test(m))),
      [],
      'only the layer, the core and the graph library',
    );
  });
}

// The Graphviz engine is WebAssembly, which some hosts lack (a Claude Code mod has none). Only engine.ts starts it, and
// within the core only the entry hands it on, so every other module of the core runs where WebAssembly cannot. A host's
// own code (the Obsidian layout worker, the Claude Code spike's Graphviz process) imports it as it needs.
test('only engine.ts imports the Graphviz engine', () => {
  const importers = sources.filter((f) => imports(readFileSync(new URL(f, dir), 'utf8')).includes('@viz-js/viz'));
  assert.deepEqual(importers, ['engine.ts']);
});

test('within the core, only the entry imports engine.ts', () => {
  const importers = sources.filter((f) => imports(readFileSync(new URL(f, dir), 'utf8')).includes('./engine.ts'));
  assert.deepEqual(importers, ['index.ts']);
});
