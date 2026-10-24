// The 3D view laid out in space (editor spec §53, space_spread): space-spread.ts. Also its arrowheads on screen
// (space-labels.ts, arrowsOnScreen) and picking a ball (space-pick.ts). Balls sized by links, links that end in
// arrowheads on the ball they point to, and words at the middle of each link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radiusOf, spreadSpace } from '../src/space-spread.ts';
import { arrowsOnScreen, labelsOnScreen } from '../src/space-labels.ts';
import { blockAt } from '../src/space-pick.ts';
import { orbitFit, projectPoint, spaceMatrix } from '../src/space-view.ts';

/** A box mark for thing `key`, as svg-marks.ts reads one, with its name's label. */
const thing = (key) => [
  { id: `t:${key}`, kind: 'box', style: 'svg.0', of: key, x: 0, y: 0, width: 80, height: 30 },
  {
    id: `l:${key}`,
    kind: 'label',
    style: 'svg.0',
    of: key,
    x: 40,
    y: 15,
    text: key.toUpperCase(),
    size: 14,
    anchor: 'middle',
  },
];
/** A link mark from `from` to `to`, saying `name`. */
const link = (id, from, to, name) => ({
  id,
  kind: 'link',
  style: 'svg.1',
  points: [
    [0, 0],
    [1, 1],
  ],
  from,
  to,
  name,
});

// a hub with four spokes, and a link back from one spoke to the hub
const MARKS = [
  ...['hub', 'a', 'b', 'c', 'd'].flatMap(thing),
  link('e:1', 'hub', 'a', 'OWNS'),
  link('e:2', 'hub', 'b', 'OWNS'),
  link('e:3', 'hub', 'c', 'OWNS'),
  link('e:4', 'hub', 'd', 'OWNS'),
  link('e:5', 'a', 'hub', 'REPORTS_TO'),
];

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const centreOf = (b) => [b.x + b.width / 2, b.y + b.depth / 2, b.floor + b.tall / 2];

test('each thing is one ball, and a ball with more links is larger', () => {
  const { space, spots } = spreadSpace(MARKS);
  assert.equal(space.round, true);
  assert.deepEqual(
    space.blocks.map((b) => b.of),
    ['hub', 'a', 'b', 'c', 'd'],
  );
  for (const b of space.blocks) assert.ok(b.width === b.depth && b.depth === b.tall, 'a ball fits a cube');
  const size = (key) => space.blocks.find((b) => b.of === key).width;
  assert.ok(size('hub') > size('a') && size('a') > size('b'), `${size('hub')} ${size('a')} ${size('b')}`);
  assert.equal(size('b') / 2, radiusOf(1));
  assert.equal(spots.size, 5);
  assert.deepEqual(spreadSpace(MARKS).space, space, 'the same each time');
});

test('a link runs from ball surface to ball surface, its arrowhead touching the ball it points to', () => {
  const { space } = spreadSpace(MARKS);
  const ball = new Map(space.blocks.map((b) => [b.of, { at: centreOf(b), r: b.width / 2 }]));
  assert.equal(space.lines.length, 5);
  for (const line of space.lines) {
    const from = ball.get(line.from),
      to = ball.get(line.to);
    const first = line.points[0],
      last = line.points[line.points.length - 1];
    assert.ok(Math.abs(dist(first, from.at) - from.r) < from.r * 0.2, 'leaves its first ball at its surface');
    const arrow = space.arrows.find((a) => a.id === `${line.id}\narrow`);
    assert.ok(Math.abs(dist(arrow.tip, to.at) - to.r) < to.r * 0.2, 'the tip touches the ball it points to');
    assert.ok(dist(arrow.back, last) < 1e-6, 'the line ends where the arrowhead begins');
    assert.ok(dist(arrow.back, to.at) > dist(arrow.tip, to.at), 'the arrowhead points at its ball');
  }
});

test('a link and its reverse bow apart; a lone link is straight', () => {
  const { space } = spreadSpace(MARKS);
  const middle = (id) => {
    const l = space.lines.find((x) => x.id === id);
    return l.points[Math.floor(l.points.length / 2)];
  };
  assert.equal(space.lines.find((l) => l.id === 'e:2').points.length, 2);
  assert.ok(dist(middle('e:1'), middle('e:5')) > 10, 'the two links between hub and a do not lie on each other');
});

test('names and link words are labels, and both show on screen, names first', () => {
  const { space } = spreadSpace(MARKS);
  assert.ok(space.labels.some((l) => l.of === 'hub' && l.text === 'HUB'));
  const words = space.labels.filter((l) => l.link !== undefined);
  assert.deepEqual(words.map((l) => l.text).sort(), ['OWNS', 'OWNS', 'OWNS', 'OWNS', 'REPORTS_TO']);
  const orbit = orbitFit(space, 1);
  const reach = dist(space.least, space.most);
  const m = spaceMatrix(orbit, 1, reach);
  const shown = labelsOnScreen(space, m, 800, 800);
  assert.ok(shown.some((l) => l.link) && shown.some((l) => !l.link), 'both kinds show');
  assert.ok(!shown[0].link, 'a name ranks before link words');
});

test('arrowheads on screen point the way their link runs, and a ball is picked inside its circle', () => {
  const { space } = spreadSpace(MARKS);
  const reach = dist(space.least, space.most);
  const m = spaceMatrix(orbitFit(space, 1), 1, reach);
  const arrows = arrowsOnScreen(space, m, 800, 800);
  assert.equal(arrows.length, 5);
  for (const a of arrows) {
    const src = space.arrows.find((x) => x.id === a.id);
    const back = projectPoint(m, src.back, 800, 800);
    const mid = { x: (a.left.x + a.right.x) / 2, y: (a.left.y + a.right.y) / 2 };
    const dir = [a.tip.x - back.x, a.tip.y - back.y],
      drawn = [a.tip.x - mid.x, a.tip.y - mid.y];
    assert.ok(dir[0] * drawn[0] + dir[1] * drawn[1] > 0, 'from back to tip');
  }
  for (let i = 1; i < arrows.length; i++) assert.ok(arrows[i - 1].far >= arrows[i].far, 'far ones first');
  const hub = space.blocks.find((b) => b.of === 'hub');
  const at = projectPoint(m, centreOf(hub), 800, 800);
  assert.equal(blockAt(space, m, 800, 800, at.x, at.y)?.of, 'hub');
  assert.equal(blockAt(space, m, 800, 800, 1, 1), null);
});
