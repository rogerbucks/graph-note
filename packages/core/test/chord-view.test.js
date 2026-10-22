// The chord view (editor spec §36, view_types_offered): chord-view.ts. Each thing sits on a circle, a kind's things
// side by side. Each link is a curve across the middle, and every mark is inside the space it is given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chordMarks } from '../src/view-types/chord-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 500, height: 400 };

/** A shape of things `[key, kind]` and links `[from, to]`. */
const shapeOf = (things, links = []) => ({
  things: things.map(([key, kind = 'Thing']) => ({ key, text: key.toUpperCase(), kinds: [kind] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
});

/** How far a box's middle is from the space's middle. */
const fromMiddle = (m) => Math.hypot(m.x + m.width / 2 - 250, m.y + m.height / 2 - 200);

test('each thing sits on one circle, a kind together, and each link is a curve', () => {
  const shape = shapeOf(
    [
      ['a', 'Person'],
      ['c', 'Place'],
      ['b', 'Person'],
    ],
    [
      ['a', 'c'],
      ['b', 'c'],
    ],
  );
  const marks = drawMarksOf(chordMarks({ shape, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const boxes = marks.filter((m) => m.kind === 'box');
  // the Person things come first, side by side, then the Place
  assert.deepEqual(
    boxes.map((m) => m.id),
    ['a', 'b', 'c'],
  );
  const radii = boxes.map(fromMiddle);
  assert.ok(radii.every((d) => Math.abs(d - radii[0]) < 1e-6));
  const links = marks.filter((m) => m.kind === 'link');
  assert.deepEqual(
    links.map((m) => [m.from, m.to, m.curve, m.points.length]),
    [
      ['a', 'c', true, 4],
      ['b', 'c', true, 4],
    ],
  );
  assert.ok(marks.some((m) => m.kind === 'label' && m.text === 'A'));
});

test('a big graph names its kinds rather than each thing, and still fits the space', () => {
  const things = Array.from({ length: 500 }, (_, i) => [`t${i}`, `K${i % 5}`]);
  const links = things.slice(1).map(([k], i) => [`t${i}`, k]);
  const marks = drawMarksOf(chordMarks({ shape: shapeOf(things, links), space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  assert.deepEqual(
    marks.filter((m) => m.kind === 'label').map((m) => m.text),
    ['K0', 'K1', 'K2', 'K3', 'K4'],
  );
});

test('a graph with nothing draws nothing, and a link to a thing not drawn draws no curve', () => {
  assert.deepEqual(chordMarks({ shape: shapeOf([]), space: SPACE }), []);
  const marks = chordMarks({ shape: shapeOf([['a']], [['a', 'gone']]), space: SPACE });
  assert.equal(marks.filter((m) => m.kind === 'link').length, 0);
});

test('keys that look like the ids of names or links still give every mark its own id', () => {
  const things = [['a'], ['a.label'], ['link.0'], ['kind.0.label']];
  const marks = chordMarks({ shape: shapeOf(things, [['a', 'link.0']]), space: SPACE });
  const ids = marks.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, ids.join(' | '));
});
