// The overview a massive graph opens as (editor spec §53, scale_overview): overview.ts. Each group is one box, sized
// by its things, with its name and count, and the groups that link are joined by lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overviewOf, squarify } from '../src/overview.ts';
import { drawMarksOf, marksBounds } from '../src/drawing-marks.ts';
import { groupsOf } from '../src/scale-groups.ts';
import { readNote } from '../src/drawing.ts';
import { hugeBlock } from '../../../scripts/scale-benchmark.mjs';

/** A grouping of groups of `sizes` things, with `between` as [from, to, links]. */
const grouping = (sizes, between = []) => ({
  by: 'links',
  groups: sizes.map((n, i) => ({
    id: `group:g${i}`,
    label: `Group ${i}`,
    by: 'links',
    keys: Array.from({ length: n }, (_, k) => `g${i}_${k}`),
  })),
  between: between.map(([from, to, links]) => ({ from, to, links })),
});

const area = (r) => r.width * r.height;
const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

test('a treemap fills its room, each box its own area, none overlapping and all near square', () => {
  const areas = [6, 6, 4, 3, 2, 2, 1];
  const rects = squarify(areas, { x: 0, y: 0, width: 6, height: 4 });
  rects.forEach((r, i) => assert.ok(Math.abs(area(r) - (areas[i] ?? 0)) < 1e-9, `box ${i}`));
  for (const [i, a] of rects.entries())
    for (const b of rects.slice(i + 1)) assert.ok(overlap(a, b) < 1e-9, 'boxes overlap');
  for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= 6 + 1e-9 && r.y + r.height <= 4 + 1e-9);
  // Bruls's own example lays these out with no box longer than three times its width
  for (const r of rects) assert.ok(Math.max(r.width / r.height, r.height / r.width) <= 3, JSON.stringify(r));
});

test('each group is a box sized by its things, named with its count, and checked as marks', () => {
  const g = grouping([300, 100, 100], [[0, 1, 4]]);
  const { space, marks } = overviewOf(g);
  assert.equal(typeof drawMarksOf(marks, space), 'object', String(drawMarksOf(marks, space)));
  const boxes = marks.filter((m) => m.kind === 'group');
  assert.deepEqual(
    boxes.map((b) => [b.id, b.name, b.role]),
    [
      ['group:g0', 'Group 0, 300 things', 'group'],
      ['group:g1', 'Group 1, 100 things', 'group'],
      ['group:g2', 'Group 2, 100 things', 'group'],
    ],
  );
  const [big, small] = boxes;
  assert.ok(area(big) / area(small) > 2.5 && area(big) / area(small) < 3.5, 'the box of 300 is about three times 100');
  const names = marks.filter((m) => m.kind === 'label' && m.style === 'overview.name').map((m) => m.text);
  assert.deepEqual(names, ['Group 0', 'Group 1', 'Group 2']);
  assert.ok(marks.find((m) => m.id === 'group:g1:count')?.text === '100 things');
  const link = marks.find((m) => m.kind === 'link');
  assert.deepEqual([link.from, link.to, link.name], ['group:g0', 'group:g1', '4 links']);
});

test('every name fits inside its own box', () => {
  const { marks } = overviewOf(grouping([500, 20, 7, 1, 260]));
  for (const label of marks.filter((m) => m.kind === 'label')) {
    const box = marks.find((m) => m.id === label.group);
    assert.ok(label.maxWidth <= box.width, label.id);
    assert.ok(label.x >= box.x && label.x <= box.x + box.width && label.y - label.size >= box.y - 1e-9, label.id);
  }
});

test('groups that link are put side by side', () => {
  // groups 0 and 3 link, and 1 and 2 link: each pair shares a part of the square
  const { marks } = overviewOf(
    grouping(
      [100, 100, 100, 100],
      [
        [0, 3, 50],
        [1, 2, 50],
      ],
    ),
  );
  const box = (id) => marks.find((m) => m.id === id);
  const near = (a, b) => {
    const [p, q] = [box(a), box(b)];
    const gapX = Math.max(0, Math.max(p.x, q.x) - Math.min(p.x + p.width, q.x + q.width));
    const gapY = Math.max(0, Math.max(p.y, q.y) - Math.min(p.y + p.height, q.y + q.height));
    return gapX <= 8 && gapY <= 8;
  };
  assert.ok(near('group:g0', 'group:g3'), 'linked groups 0 and 3 touch');
  assert.ok(near('group:g1', 'group:g2'), 'linked groups 1 and 2 touch');
});

test('the V-10 huge graph, ten times over, opens as an overview of a few hundred boxes', () => {
  const d = readNote([hugeBlock()]).graphs.get('huge');
  const boxes = [],
    links = [];
  for (let c = 0; c < 10; c++) {
    for (const b of d.boxes) boxes.push({ ...b, key: `${b.key}_c${c}`, kind: 'Thing' });
    for (const l of d.links) links.push({ ...l, from: `${l.from}_c${c}`, to: `${l.to}_c${c}` });
  }
  const g = groupsOf({ ...d, boxes, links, nudges: [] });
  const { space, marks } = overviewOf(g);
  assert.equal(typeof drawMarksOf(marks, space), 'object', String(drawMarksOf(marks, space)));
  const drawn = marks.filter((m) => m.kind === 'group');
  assert.equal(drawn.length, g.groups.length);
  assert.ok(drawn.length < 1000, `${drawn.length} boxes`);
  const all = marksBounds(marks);
  assert.ok(all.width <= space.width && all.height <= space.height);
  // the same groups give the same marks every time
  assert.deepEqual(overviewOf(g), { space, marks });
});

test('no groups is an empty overview', () => {
  assert.deepEqual(overviewOf({ by: 'links', groups: [], between: [] }).marks, []);
});
