// The core's entry (spec §10): src/index.ts is what the plugin imports, so its names hold while the modules behind it
// change. These are the names it exported when drawing.ts was split into modules (9 Oct 2026), values and types alike.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ENTRY = new URL('../src/index.ts', import.meta.url);

const VALUES = [
  'History',
  'KIND',
  'MAX_SCALE',
  'MIN_SCALE',
  'PaneSession',
  'SEVERITY',
  'STEP',
  'STYLE',
  'TOKEN_CLASSES',
  'TapCycle',
  'TextHistory',
  'Zoom',
  'blockItems',
  'choose',
  'colonFor',
  'colonInNote',
  'commaFor',
  'commaInNote',
  'completenessReport',
  'completions',
  'details',
  'diagnostics',
  'distance',
  'draw',
  'drawingSource',
  'explain',
  'fixed',
  'gqlBlocks',
  'gqlSpans',
  'graphOfBlock',
  'hitAreas',
  'hops',
  'insertBlockAfter',
  'isDraft',
  'isSharedSchema',
  'layoutSource',
  'linkDetails',
  'linkInBlock',
  'loadEngine',
  'lockBlock',
  'namesSharedSchema',
  'nearby',
  'parseValue',
  'propertiesOf',
  'propertyNames',
  'readBack',
  'readNote',
  'renameProperty',
  'replaceBlock',
  'reverseGuess',
  'setProperty',
  'sizeOf',
  'spanOf',
  'textVersion',
  'themed',
  'tokenize',
  'withoutColorMix',
];

const TYPES = [
  'Block',
  'BlockRef',
  'Box',
  'Change',
  'Choice',
  'CodeAction',
  'CompletenessReport',
  'CompletionItem',
  'Details',
  'Diagnostic',
  'Drawn',
  'Edit',
  'Engine',
  'Estimate',
  'GraphDrawing',
  'HitAreas',
  'Link',
  'LinkDetail',
  'LinkDetails',
  'Mode',
  'NoteReading',
  'PaneWrite',
  'Parsed',
  'Position',
  'Problem',
  'PropType',
  'Property',
  'Range',
  'RuleReport',
  'Shape',
  'Size',
  'Span',
  'Target',
  'TextChange',
  'TextEdit',
  'TextState',
  'Token',
  'TokenClass',
  'View',
  'WriteResult',
  'ZoomEvent',
];

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
