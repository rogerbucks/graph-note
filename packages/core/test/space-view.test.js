// The 3D view's numbers (editor spec §53, scale_space_view): space-view.ts. Marks are lifted into blocks with floors
// and heights. Links rise in arcs between the blocks they join. The camera shows the drawing the way up it reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOOR_GAP,
  centredOn,
  middleOf,
  orbitBy,
  orbitFit,
  projectPoint,
  spaceMatrix,
  spaceOf,
  zoomBy,
} from '../src/space-view.ts';
import { blockAt } from '../src/space-pick.ts';
import { overviewOf } from '../src/overview.ts';
import { arrowsOnScreen, pickedRing } from '../src/space-labels.ts';

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

test('a drag turns and tilts the camera right round, with no way locked; zooming never passes the target', () => {
  // Roger, 24 Oct 2026: "if I want to rotate right around, I should be able to"
  const orbit = { target: [0, 0, 0], distance: 100, turn: 0, tilt: 0.5 };
  const turned = orbitBy(orbit, 100, 0);
  assert.notEqual(turned.turn, orbit.turn);
  assert.equal(turned.tilt, orbit.tilt);
  assert.ok(orbitBy(orbit, 0, -400).tilt < 0, 'under the floor');
  const over = orbitBy(orbit, 0, 400);
  assert.ok(over.tilt > Math.PI / 2, 'over the top');
  // a point above the target stays above it on the screen all the way over the top: the view never flips
  let last = null;
  for (let tilt = 0.2; tilt < Math.PI - 0.2; tilt += 0.05) {
    const m = spaceMatrix({ ...orbit, tilt }, 1, 100);
    assert.ok(m.every(Number.isFinite), `a camera at tilt ${tilt.toFixed(2)} sees`);
    const p = projectPoint(m, [10, 0, 0], 400, 400);
    if (last) assert.ok(Math.hypot(p.x - last.x, p.y - last.y) < 40, `no jump at tilt ${tilt.toFixed(2)}`);
    last = p;
  }
  assert.equal(zoomBy(orbit, 2).distance, 50);
  assert.ok(zoomBy(orbit, 1e9).distance >= 1);
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

test('a click on the side of a tall block picks it too, not only its top', () => {
  const marks = [{ id: 't:tower', kind: 'box', style: 'thing', of: 'tower', x: 0, y: 0, width: 60, height: 60 }];
  const space = spaceOf(marks, { by: 'size', sizes: new Map([['tower', 10]]) });
  const b = block(space, 't:tower');
  const orbit = { ...orbitFit(space, 1), tilt: 0.3 };
  const m = spaceMatrix(orbit, 1, 1000);
  // the middle of the side facing the camera, half way up: the camera looks from the page's bottom, so the front is y
  const side = projectPoint(m, [b.x + b.width / 2, b.y, b.floor + b.tall / 2], 500, 500);
  const top = projectPoint(m, [b.x + b.width / 2, b.y + b.depth / 2, b.floor + b.tall], 500, 500);
  assert.ok(Math.abs(side.y - top.y) > 20, 'the side is well below the top on screen');
  assert.equal(blockAt(space, m, 500, 500, side.x, side.y)?.id, 't:tower');
});

test('an arrowhead is never bigger than the block it points to, however long its link', () => {
  // Roger, 24 Oct 2026: block diagrams in 3D had arrowheads far bigger than their blocks
  const far = [
    { id: 't:a', kind: 'box', style: 'thing', of: 'a', x: 0, y: 0, width: 60, height: 40 },
    { id: 't:b', kind: 'box', style: 'thing', of: 'b', x: 1400, y: 0, width: 24, height: 16 },
    {
      id: 'e:ab',
      kind: 'link',
      style: 'link',
      from: 'a',
      to: 'b',
      points: [
        [60, 20],
        [1400, 8],
      ],
    },
  ];
  const space = spaceOf(far, { by: 'group' });
  const b = block(space, 't:b');
  const [arrow] = space.arrows;
  assert.ok(arrow.size <= Math.min(b.width, b.depth) / 2, `${arrow.size} long, on a block ${b.width} by ${b.depth}`);
  const orbit = orbitFit(space);
  const m = spaceMatrix(orbit, 1, 4000);
  const [shown] = arrowsOnScreen(space, m, 800, 800);
  const mid = { x: (shown.left.x + shown.right.x) / 2, y: (shown.left.y + shown.right.y) / 2 };
  const long = Math.hypot(shown.tip.x - mid.x, shown.tip.y - mid.y);
  const corner = (x, y) => projectPoint(m, [x, y, b.floor + b.tall], 800, 800);
  const p = corner(b.x, b.y),
    q = corner(b.x + b.width, b.y);
  const across = Math.max(9, Math.hypot(p.x - q.x, p.y - q.y));
  assert.ok(long <= across + 0.5, `the head is ${long.toFixed(1)} pixels on a block ${across.toFixed(1)} across`);
});

test('the thing picked has a ring round all of it, seen from any side, over the top too', () => {
  // Roger, 24 Oct 2026: "the selected item in the 3d view should be clearly selected"
  const space = spaceOf(NESTED, { by: 'group' });
  const b = block(space, 't:b');
  const fit = orbitFit(space);
  for (const turn of [0, 1, 2.5, 4])
    for (const tilt of [-0.6, 0.3, 1.2, 2.2]) {
      const m = spaceMatrix({ ...fit, turn, tilt }, 1, 4000);
      const ring = pickedRing(space, b, m, 600, 600);
      assert.ok(ring, `a ring at turn ${turn}, tilt ${tilt}`);
      for (const [i, j, k] of [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => [i, j, k])))) {
        const c = projectPoint(m, [b.x + i * b.width, b.y + j * b.depth, b.floor + k * b.tall], 600, 600);
        assert.ok(Math.hypot(c.x - ring.x, c.y - ring.y) < ring.r, `corner ${i}${j}${k} inside the ring`);
      }
    }
});

test('after a redraw the camera centres on the thing picked again, keeping its turn, tilt and distance', () => {
  // Roger, 24 Oct 2026: the 3D view should keep its centre on the selected item even after a redraw
  const orbit = { target: [0, 0, 0], distance: 300, turn: 1, tilt: 0.7 };
  const moved = spaceOf(
    NESTED.map((m) => (m.id === 't:b' ? { ...m, x: 120, y: 90 } : m)),
    { by: 'group' },
  );
  const b = block(moved, 't:b');
  assert.deepEqual(centredOn(orbit, b), { ...orbit, target: middleOf(b) });
  assert.deepEqual(centredOn(orbit, null), orbit, 'nothing picked: the camera stays');
});
