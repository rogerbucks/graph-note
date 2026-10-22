// The project plan view (editor spec §36, view_types_offered): plan-view.ts. Each thing is a row. A thing with dates is
// a bar from its start to its end. Every mark is inside the space it is given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMarks, spanOf } from '../src/view-types/plan-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 800, height: 300 };

/** A thing with `dates`, by property, in the order written; its first date is its date. */
const thing = (key, dates = {}) => {
  const map = new Map(Object.entries(dates));
  return {
    key,
    text: key.toUpperCase(),
    kinds: ['Task'],
    ...(map.size ? { date: [...map.values()][0], dates: map } : {}),
  };
};
const shapeOf = (things, links = []) => ({ things, links: links.map(([from, to]) => ({ from, type: 'BEFORE', to })) });

test('a start and an end come from start, end or due, else from the dates in order', () => {
  assert.deepEqual(spanOf(thing('a', { start: '2026-11-02', end: '2026-11-06' })), ['2026-11-02', '2026-11-06']);
  assert.deepEqual(spanOf(thing('b', { due: '2026-11-09', start: '2026-11-03' })), ['2026-11-03', '2026-11-09']);
  assert.deepEqual(spanOf(thing('c', { opened: '2026-11-01', closed: '2026-11-04' })), ['2026-11-01', '2026-11-04']);
  assert.deepEqual(spanOf(thing('d', { on: '2026-11-05T10:00:00Z' })), ['2026-11-05', '2026-11-05']);
  assert.equal(spanOf(thing('e')), null);
});

test('bars run from start to end, rows go by start, a milestone is a diamond and the undated come last', () => {
  const shape = shapeOf(
    [
      thing('later', { start: '2026-11-05', end: '2026-11-08' }),
      thing('loose'),
      thing('first', { start: '2026-11-01', end: '2026-11-04' }),
      thing('launch', { on: '2026-11-09' }),
    ],
    [
      ['first', 'later'],
      ['later', 'launch'],
      ['first', 'loose'],
    ],
  );
  const marks = drawMarksOf(planMarks({ shape, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const names = marks.filter((m) => m.kind === 'label');
  assert.deepEqual(
    names.map((m) => m.text),
    ['FIRST', 'LATER', 'LAUNCH', 'LOOSE'],
  );
  const box = Object.fromEntries(marks.filter((m) => m.kind === 'box').map((m) => [m.id, m]));
  assert.deepEqual(Object.keys(box).sort(), ['first', 'later', 'launch']);
  assert.ok(box.first.x + box.first.width <= box.later.x + 1e-9, 'first ends before later starts');
  assert.ok(Math.abs(box.later.width / box.first.width - 1) < 1e-9, 'four days each');
  assert.equal(box.launch.shape, 'diamond');
  assert.equal(box.first.shape, undefined);
  // the link to the undated thing has no bar to reach, so it is not drawn
  assert.deepEqual(
    marks.filter((m) => m.kind === 'link').map((m) => `${m.from}-${m.to}`),
    ['first-later', 'later-launch'],
  );
});

test('a plan with no dates lists its things, and a graph with nothing draws nothing', () => {
  const marks = drawMarksOf(
    planMarks({ shape: shapeOf([thing('a'), thing('b.label'), thing('b')]), space: SPACE }),
    SPACE,
  );
  assert.ok(Array.isArray(marks), marks);
  assert.equal(marks.filter((m) => m.kind === 'label').length, 3);
  assert.deepEqual(planMarks({ shape: shapeOf([]), space: SPACE }), []);
});
