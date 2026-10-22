// The matrix view (editor spec §36, view_types_offered): matrix-view.ts. A row and a column for each thing, a cell for
// each pair of things linked, and every mark inside the space it is given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matrixMarks } from '../src/view-types/matrix-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 400, height: 300 };

/** A shape of things `[key, text]` and links `[from, type, to]`. */
const shapeOf = (things, links) => ({
  things: things.map(([key, text = key]) => ({ key, text, kinds: ['Thing'] })),
  links: links.map(([from, type, to]) => ({ from, type, to })),
});

test('each thing has a row and a column, named, and each pair linked has one cell', () => {
  const shape = shapeOf(
    [
      ['a', 'Alpha'],
      ['b', 'Beta'],
      ['c', 'Gamma'],
    ],
    [
      ['a', 'LINKS', 'b'],
      ['a', 'CITES', 'b'],
      ['b', 'LINKS', 'c'],
    ],
  );
  const marks = drawMarksOf(matrixMarks({ shape, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const labels = marks.filter((m) => m.kind === 'label');
  assert.deepEqual(
    labels.map((m) => m.id),
    ['a.row', 'a.column', 'b.row', 'b.column', 'c.row', 'c.column'],
  );
  const cells = marks.filter((m) => m.kind === 'box');
  assert.deepEqual(
    cells.map((m) => [m.id, m.name, m.style]),
    [
      ['cell.a.b', 'Alpha LINKS, CITES Beta', 'link.many'],
      ['cell.b.c', 'Beta LINKS Gamma', 'link'],
    ],
  );
  // row a, column b: the cell sits right of a's row name and under b's column name
  const ab = cells[0];
  const row = labels.find((m) => m.id === 'a.row');
  const column = labels.find((m) => m.id === 'b.column');
  assert.ok(ab.y < row.y && row.y < ab.y + ab.height);
  assert.ok(ab.x < column.x && column.x < ab.x + ab.width);
});

test('the cells are square and fit the space, however many things there are', () => {
  const keys = Array.from({ length: 120 }, (_, i) => [`t${i}`]);
  const links = keys.slice(1).map(([k], i) => [`t${i}`, 'LINKS', k]);
  const marks = drawMarksOf(matrixMarks({ shape: shapeOf(keys, links), space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const cells = marks.filter((m) => m.kind === 'box');
  assert.equal(cells.length, 119);
  assert.ok(cells.every((m) => m.width === m.height && m.x + m.width <= SPACE.width && m.y + m.height <= SPACE.height));
});

test('a graph with nothing in it draws nothing, and a link to a thing not drawn draws no cell', () => {
  assert.deepEqual(matrixMarks({ shape: shapeOf([], []), space: SPACE }), []);
  const marks = matrixMarks({ shape: shapeOf([['a']], [['a', 'LINKS', 'gone']]), space: SPACE });
  assert.equal(marks.filter((m) => m.kind === 'box').length, 0);
});
