// The destination matrix note read into plain rows (editor spec §19, model_ceiling; Roger, 16 Oct 2026): the Obsidian
// layer reads the note named in a setting and hands the core rows of classes with a mark each, so the core never reads
// the note's layout. The matrix is chosen by its header (destinations down the side, classes across, at least one a known
// class), with ✅, ⚠️ or ❌ in the cells; a cell is a mark only when it is exactly that, and anything else is unknown, which
// refuses. The core's use of the rows is tested in packages/core/test/ai-matrix.test.js.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matrixRows } from '../src/ai/matrix-note.ts';

const KNOWN = ['public', 'internal', 'confidential', 'restricted', 'unmoderated'];
const known = (name) => KNOWN.includes(name.trim().toLowerCase());
const rows = (text) => matrixRows(text, known);
const marks = (row) => row.cells.map((c) => c.mark);

const NOTE = `# Classification

Some words before.

| Rank | Class |
|---|---|
| 1 | **Confidential** |

| | Alpha | Beta |
|---|---|---|
| **Not the matrix** | ✅ | ✅ |

| | Public | **Internal** | Confidential |
|---|:-:|---|---|
| **Claude — conversation** | ✅ | ⚠️ history off | ❌ |
| Local model | ✅ | ✅ | ⚠ on this device only |
| Odd one | maybe |  | ✅ |

| | Public | Internal |
|---|---|---|
| **Later table** | ✅ | ✅ |
`;

describe('the matrix note read into plain rows', () => {
  test('destinations are rows and classes are columns, each cell a yes, a conditional or a no', () => {
    const r = rows(NOTE);
    assert.deepEqual(
      r.map((x) => x.name),
      ['Claude — conversation', 'Local model', 'Odd one'],
    );
    assert.deepEqual(
      r[0].cells.map((c) => [c.class, c.mark]),
      [
        ['Public', 'yes'],
        ['Internal', 'conditional'],
        ['Confidential', 'no'],
      ],
    );
  });

  test('a conditional cell keeps the words after its mark as the condition, with or without the variation selector', () => {
    const r = rows(NOTE);
    assert.equal(r[0].cells[1].condition, 'history off');
    assert.equal(r[1].cells[2].mark, 'conditional');
    assert.equal(r[1].cells[2].condition, 'on this device only');
    assert.ok(!('condition' in r[0].cells[0]));
  });

  test('a cell that is blank or none of the three marks is unknown, never a yes', () => {
    assert.deepEqual(marks(rows(NOTE)[2]), ['unknown', 'unknown', 'yes']);
  });

  test('a mark is a mark only when the cell is exactly it: a yes with words, or two marks, is unknown', () => {
    const text =
      '| | Public | Internal | Confidential | Restricted |\n|---|---|---|---|---|\n| R | ✅ not for x | ✅❌ | ❌ x | ✅ |\n';
    assert.deepEqual(marks(rows(text)[0]), ['unknown', 'unknown', 'unknown', 'yes']);
  });

  test('a conditional cell with no condition is conditional with none, so it can never be switched on', () => {
    const text = '| | Public | Internal |\n|---|---|---|\n| R | ⚠️ | ⚠️ — with logging off |\n';
    const [a, b] = rows(text)[0].cells;
    assert.deepEqual([a.mark, 'condition' in a], ['conditional', false]);
    assert.deepEqual([b.mark, b.condition], ['conditional', 'with logging off']);
  });

  test('an escaped bar stays inside its cell, in a name, a condition or a class', () => {
    const text = '| | Public | Internal \\| Staff |\n|---|---|---|\n| Chat \\| beta | ⚠️ only a \\| b | ✅ |\n';
    const [row] = rows(text);
    assert.equal(row.name, 'Chat | beta');
    assert.deepEqual(
      row.cells.map((c) => [c.class, c.mark, c.condition ?? '']),
      [
        ['Public', 'conditional', 'only a | b'],
        ['Internal | Staff', 'yes', ''],
      ],
    );
  });

  test('the matrix is chosen by its header: the first table with a known class across, not any with an empty corner', () => {
    assert.ok(!rows(NOTE).some((x) => x.name === 'Not the matrix'));
    assert.ok(!rows(NOTE).some((x) => x.name === 'Later table'));
    assert.ok(!rows(NOTE).some((x) => x.name === '1'));
    assert.deepEqual(rows('| | Alpha | Beta |\n|---|---|---|\n| R | ✅ | ✅ |\n'), []);
  });

  test('a note with no matrix, or none at all, gives no rows', () => {
    assert.deepEqual(rows('# Nothing here\n\n| a | b |\n|---|---|\n| 1 | 2 |\n'), []);
    assert.deepEqual(rows(''), []);
  });

  test('a Windows line ending reads the same', () => {
    assert.deepEqual(rows(NOTE.replace(/\n/g, '\r\n')), rows(NOTE));
  });

  test('the agreement tests’ own classification note reads as its matrix', () => {
    const text = readFileSync(
      new URL('../../../python/graph_spec/tests/agreement/classification.md', import.meta.url),
      'utf8',
    );
    const r = rows(text);
    assert.deepEqual(
      r.map((x) => x.name),
      ['Claude — conversation', 'Local model'],
    );
    assert.deepEqual(
      r[1].cells.map((c) => [c.class, c.mark]),
      [
        ['Unmoderated', 'yes'],
        ['Public', 'yes'],
        ['Internal', 'yes'],
        ['Confidential', 'conditional'],
      ],
    );
  });
});
