// The core's entry (spec §10): src/index.ts is what the plugin imports, so its names hold while the modules behind it
// change. It exports exactly the names index-names.js lists, values and types alike. Each is added there deliberately
// with its day, so a change to the entry is a decision, not an accident.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { TYPES, VALUES } from './index-names.js';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ENTRY = new URL('../src/index.ts', import.meta.url);

/** The names src/index.ts exports, as written: values, and types only. */
function written() {
  const src = ts.createSourceFile('index.ts', readFileSync(ENTRY, 'utf8'), ts.ScriptTarget.Latest, true);
  const values = [],
    types = [];
  for (const n of src.statements)
    if (ts.isExportDeclaration(n) && n.exportClause && ts.isNamedExports(n.exportClause))
      for (const e of n.exportClause.elements) (n.isTypeOnly || e.isTypeOnly ? types : values).push(e.name.text);
  return { values: values.sort(), types: types.sort() };
}

describe('the package entry', () => {
  test('exports the same values it did before the core was split into modules', async () => {
    const entry = await import(ENTRY.href);
    assert.deepEqual(Object.keys(entry).sort(), VALUES);
    assert.deepEqual(written().values, VALUES);
  });

  test('exports the same types it did before the core was split into modules', () => {
    assert.deepEqual(written().types, TYPES);
  });
});
