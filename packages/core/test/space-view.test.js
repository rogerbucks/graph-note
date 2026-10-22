// The 3D view's numbers (editor spec §53, scale_space_view): space-view.ts. Marks are lifted into blocks with floors
// and heights. Links rise in arcs between the blocks they join. The camera shows the drawing the way up it reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOOR_GAP,
  LABELS_MOST,
  blockAt,
  labelsOnScreen,
  orbitBy,
  orbitFit,
  projectPoint,
  spaceMatrix,
  spaceOf,
  zoomBy,
} from '../src/space-view.ts';
import { overviewOf } from '../src/overview.ts';

/** Two groups, one inside the other, with a thing in each and a link between the things. */
const NESTED = [
  { id: 'g:outer', kind: 'group', style: 'group', x: 0, y: 0, width: 400, height: 300 },
  { id: 'g:inner', kind: 'group', style: 'group', group: 'g:outer', x: 20, y: 20, width: 200, height: 150 },
  { id: 't:a', kind: 'box', style: 'thing', of: 'a', group: 'g:outer', x: 300, y: 200, width: 60, height: 40 },
  { id: 't:b', kind: 'box', style: 'thing', of: 'b', group: 'g:inner', x: 40, y: 40, width: 60, height: 40 },
  {
    id: 'e:ab',
    kind: 'link',
    style: 'link',
    from: 'a',
    to: 'b',
    points: [
      [330, 220],
      [70, 60],
    ],
  },
  { id: 'l:b', kind: 'label', style: 'thing.name', of: 'b', x: 70, y: 64, text: 'b', size: 14, anchor: 'middle' },
];

const block = (space, id) => space.blocks.find((b) => b.id === id);

test('by group, a nested group stands a floor higher and each thing stands on its own group', () => {
  const space = spaceOf(NESTED, { by: 'group' });
  const outer = block(space, 'g:outer'),
    inner = block(space, 'g:inner'),
    a = block(space, 't:a'),
    b = block(space, 't:b');
  assert.equal(outer.floor, 0);
  assert.equal(inner.floor, FLOOR_GAP);
  assert.equal(a.floor, outer.floor + outer.tall);
  assert.equal(b.floor, inner.floor + inner.tall);
  // the page's down is the space's back: a box keeps its size, flipped along
  assert.deepEqual([b.x, b.y, b.width, b.depth], [40, -80, 60, 40]);
});

test('a link runs from the top of one block to the top of the other, rising in an arc between', () => {
  const space = spaceOf(NESTED, { by: 'group' });
  const a = block(space, 't:a'),
    b = block(space, 't:b');
  const [line] = space.lines;
  const first = line.points[0],
    last = line.points.at(-1),
    middle = line.points[Math.floor(line.points.length / 2)];
  assert.equal(first[2], a.floor + a.tall);
  assert.equal(last[2], b.floor + b.tall);
  assert.ok(middle[2] > (first[2] + last[2]) / 2, 'the arc rises above the straight line between the ends');
  assert.deepEqual([first[0], first[1]], [330, -220]);
});

test('a label floats just above the block of the thing it names', () => {
  const space = spaceOf(NESTED, { by: 'group' });
  const b = block(space, 't:b');
  const [label] = space.labels;
  assert.ok(label.at[2] > b.floor + b.tall);
  assert.deepEqual([label.at[0], label.at[1]], [70, -64]);
});

test('by size, the overview is a city: each group as tall as its count of things', () => {
  const groups = [
    { id: 'group:a', label: 'A', by: 'links', keys: Array.from({ length: 400 }, (_, i) => `a${i}`) },
    { id: 'group:b', label: 'B', by: 'links', keys: Array.from({ length: 100 }, (_, i) => `b${i}`) },
  ];
  const laid = overviewOf({ by: 'links', groups, between: [{ from: 0, to: 1, links: 3 }] });
  const sizes = new Map(groups.map((g) => [g.id, g.keys.length]));
  const space = spaceOf(laid.marks, { by: 'size', sizes });
  const a = block(space, 'group:a'),
    b = block(space, 'group:b');
  assert.equal(a.floor, 0);
  assert.ok(Math.abs(a.tall / b.tall - 4) < 1e-9, 'four times the things, four times as tall');
  assert.equal(space.lines.length, 1);
  assert.ok(space.labels.every((l) => l.at[2] > 0));
  assert.ok(space.most[2] >= a.tall);
});

test('the fitted camera shows the whole drawing, the way up it reads on the page', () => {
  const space = spaceOf(NESTED, { by: 'group' });
  const orbit = { ...orbitFit(space, 1), tilt: Math.PI / 2 - 0.02 };
  const m = spaceMatrix(orbit, 1, 1000);
  const topLeft = projectPoint(m, [0, 0, 0], 500, 500),
    bottomRight = projectPoint(m, [400, -300, 0], 500, 500);
  for (const p of [topLeft, bottomRight]) {
    assert.ok(p.x > 0 && p.x < 500 && p.y > 0 && p.y < 500, `on screen: ${JSON.stringify(p)}`);
  }
  assert.ok(topLeft.x < bottomRight.x, 'left stays left');
  assert.ok(topLeft.y < bottomRight.y, 'the top of the page stays at the top of the screen');
});

test('a point behind the camera has no place on the screen', () => {
  const orbit = { target: [0, 0, 0], distance: 100, turn: 0, tilt: 0.5 };
  const m = spaceMatrix(orbit, 1, 100);
  assert.equal(projectPoint(m, [1000, 0, 600], 400, 400), null);
});

test('a drag turns and tilts the camera, never under the floor; zooming never passes the target', () => {
  const orbit = { target: [0, 0, 0], distance: 100, turn: 0, tilt: 0.5 };
  const turned = orbitBy(orbit, 100, 0);
  assert.notEqual(turned.turn, orbit.turn);
  assert.equal(turned.tilt, orbit.tilt);
  assert.ok(orbitBy(orbit, 0, -100000).tilt > 0, 'never under the floor');
  assert.ok(orbitBy(orbit, 0, 100000).tilt < Math.PI / 2, 'never straight down');
  assert.equal(zoomBy(orbit, 2).distance, 50);
  assert.ok(zoomBy(orbit, 1e9).distance >= 1);
});

test('labels on screen are the nearest ones big enough to read, at most a set number', () => {
  const marks = [];
  for (let i = 0; i < 300; i++)
    marks.push({
      id: `l${i}`,
      kind: 'label',
      style: 'thing.name',
      x: (i % 20) * 30,
      y: Math.floor(i / 20) * 30,
      text: `${i}`,
      size: 12,
      anchor: 'middle',
    });
  marks.push({
    id: 'tiny',
    kind: 'label',
    style: 'thing.name',
    x: 300,
    y: 200,
    text: 'tiny',
    size: 0.01,
    anchor: 'middle',
  });
  const space = spaceOf(marks, { by: 'group' });
  const orbit = orbitFit(space, 1);
  const m = spaceMatrix(orbit, 1, 1000);
  const shown = labelsOnScreen(space, m, 800, 800);
  assert.ok(shown.length > 0 && shown.length <= LABELS_MOST);
  assert.ok(!shown.some((l) => l.id === 'tiny'), 'too small to read is left out');
  assert.ok(shown.every((l) => l.size >= 6));
  // nearest first: from the front, the page's lower rows are nearer
  const rowOf = (l) => Math.floor(Number(l.id.slice(1)) / 20);
  assert.ok(rowOf(shown[0]) >= rowOf(shown.at(-1)));
});

test('a click picks the nearest block whose top is under it', () => {
  const space = spaceOf(NESTED, { by: 'group' });
  const orbit = { ...orbitFit(space, 1), tilt: Math.PI / 2 - 0.02 };
  const m = spaceMatrix(orbit, 1, 1000);
  const b = block(space, 't:b');
  const centre = projectPoint(m, [b.x + b.width / 2, b.y + b.depth / 2, b.floor + b.tall], 500, 500);
  assert.equal(blockAt(space, m, 500, 500, centre.x, centre.y)?.id, 't:b', 'the thing on top, not its groups');
  assert.equal(blockAt(space, m, 500, 500, 1, 1), null);
});
