// Direct links (editor spec §25, untangle_direct): direct-links.ts, and drawing with them (render.ts, svgOf). Each link
// is one curve from box to box, and boxes move aside so no link runs through a box it does not join.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from '../src/engine.ts';
import { directLinks } from '../src/direct-links.ts';
import { directions, svgOf } from '../src/render.ts';
import { readNote } from '../src/drawing.ts';

const engine = await loadEngine();

/** The layout source of a note's graph of things `[key, kind]` and links `[from, type, to]`, as the card lays it out. */
function dotOf(things, links, routing = 'direct') {
  const block = [
    '// graph: g',
    ...things.map(([k, kind]) => `(${k}:${kind} {name: '${k.toUpperCase()}'}),`),
    ...links.map(([a, t, b], i) => `(${a})-[:${t}]->(${b})${i < links.length - 1 ? ',' : ''}`),
  ].join('\n');
  const drawing = readNote([block]).graphs.get('g');
  return { dot: directions({ ...drawing, routing })[0].dot, drawing };
}

/** The points along a link's cubic curve, or its straight pieces. */
function along(m) {
  if (!m.curve) return m.points;
  const out = [];
  for (let i = 0; i + 3 < m.points.length; i += 3) {
    const [p0, p1, p2, p3] = m.points.slice(i, i + 4);
    for (let k = 0; k <= 20; k++) {
      const t = k / 20,
        u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  }
  return out;
}

/** The links that run through a box they do not join, as `from>to@box`. */
function throughBoxes(marks) {
  const boxes = marks.filter((m) => m.kind === 'box' && m.role === 'thing');
  const out = [];
  for (const l of marks.filter((m) => m.kind === 'link'))
    for (const b of boxes) {
      if (b.of === l.from || b.of === l.to) continue;
      const hit = along(l).some(
        ([x, y]) => x > b.x + 1 && x < b.x + b.width - 1 && y > b.y + 1 && y < b.y + b.height - 1,
      );
      if (hit) out.push(`${l.from}>${l.to}@${b.of}`);
    }
  return out;
}

const box = (marks, key) => marks.find((m) => m.kind === 'box' && m.of === key);
const onEdge = ([x, y], b) =>
  x >= b.x - 1 &&
  x <= b.x + b.width + 1 &&
  y >= b.y - 1 &&
  y <= b.y + b.height + 1 &&
  (Math.abs(x - b.x) < 1.5 ||
    Math.abs(x - b.x - b.width) < 1.5 ||
    Math.abs(y - b.y) < 1.5 ||
    Math.abs(y - b.y - b.height) < 1.5);

// a team: people on projects, tasks that need each other, and teams that help each other
const PEOPLE = ['ada', 'bob', 'cy', 'dee', 'eve', 'fay'].map((k) => [k, 'Person']);
const TEAM = [
  ...PEOPLE,
  ['atlas', 'Project'],
  ['beacon', 'Project'],
  ...['design', 'build', 'test', 'ship', 'docs', 'budget'].map((k) => [k, 'Task']),
  ['core', 'Team'],
  ['web', 'Team'],
];
const TEAM_LINKS = [
  ['ada', 'LEADS', 'atlas'],
  ['bob', 'LEADS', 'beacon'],
  ['atlas', 'HAS', 'design'],
  ['atlas', 'HAS', 'build'],
  ['atlas', 'HAS', 'test'],
  ['atlas', 'HAS', 'ship'],
  ['beacon', 'HAS', 'docs'],
  ['beacon', 'HAS', 'budget'],
  ['cy', 'OWNS', 'design'],
  ['dee', 'OWNS', 'build'],
  ['eve', 'OWNS', 'test'],
  ['fay', 'OWNS', 'docs'],
  ['ada', 'MEMBER_OF', 'core'],
  ['cy', 'MEMBER_OF', 'core'],
  ['dee', 'MEMBER_OF', 'core'],
  ['bob', 'MEMBER_OF', 'web'],
  ['eve', 'MEMBER_OF', 'web'],
  ['fay', 'MEMBER_OF', 'web'],
  ['build', 'NEEDS', 'design'],
  ['test', 'NEEDS', 'build'],
  ['ship', 'NEEDS', 'test'],
  ['core', 'HELPS', 'web'],
  ['web', 'HELPS', 'core'],
];
const SKIPS = dotOf(TEAM, TEAM_LINKS).dot;

test('drawn straight, links run through boxes; drawn direct, none does', () => {
  const straight = engine.marks(dotOf(TEAM, TEAM_LINKS, 'straight').dot);
  assert.ok(throughBoxes(straight.marks).length > 0, 'the straight drawing has a link through a box');
  const direct = directLinks(engine.marks(SKIPS));
  assert.deepEqual(throughBoxes(direct.marks), []);
  assert.deepEqual(directLinks(engine.marks(SKIPS)), direct, 'the same each time');
});

test('a link runs from the edge of its box to the arrowhead on the edge of the other, in one curve', () => {
  const { marks } = directLinks(engine.marks(SKIPS));
  for (const l of marks.filter((m) => m.kind === 'link')) {
    assert.equal(l.curve, true);
    assert.equal(l.points.length, 4, 'one cubic piece');
    assert.ok(onEdge(l.points[0], box(marks, l.from)), `${l.from}>${l.to} leaves the edge of ${l.from}`);
    const head = marks.find((m) => m.kind === 'arrowhead' && m.of === l.of);
    assert.ok(onEdge([head.x, head.y], box(marks, l.to)), `its arrowhead's tip is on the edge of ${l.to}`);
    const end = l.points[3];
    assert.ok(Math.abs(Math.hypot(end[0] - head.x, end[1] - head.y) - head.size) < 0.5, 'the line meets the arrowhead');
  }
});

test("two links between the same boxes bow apart, and a link's words cover no box", () => {
  const { dot } = dotOf(
    [
      ['a', 'Team'],
      ['b', 'Team'],
      ['c', 'Task'],
    ],
    [
      ['a', 'HELPS', 'b'],
      ['b', 'HELPS', 'a'],
      ['b', 'OWNS', 'c'],
    ],
  );
  const { marks } = directLinks(engine.marks(dot));
  const [ab, ba] = marks.filter((m) => m.kind === 'link' && [m.from, m.to].sort().join() === 'a,b');
  const mid = (l) => along(l)[Math.floor(along(l).length / 2)];
  assert.ok(Math.hypot(mid(ab)[0] - mid(ba)[0], mid(ab)[1] - mid(ba)[1]) > 8, 'the two links do not lie on each other');
  const boxes = marks.filter((m) => m.kind === 'box' && m.role === 'thing');
  for (const w of marks.filter((m) => m.kind === 'label' && m.of !== undefined && !box(marks, m.of))) {
    const inside = boxes.some((b) => w.x > b.x && w.x < b.x + b.width && w.y > b.y && w.y < b.y + b.height);
    assert.ok(!inside, `${w.text} sits clear of the boxes`);
  }
});

test('a drawing with direct links keeps every part of the SVG Graphviz writes, its links redrawn', () => {
  const dot = SKIPS;
  const own = engine.render(dot),
    direct = svgOf(engine, dot, 'direct');
  const parts = (svg) =>
    [...svg.matchAll(/<g id="([^"]+)" class="(node|edge)">\s*<title>([^<]*)</g)].map((m) => m.slice(1));
  assert.deepEqual(parts(direct), parts(own));
  assert.notEqual(direct, own);
  assert.equal(svgOf(engine, dot, undefined), own, 'any other routing is Graphviz own');
  assert.match(dot, /splines=line/, 'laid out straight, the quickest, before the links are drawn again');
});
