// The treemap view (editor spec §36, view_types_offered): treemap-view.ts. Each group is a rectangle, and so is each
// thing inside it, sized by its links. They are squarified, and every mark is inside the space it is given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squarified, treemapMarks } from '../src/view-types/treemap-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 600, height: 400 };

/** A shape of things `[key, kind]`, links `[from, to]` and drawn groups `[label, keys]`. */
const shapeOf = (things, links = [], groups) => ({
  things: things.map(([key, kind = 'Thing']) => ({ key, text: key.toUpperCase(), kinds: [kind] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
  ...(groups ? { groups } : {}),
});

const area = (r) => r.width * r.height;

test('squarified rectangles fill the space, each with its share of the area', () => {
  const rect = { x: 0, y: 0, width: 600, height: 400 };
  const areas = [6, 6, 4, 3, 2, 2, 1];
  const out = squarified(areas, rect);
  const total = areas.reduce((a, b) => a + b, 0);
  out.forEach((r, i) => assert.ok(Math.abs(area(r) - (areas[i] / total) * 240000) < 1e-6));
  assert.ok(out.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.width <= 600 + 1e-9 && r.y + r.height <= 400 + 1e-9));
  // squarified keeps them near square: none is more than four times as long as it is wide
  assert.ok(out.every((r) => Math.max(r.width / r.height, r.height / r.width) < 4));
});

test('with no groups drawn, each kind is a group, and a busier thing gets more room', () => {
  const shape = shapeOf(
    [
      ['a', 'Person'],
      ['b', 'Person'],
      ['c', 'Place'],
      ['d', 'Place'],
    ],
    [
      ['a', 'b'],
      ['a', 'c'],
      ['a', 'd'],
    ],
  );
  const marks = drawMarksOf(treemapMarks({ shape, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  assert.deepEqual(
    marks.filter((m) => m.kind === 'group').map((m) => m.name),
    ['Person', 'Place'],
  );
  const box = (k) => marks.find((m) => m.kind === 'box' && m.id === k);
  assert.ok(area(box('a')) > area(box('b')));
  assert.equal(box('a').group, box('b').group);
  assert.notEqual(box('a').group, box('c').group);
});

test('the groups the graph draws come first, and a thing in two goes in the first', () => {
  const shape = shapeOf(
    [['a'], ['b'], ['c'], ['d']],
    [],
    [
      ['Team', ['a', 'b']],
      ['Guests', ['b', 'c']],
    ],
  );
  const marks = treemapMarks({ shape, space: SPACE });
  const groups = marks.filter((m) => m.kind === 'group');
  assert.deepEqual(
    groups.map((m) => m.name),
    ['Team', 'Guests', 'Thing'],
  );
  const inGroup = (g) => marks.filter((m) => m.kind === 'box' && m.group === g.id).map((m) => m.id);
  assert.deepEqual(groups.map(inGroup), [['a', 'b'], ['c'], ['d']]);
});

test('a big graph still fits the space, and a graph with nothing draws nothing', () => {
  const things = Array.from({ length: 2000 }, (_, i) => [`t${i}`, `K${i % 30}`]);
  const links = things.slice(1).map(([k], i) => [`t${i}`, k]);
  const marks = drawMarksOf(treemapMarks({ shape: shapeOf(things, links), space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  assert.equal(marks.filter((m) => m.kind === 'box').length, 2000);
  assert.deepEqual(treemapMarks({ shape: shapeOf([]), space: SPACE }), []);
});

test('keys that look like the ids of names or groups still give every mark its own id', () => {
  const marks = treemapMarks({ shape: shapeOf([['a'], ['a.label'], ['group.0'], ['group.0.label']]), space: SPACE });
  const ids = marks.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, ids.join(' | '));
});
