// The density view (editor spec §36, view_types_offered): density-view.ts. The space is cut into squares, and each
// square with things in it is shaded by how many. Every mark is inside the space it is given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHADES, densityMarks } from '../src/view-types/density-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 600, height: 400 };

/** A shape of things by key and links `[from, to]`. */
const shapeOf = (keys, links = []) => ({
  things: keys.map((key) => ({ key, text: key, kinds: ['Thing'] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
});

test('every thing is counted in one square, and the most crowded square has the darkest shade', () => {
  // a tight star of 40 round one hub, and 20 things linked in a loose line
  const star = Array.from({ length: 40 }, (_, i) => `s${i}`);
  const line = Array.from({ length: 20 }, (_, i) => `l${i}`);
  const links = [...star.map((k) => ['hub', k]), ...line.slice(1).map((k, i) => [line[i], k]), ['hub', 'l0']];
  const marks = drawMarksOf(densityMarks({ shape: shapeOf(['hub', ...star, ...line], links), space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  assert.ok(marks.every((m) => m.kind === 'box' && m.role === 'group'));
  const counts = marks.map((m) => Number(m.name.match(/\d+/)[0]));
  assert.equal(
    counts.reduce((a, b) => a + b, 0),
    61,
  );
  const darkest = marks[counts.indexOf(Math.max(...counts))];
  assert.equal(darkest.style, `density.${SHADES - 1}`);
  assert.ok(marks.some((m) => m.style !== darkest.style));
  const ids = marks.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a big graph still fits the space, and a graph with nothing draws nothing', () => {
  const keys = Array.from({ length: 3000 }, (_, i) => `t${i}`);
  const links = keys.slice(1).map((k, i) => [keys[Math.floor(i / 4)], k]);
  const marks = drawMarksOf(densityMarks({ shape: shapeOf(keys, links), space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  assert.ok(marks.length > 1 && marks.length <= 24 * 16);
  assert.deepEqual(densityMarks({ shape: shapeOf([]), space: SPACE }), []);
});
