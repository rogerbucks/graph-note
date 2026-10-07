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
const ALLOWED = /^(\.\.?\/|@graph-note\/graph-spec(\/|$)|@viz-js\/viz$)/;

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
