// The ego view (editor spec §36, view_types_offered): ego-view.ts. One thing sits in the middle, with the things one and
// two links away on rings round it. Every mark is inside the space it is given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { busiest, egoMarks, ringsOf } from '../src/view-types/ego-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 400, height: 300 };

/** A shape of things by key and links `[from, to]`. */
const shapeOf = (keys, links = []) => ({
  things: keys.map((key) => ({ key, text: key.toUpperCase(), kinds: ['Thing'] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
});

const middleOf = (m) => [m.x + m.width / 2, m.y + m.height / 2];
const from = ([x, y]) => Math.hypot(x - SPACE.width / 2, y - SPACE.height / 2);

test('the things one and two links away sit on two rings, and the rest are not drawn', () => {
  // a — b — c — d, and e links to a: from a, b and e are one away, c two, d three
  const shape = shapeOf(
    ['a', 'b', 'c', 'd', 'e'],
    [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
      ['e', 'a'],
    ],
  );
  assert.deepEqual([...ringsOf(shape, 'a')].sort(), [
    ['a', 0],
    ['b', 1],
    ['c', 2],
    ['e', 1],
  ]);
  const marks = drawMarksOf(egoMarks({ shape, space: SPACE }, 'a'), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const boxes = new Map(marks.filter((m) => m.kind === 'box').map((m) => [m.id, from(middleOf(m))]));
  assert.deepEqual([...boxes.keys()].sort(), ['a', 'b', 'c', 'e']);
  assert.ok(boxes.get('a') < 1e-6);
  assert.ok(Math.abs(boxes.get('b') - boxes.get('e')) < 1e-6);
  assert.ok(boxes.get('c') > boxes.get('b'));
  // the link to d is not drawn, as d is not
  assert.deepEqual(
    marks.filter((m) => m.kind === 'link').map((m) => `${m.from}-${m.to}`),
    ['a-b', 'b-c', 'e-a'],
  );
});

test('with no middle chosen, or one not in the graph, the busiest thing is the middle', () => {
  const shape = shapeOf(
    ['a', 'b', 'c'],
    [
      ['a', 'b'],
      ['b', 'c'],
    ],
  );
  assert.equal(busiest(shape), 'b');
  for (const middle of [undefined, 'gone']) {
    const box = egoMarks({ shape, space: SPACE }, middle).find((m) => m.kind === 'box' && m.id === 'b');
    assert.ok(from(middleOf(box)) < 1e-6, middle);
  }
});

test('a crowded ring still fits the space, and every mark has its own id', () => {
  const keys = ['hub', ...Array.from({ length: 300 }, (_, i) => `t${i}`), 'hub.label', 'link.0'];
  const links = keys.slice(1).map((k) => ['hub', k]);
  const marks = drawMarksOf(egoMarks({ shape: shapeOf(keys, links), space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const ids = marks.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a graph with nothing draws nothing', () => {
  assert.deepEqual(egoMarks({ shape: shapeOf([]), space: SPACE }), []);
});
