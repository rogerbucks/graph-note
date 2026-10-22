// A thing in several clusters is drawn once in each region it belongs to, with a shared marker (editor spec §36,
// multi_member_drawn). This holds in the cluster-centroid view and in the containment view, which never assumes a
// single parent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centroidMarks } from '../src/view-types/centroid-view.ts';
import { containmentMarks } from '../src/view-types/containment-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 600, height: 400 };

/** A shape of things `[key, kind]` and links `[from, type, to]`. */
const shapeOf = (things, links) => ({
  things: things.map(([key, kind = 'Thing']) => ({ key, text: key.toUpperCase(), kinds: [kind] })),
  links: links.map(([from, type, to]) => ({ from, type, to })),
});

/** The region each box sits in, and its style, for every box of `key`. */
const placesOf = (marks, key) => marks.filter((m) => m.kind === 'box' && m.of === key).map((m) => [m.group, m.style]);

test('in the cluster-centroid view, a thing in two clusters is in both regions with the same marker', () => {
  const shape = shapeOf(
    [['red', 'Cluster'], ['blue', 'Cluster'], ['both'], ['r'], ['b']],
    [
      ['both', 'MEMBER_OF', 'red'],
      ['both', 'MEMBER_OF', 'blue'],
      ['r', 'MEMBER_OF', 'red'],
      ['b', 'MEMBER_OF', 'blue'],
    ],
  );
  const marks = drawMarksOf(centroidMarks({ shape, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  assert.deepEqual(placesOf(marks, 'both'), [
    ['cluster\nred', 'member.shared'],
    ['cluster\nblue', 'member.shared'],
  ]);
  // a thing in one cluster has no shared marker
  assert.deepEqual(placesOf(marks, 'r'), [['cluster\nred', 'member']]);
});

test('in the containment view, a part with two wholes is inside each with the same marker', () => {
  const shape = shapeOf(
    [['kitchen'], ['garage'], ['door'], ['sink']],
    [
      ['door', 'PART_OF', 'kitchen'],
      ['door', 'PART_OF', 'garage'],
      ['kitchen', 'HAS', 'sink'],
    ],
  );
  const marks = drawMarksOf(containmentMarks({ shape, space: SPACE }), SPACE);
  assert.ok(Array.isArray(marks), marks);
  assert.deepEqual(placesOf(marks, 'door'), [
    ['inside\nkitchen', 'thing.shared'],
    ['inside\ngarage', 'thing.shared'],
  ]);
  assert.deepEqual(placesOf(marks, 'sink'), [['inside\nkitchen', 'thing']]);
});
