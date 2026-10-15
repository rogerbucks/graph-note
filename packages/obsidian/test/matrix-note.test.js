// The destination matrix note read into plain rows (editor spec §19, model_ceiling; Roger, 16 Oct 2026): the Obsidian
// layer reads the note named in a setting and hands the core rows of classes with a mark each, so the core never reads
// the note's layout. A Markdown table with an empty top-left cell, destinations as rows, classes as columns, and ✅, ⚠️ or
// ❌ in the cells; another table in the note, such as the ranking of classes, is not the matrix. The core's use of the
// rows is tested in packages/core/test/ai-matrix.test.js.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matrixRows } from '../src/ai/matrix-note.ts';

const NOTE = `# Classification

Some words before.

| Rank | Class |
|---|---|
| 1 | **Confidential** |

| | Public | **Internal** | Confidential |
|---|:-:|---|---|
| **Claude — conversation** | ✅ | ⚠️ history off | ❌ |
| Local model | ✅ | ✅ | ⚠ on this device only |
| Odd one | maybe |  | ✅ |

| | Not | The matrix |
|---|---|---|
| **Later table** | ✅ | ✅ |
`;

describe('the matrix note read into plain rows', () => {
  test('destinations are rows and classes are columns, each cell a yes, a conditional or a no', () => {
    const rows = matrixRows(NOTE);
    assert.deepEqual(
      rows.map((r) => r.name),
      ['Claude — conversation', 'Local model', 'Odd one'],
    );
    assert.deepEqual(
      rows[0].cells.map((c) => [c.class, c.mark]),
      [
        ['Public', 'yes'],
        ['Internal', 'conditional'],
        ['Confidential', 'no'],
      ],
    );
  });

  test('a conditional cell keeps the words after its mark as the condition, with or without the variation selector', () => {
    const rows = matrixRows(NOTE);
    assert.equal(rows[0].cells[1].condition, 'history off');
    assert.equal(rows[1].cells[2].mark, 'conditional');
    assert.equal(rows[1].cells[2].condition, 'on this device only');
    assert.ok(!('condition' in rows[0].cells[0]));
  });

  test('a cell that is blank or none of the three marks is a no, never a yes', () => {
    const odd = matrixRows(NOTE)[2];
    assert.deepEqual(
      odd.cells.map((c) => c.mark),
      ['no', 'no', 'yes'],
    );
  });

  test('only the first matrix is read, and a table whose corner is not empty is not one', () => {
    assert.ok(!matrixRows(NOTE).some((r) => r.name === 'Later table'));
    assert.ok(!matrixRows(NOTE).some((r) => r.name === '1'));
  });

  test('a note with no matrix, or none at all, gives no rows', () => {
    assert.deepEqual(matrixRows('# Nothing here\n\n| a | b |\n|---|---|\n| 1 | 2 |\n'), []);
    assert.deepEqual(matrixRows(''), []);
  });

  test('a Windows line ending reads the same', () => {
    const plain = matrixRows(NOTE);
    assert.deepEqual(matrixRows(NOTE.replace(/\n/g, '\r\n')), plain);
  });

  test('the agreement tests’ own classification note reads as its matrix', () => {
    const text = readFileSync(
      new URL('../../../python/graph_spec/tests/agreement/classification.md', import.meta.url),
      'utf8',
    );
    const rows = matrixRows(text);
    assert.deepEqual(
      rows.map((r) => r.name),
      ['Claude — conversation', 'Local model'],
    );
    assert.deepEqual(
      rows[1].cells.map((c) => [c.class, c.mark]),
      [
        ['Unmoderated', 'yes'],
        ['Public', 'yes'],
        ['Internal', 'yes'],
        ['Confidential', 'conditional'],
      ],
    );
  });
});
