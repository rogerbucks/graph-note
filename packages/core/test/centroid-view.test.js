// The cluster-centroid view (editor spec §36, view_types_offered): centroid-view.ts. Each cluster is one circle with its
// members round it, and the links between two clusters are one line. Every mark is inside the space it is given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centroidMarks, shapeClusters } from '../src/view-types/centroid-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 600, height: 400 };

/** A shape of things `[key, kind]` and links `[from, type, to]`. */
const shapeOf = (things, links = []) => ({
  things: things.map(([key, kind = 'Thing']) => ({ key, text: key.toUpperCase(), kinds: [kind] })),
  links: links.map(([from, type, to]) => ({ from, type, to })),
});

// a written cluster team of a and b; c d e linked tightly, f g linked tightly, one link across, and h alone
const SHAPE = shapeOf(
  [['team', 'Cluster'], ['a'], ['b'], ['c'], ['d'], ['e'], ['f'], ['g'], ['h']],
  [
    ['a', 'MEMBER_OF', 'team'],
    ['b', 'MEMBER_OF', 'team'],
    ['c', 'LINKS', 'd'],
    ['d', 'LINKS', 'e'],
    ['e', 'LINKS', 'c'],
    ['f', 'LINKS', 'g'],
    ['e', 'LINKS', 'f'],
    ['a', 'LINKS', 'c'],
  ],
);

test('written clusters come first, then the found ones, and a group of one is not a cluster', () => {
  const clusters = shapeClusters(SHAPE);
  assert.deepEqual(clusters[0], { id: 'team', kind: 'asserted', members: ['a', 'b'] });
  const found = clusters.slice(1);
  assert.ok(found.every((c) => c.kind === 'found' && c.members.length > 1 && c.id === `found:${c.members[0]}`));
  assert.ok(found.some((c) => ['c', 'd', 'e'].every((k) => c.members.includes(k))));
  assert.ok(!found.some((c) => c.members.includes('h')));
});

test('each cluster is one circle with its members round it, and a lone thing is a dot of its own', () => {
  const marks = drawMarksOf(centroidMarks({ shape: SHAPE, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  const centroids = marks.filter((m) => m.style === 'centroid');
  assert.equal(centroids.length, shapeClusters(SHAPE).length);
  const team = centroids.find((m) => m.of === 'team');
  const members = marks.filter((m) => m.group === team.group && m.style === 'member');
  assert.deepEqual(
    members.map((m) => m.of),
    ['a', 'b'],
  );
  assert.ok(marks.some((m) => m.id === 'h' && m.style === 'thing'));
});

test('a thing in two clusters is drawn in both, and links between clusters are one line each', () => {
  const shape = shapeOf(
    [['x', 'Cluster'], ['y', 'Cluster'], ['both'], ['p'], ['q']],
    [
      ['both', 'MEMBER_OF', 'x'],
      ['both', 'MEMBER_OF', 'y'],
      ['p', 'MEMBER_OF', 'x'],
      ['q', 'MEMBER_OF', 'y'],
      ['p', 'LINKS', 'q'],
      ['p', 'CITES', 'q'],
    ],
  );
  const marks = drawMarksOf(centroidMarks({ shape, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  assert.equal(marks.filter((m) => m.of === 'both').length, 2);
  // p to q twice makes one thicker line from x to y; both is in each, but a membership is not a link between them
  const between = marks.filter((m) => m.kind === 'link' && m.id === 'between\nx\ny');
  assert.equal(between.length, 1);
  assert.ok(between[0].lineWidth > 1);
  const ids = marks.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a big graph still fits the space, and a graph with nothing draws nothing', () => {
  const keys = Array.from({ length: 1000 }, (_, i) => [`t${i}`]);
  const links = keys.slice(1).map(([k], i) => [`t${Math.floor(i / 10) * 10}`, 'LINKS', k]);
  const marks = drawMarksOf(centroidMarks({ shape: shapeOf(keys, links), space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  assert.deepEqual(centroidMarks({ shape: shapeOf([]), space: SPACE }), []);
});
