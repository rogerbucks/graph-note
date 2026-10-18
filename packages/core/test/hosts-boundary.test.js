// The host-side modules of the core (src/hosts/, reached as `@thoughtknot/core/hosts/<module>`) are for the code that
// reads a note or a file for a gate, such as the destination matrix note's table; the gates and the rest of the core are
// handed plain data and never import them, so core logic never learns a note's layout (editor spec §19, model_ceiling).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../src/', import.meta.url);
const sources = readdirSync(dir).filter((f) => /\.ts$/.test(f));
const imports = (text) =>
  [
    ...text.matchAll(
      /(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ),
  ].map((m) => m[1] ?? m[2]);

test('the matrix note’s reader is a host-side module, reached by its subpath', async () => {
  const reader = await import('@thoughtknot/core/hosts/matrix-table');
  assert.equal(typeof reader.matrixRows, 'function');
  assert.equal(typeof reader.matrixRowsFrom, 'function');
  assert.ok(readdirSync(new URL('hosts/', dir)).includes('matrix-table.ts'));
  assert.ok(!sources.includes('matrix-table.ts'), 'it is not among the core’s own modules');
});

test('the package entry does not export the host-side modules', async () => {
  const entry = await import('../src/index.ts');
  assert.equal('matrixRows' in entry, false);
  assert.equal('matrixRowsFrom' in entry, false);
});

for (const f of sources) {
  test(`${f} does not import a host-side module`, () => {
    const found = imports(readFileSync(new URL(f, dir), 'utf8'));
    assert.deepEqual(
      found.filter((m) => /(^|\/)hosts\//.test(m)),
      [],
    );
  });
}

test('the host-side modules import only types from the core', () => {
  for (const f of readdirSync(new URL('hosts/', dir))) {
    const text = readFileSync(new URL(`hosts/${f}`, dir), 'utf8');
    for (const [line] of text.matchAll(/^import .*from '\.\.\/[^']+';$/gm)) assert.match(line, /^import type /, f);
  }
});
