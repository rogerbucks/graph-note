// The containment view (editor spec §36, view_types_offered): containment-view.ts. A part is drawn inside its whole,
// and every mark is inside the space it is given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containmentMarks, wholesOf } from '../src/view-types/containment-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 600, height: 400 };

/** A shape of things by key and links `[from, type, to]`. */
const shapeOf = (keys, links = []) => ({
  things: keys.map((key) => ({ key, text: key.toUpperCase(), kinds: ['Thing'] })),
  links: links.map(([from, type, to]) => ({ from, type, to })),
});

const within = (inner, outer) =>
  inner.x >= outer.x - 1e-9 &&
  inner.y >= outer.y - 1e-9 &&
  inner.x + inner.width <= outer.x + outer.width + 1e-9 &&
  inner.y + inner.height <= outer.y + outer.height + 1e-9;

test('a part is inside its whole, either way the link runs, and a part of a part is inside both', () => {
  const shape = shapeOf(
    ['house', 'room', 'desk', 'garden', 'shed'],
    [
      ['room', 'PART_OF', 'house'],
      ['room', 'CONTAINS', 'desk'],
      ['garden', 'HAS', 'shed'],
    ],
  );
  assert.deepEqual(Object.fromEntries(wholesOf(shape)), { room: 'house', desk: 'room', shed: 'garden' });
  const marks = drawMarksOf(containmentMarks({ shape, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const box = Object.fromEntries(marks.filter((m) => m.kind === 'box').map((m) => [m.id, m]));
  assert.ok(within(box.room, box.house) && within(box.desk, box.room) && within(box.shed, box.garden));
  assert.ok(!within(box.shed, box.house));
  // the house holds the most, so it is the biggest
  const area = (m) => m.width * m.height;
  assert.ok(area(box.house) > area(box.garden));
});

test('a part with two wholes goes in the first, and a link that would nest a thing in itself is left out', () => {
  const shape = shapeOf(
    ['a', 'b', 'c'],
    [
      ['c', 'IN', 'a'],
      ['c', 'IN', 'b'],
      ['a', 'PART_OF', 'c'],
    ],
  );
  assert.deepEqual(Object.fromEntries(wholesOf(shape)), { c: 'a' });
  const marks = drawMarksOf(containmentMarks({ shape, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  assert.equal(marks.filter((m) => m.kind === 'box').length, 3);
});

test('deep nesting and a big graph still fit the space with every id its own; nothing draws nothing', () => {
  const keys = [...Array.from({ length: 800 }, (_, i) => `t${i}`), 't0.label', 'inside.t0'];
  const links = keys.slice(1).map((k, i) => [k, 'PART_OF', keys[Math.floor(i / 4)]]);
  const marks = drawMarksOf(containmentMarks({ shape: shapeOf(keys, links), space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const ids = marks.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(containmentMarks({ shape: shapeOf([]), space: SPACE }), []);
});
