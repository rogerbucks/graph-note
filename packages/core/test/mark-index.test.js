// Finding the marks on screen fast (editor spec §53, scale_overview): mark-index.ts. A view gives back only the marks
// it touches, in drawing order, and leaves out text too small to read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarkIndex, TEXT_LEAST } from '../src/mark-index.ts';

/** A grid of `n` by `n` boxes, 10 pixels wide, 20 apart, each with a label of `size`. */
function grid(n, size = 8) {
  const marks = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const id = `b${x}_${y}`;
      marks.push({ id, kind: 'box', style: 'thing', x: x * 20, y: y * 20, width: 10, height: 10 });
      marks.push({
        id: `${id}:t`,
        kind: 'label',
        style: 'thing.name',
        x: x * 20 + 5,
        y: y * 20 + 9,
        text: id,
        size,
        anchor: 'middle',
        maxWidth: 10,
      });
    }
  return { space: { width: n * 20, height: n * 20 }, marks };
}

test('a view gives back only the marks it touches, in drawing order', () => {
  const index = new MarkIndex(grid(10));
  const ids = index.inView({ x: 15, y: 15, width: 30, height: 10 }).map((i) => index.marks[i].id);
  assert.deepEqual(ids, ['b1_1', 'b1_1:t', 'b2_1', 'b2_1:t']);
  assert.deepEqual(index.inView({ x: 500, y: 500, width: 10, height: 10 }), []);
});

test('the whole space gives back every mark, once each', () => {
  const index = new MarkIndex(grid(30));
  const all = index.inView({ x: 0, y: 0, width: 600, height: 600 });
  assert.equal(all.length, 1800);
  assert.equal(new Set(all).size, 1800);
});

test('a long link is found from any view it crosses', () => {
  const { space, marks } = grid(30);
  marks.push({
    id: 'long',
    kind: 'link',
    style: 'link',
    points: [
      [0, 0],
      [599, 599],
    ],
    z: -1,
  });
  const index = new MarkIndex({ space, marks });
  assert.equal(index.marks[0].id, 'long', 'a lower order is drawn first');
  for (const at of [0, 300, 590]) assert.ok(index.inView({ x: at, y: at, width: 5, height: 5 }).includes(0), `${at}`);
  assert.ok(!index.inView({ x: 300, y: 650, width: 5, height: 5 }).includes(0), 'nor from a view past its ends');
});

test('text too small to read at the scale is left out, the boxes kept', () => {
  const index = new MarkIndex(grid(4, 8));
  const view = { x: 0, y: 0, width: 80, height: 80 };
  assert.equal(index.visible(view, 1).length, 32, 'at scale 1, 8 pixel text is read');
  const far = index.visible(view, (TEXT_LEAST - 1) / 8);
  assert.equal(far.length, 16);
  assert.ok(far.every((m) => m.kind === 'box'));
  assert.equal(index.visible(view, 0.05).length, 0, 'under a pixel, nothing is drawn');
});

test('a view of 50,000 marks gives back only what is on screen', () => {
  const index = new MarkIndex(grid(160));
  // a screen of 1000 by 600 pixels, at scale 1, near the middle
  const shown = index.visible({ x: 1000, y: 1000, width: 1000, height: 600 }, 1);
  assert.ok(shown.length <= 2 * 51 * 31, `${shown.length} marks`);
  assert.ok(shown.length >= 2 * 50 * 30, `${shown.length} marks`);
});
