// The names in the 3D view (editor spec §53, scale_space_labels): space-labels.ts. A name is never dropped for being
// small. It is painted at a readable size, facing the camera. The picked thing's name comes first, then those
// nearest where you look, and no name covers another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LABELS_MOST, READABLE_LEAST, READABLE_MOST, labelsOnScreen } from '../src/space-labels.ts';
import { orbitFit, spaceMatrix, spaceOf, zoomBy } from '../src/space-view.ts';

/** A grid of `count` things, 20 a row, each a box with its name in a small font, as Graphviz draws 9-pixel names. */
function grid(count, size = 9) {
  const marks = [];
  for (let i = 0; i < count; i++) {
    const x = (i % 20) * 120,
      y = Math.floor(i / 20) * 80;
    marks.push({ id: `t:${i}`, kind: 'box', style: 'thing', of: `${i}`, x, y, width: 90, height: 40 });
    marks.push({
      id: `l:${i}`,
      kind: 'label',
      style: 'thing.name',
      of: `${i}`,
      x: x + 45,
      y: y + 20,
      text: `Thing ${i}`,
      size,
      anchor: 'middle',
    });
  }
  return spaceOf(marks, { by: 'group' });
}

/** The labels on a screen `w` by `h`, with the whole of `space` in view, zoomed in `times`. */
function shownOf(space, w, h, times = 1, picked) {
  const orbit = zoomBy(orbitFit(space, w / h), times);
  return labelsOnScreen(space, spaceMatrix(orbit, w / h, 4000), w, h, picked === undefined ? {} : { picked });
}

/** Whether two labels' boxes, estimated as the painter will paint them, overlap. */
const overlap = (a, b) => {
  const half = (l) => (l.text.length * l.size * 0.56) / 2;
  return Math.abs(a.x - b.x) < half(a) + half(b) && Math.abs(a.y - b.y) < (a.size + b.size) / 2;
};

test('with the whole graph in view, names still show, at a size people can read', () => {
  const shown = shownOf(grid(200), 400, 640);
  assert.ok(shown.length >= 5, `only ${shown.length} names shown`);
  assert.ok(shown.length <= LABELS_MOST);
  assert.ok(shown.every((l) => l.size >= READABLE_LEAST && l.size <= READABLE_MOST));
});

test('no name covers another, and zooming in shows more names', () => {
  const space = grid(200);
  const far = shownOf(space, 800, 600),
    near = shownOf(space, 800, 600, 3);
  for (const list of [far, near])
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        assert.ok(!overlap(list[i], list[j]), `${list[i].text} / ${list[j].text}`);
  assert.ok(near.length > far.length, `${near.length} near, ${far.length} far`);
});

test('the names nearest the middle of the screen come first', () => {
  const shown = shownOf(grid(200), 800, 600);
  const off = (l) => Math.hypot(l.x - 400, l.y - 300);
  assert.ok(off(shown[0]) < off(shown.at(-1)));
});

test('the picked thing always has its name shown, first and at least a set size', () => {
  const space = grid(400);
  // a thing in a far corner, whose name loses to many nearer ones
  const shown = shownOf(space, 400, 300, 1, '19');
  assert.equal(shown[0]?.id, 'l:19');
  assert.equal(shown[0]?.picked, true);
  assert.ok(shown[0].size >= 14);
  assert.ok(!shown.slice(1).some((l) => l.picked));
});

test('a long name ends in "…"', () => {
  const marks = [
    { id: 't:a', kind: 'box', style: 'thing', of: 'a', x: 0, y: 0, width: 90, height: 40 },
    {
      id: 'l:a',
      kind: 'label',
      style: 'thing.name',
      of: 'a',
      x: 45,
      y: 20,
      text: 'x'.repeat(80),
      size: 9,
      anchor: 'middle',
    },
  ];
  const [l] = shownOf(spaceOf(marks, { by: 'group' }), 800, 600);
  assert.equal(l.text.length, 32);
  assert.ok(l.text.endsWith('…'));
});
