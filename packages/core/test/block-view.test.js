// The block diagram view (editor spec §36, view_types_offered): block-view.ts. Each thing is a block, links run left to
// right in right-angled lines, and every mark is inside the space it is given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockMarks, columnsOf } from '../src/view-types/block-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 600, height: 400 };

/** A shape of things by key and links `[from, to]`. */
const shapeOf = (keys, links = []) => ({
  things: keys.map((key) => ({ key, text: key.toUpperCase(), kinds: ['Thing'] })),
  links: links.map(([from, to]) => ({ from, type: 'FEEDS', to })),
});

test('a thing sits one column right of the furthest thing that links to it', () => {
  // a → b → c, and a → c: c sits after b, not beside it
  const shape = shapeOf(
    ['c', 'b', 'a', 'd'],
    [
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'c'],
    ],
  );
  assert.deepEqual(Object.fromEntries(columnsOf(shape)), { a: 0, b: 1, c: 2, d: 0 });
  const marks = drawMarksOf(blockMarks({ shape, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const x = Object.fromEntries(marks.filter((m) => m.kind === 'box').map((m) => [m.id, m.x]));
  assert.ok(x.a < x.b && x.b < x.c);
  assert.equal(x.a, x.d);
});

test('each link is a right-angled line ending in an arrowhead at its target', () => {
  const shape = shapeOf(['a', 'b'], [['a', 'b']]);
  const marks = drawMarksOf(blockMarks({ shape, space: SPACE }), SPACE);
  const [line] = marks.filter((m) => m.kind === 'link');
  for (let i = 1; i < line.points.length; i++) {
    const [[x0, y0], [x1, y1]] = [line.points[i - 1], line.points[i]];
    assert.ok(x0 === x1 || y0 === y1, 'each part runs straight across or down');
  }
  const b = marks.find((m) => m.kind === 'box' && m.id === 'b');
  const head = marks.find((m) => m.kind === 'arrowhead');
  assert.deepEqual([head.x, head.y, head.angle], [b.x, b.y + b.height / 2, 0]);
});

test('a cycle still gives every thing a column, and its closing link is drawn', () => {
  const shape = shapeOf(
    ['a', 'b', 'c'],
    [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ],
  );
  assert.deepEqual(Object.fromEntries(columnsOf(shape)), { a: 0, b: 1, c: 2 });
  const marks = drawMarksOf(blockMarks({ shape, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  assert.equal(marks.filter((m) => m.kind === 'link').length, 3);
  assert.equal(marks.filter((m) => m.kind === 'arrowhead').length, 3);
});

test('a big graph still fits the space with every id its own, and a graph with nothing draws nothing', () => {
  const keys = [...Array.from({ length: 500 }, (_, i) => `t${i}`), 't0.label', 'link.0'];
  const links = keys.slice(1).map((k, i) => [keys[Math.floor(i / 3)], k]);
  const marks = drawMarksOf(blockMarks({ shape: shapeOf(keys, links), space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const ids = marks.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(blockMarks({ shape: shapeOf([]), space: SPACE }), []);
});
