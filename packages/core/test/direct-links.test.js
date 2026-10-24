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

/** The room a link's words take, as a rectangle round where they are written. */
const wordsBox = (w) => {
  const half = (w.maxWidth ?? w.text.length * w.size * 0.5) / 2;
  return { x0: w.x - half, y0: w.y - w.size * 0.8, x1: w.x + half, y1: w.y + w.size * 0.2 };
};
const overlap = (p, q) => p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;
/** The words of the links, not of the boxes. */
const linkWords = (marks) =>
  marks.filter(
    (m) => m.kind === 'label' && m.of !== undefined && !marks.some((b) => b.kind === 'box' && b.of === m.of),
  );

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
  for (const w of linkWords(marks)) {
    const r = wordsBox(w);
    const covered = boxes.filter((b) => overlap(r, { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height }));
    assert.deepEqual(
      covered.map((b) => b.of),
      [],
      `${w.text} covers no box`,
    );
  }
});

test("a lone link bows gently, and no two links' words lie on each other", () => {
  const { marks } = directLinks(engine.marks(SKIPS));
  for (const l of marks.filter((m) => m.kind === 'link' && m.from !== m.to)) {
    // how far the curve's middle is from the straight line between its ends
    const [p0, , , p3] = l.points,
      mid = along(l)[10];
    const long = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
    const off = Math.abs((p3[0] - p0[0]) * (p0[1] - mid[1]) - (p0[0] - mid[0]) * (p3[1] - p0[1])) / long;
    assert.ok(off > long * 0.01, `${l.from}>${l.to} curves: ${off.toFixed(1)} off a line of ${long.toFixed(0)}`);
  }
  const words = linkWords(marks).map((w) => [w, wordsBox(w)]);
  const piled = words.filter(([, r], i) => words.some(([, q], j) => j !== i && overlap(r, q)));
  assert.deepEqual(
    piled.map(([w]) => w.text),
    [],
  );
});

test("a self link's loop, arrowhead and words move with its box", () => {
  const { dot } = dotOf(TEAM, [...TEAM_LINKS, ['ship', 'NEXT', 'ship']]);
  const laid = engine.marks(dot),
    { marks } = directLinks(laid);
  const was = box(laid.marks, 'ship'),
    now = box(marks, 'ship');
  const by = [now.x - was.x, now.y - was.y];
  assert.ok(Math.hypot(...by) > 1, 'ship moves aside');
  const loop = (ms) => ms.find((m) => m.kind === 'link' && m.from === 'ship' && m.to === 'ship');
  const parts = (ms) => ms.filter((m) => m.of === loop(ms).of && m.kind !== 'link');
  assert.ok(parts(laid.marks).length > 0, 'the loop has an arrowhead or words');
  for (const [a, b] of loop(laid.marks).points.map((p, i) => [p, loop(marks).points[i]]))
    assert.deepEqual(
      b.map((v, k) => +(v - a[k]).toFixed(6)),
      by.map((v) => +v.toFixed(6)),
    );
  for (const [a, b] of parts(laid.marks).map((m, i) => [m, parts(marks)[i]]))
    assert.deepEqual(
      [+(b.x - a.x).toFixed(6), +(b.y - a.y).toFixed(6)],
      by.map((v) => +v.toFixed(6)),
      a.id,
    );
});

test('a link with an arrowhead at each end stops short of both', () => {
  const laid = engine.marks(SKIPS);
  const l = laid.marks.find((m) => m.kind === 'link' && m.from === 'ada' && m.to === 'atlas');
  const head = laid.marks.find((m) => m.kind === 'arrowhead' && m.of === l.of);
  const tail = { ...head, id: `tail:${head.id}`, x: l.points[0][0], y: l.points[0][1] };
  const { marks } = directLinks({ ...laid, marks: [...laid.marks, tail] });
  const line = marks.find((m) => m.id === l.id);
  const tips = marks.filter((m) => m.kind === 'arrowhead' && m.of === l.of);
  assert.equal(tips.length, 2);
  for (const t of tips) {
    const end = t.id.startsWith('tail:') ? line.points[0] : line.points[3];
    assert.ok(Math.abs(Math.hypot(end[0] - t.x, end[1] - t.y) - t.size) < 0.5, `${t.id}: the line meets it`);
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
  assert.equal(svgOf(engine, dot, undefined), direct, 'direct is the default');
  assert.equal(svgOf(engine, dot, 'curved'), own, 'any other routing is Graphviz own');
  assert.match(dot, /splines=line/, 'laid out straight, the quickest, before the links are drawn again');
});

test('every line, arrowhead and word lies inside the drawing, so no curve is cut off at its edge', () => {
  // Roger, 24 Oct 2026: "some curves seem to get clipped on the edges of the image"
  const edgy = dotOf(
    [
      ['a', 'Team'],
      ['b', 'Team'],
      ['c', 'Task'],
      ['d', 'Task'],
    ],
    [
      ['a', 'HELPS', 'b'],
      ['b', 'HELPS', 'a'],
      ['a', 'OWNS', 'c'],
      ['b', 'OWNS', 'd'],
      ['c', 'NEEDS', 'd'],
      ['d', 'NEEDS', 'c'],
    ],
  ).dot;
  for (const dot of [SKIPS, edgy]) {
    const { marks, space } = directLinks(engine.marks(dot));
    const outside = [];
    const inside = (x, y, what) => {
      if (x < 0 || y < 0 || x > space.width || y > space.height)
        outside.push(`${what} at ${x.toFixed(1)},${y.toFixed(1)}`);
    };
    for (const m of marks) {
      if (m.kind === 'link') for (const [x, y] of along(m)) inside(x, y, m.id);
      if (m.kind === 'arrowhead') inside(m.x, m.y, m.id);
      if (m.kind === 'label' && !marks.some((b) => b.kind === 'box' && b.of === m.of)) {
        const r = wordsBox(m);
        inside(r.x0, r.y0, m.text);
        inside(r.x1, r.y1, m.text);
      }
    }
    assert.deepEqual(outside, [], `inside a drawing ${space.width.toFixed(0)} by ${space.height.toFixed(0)}`);
  }
});
