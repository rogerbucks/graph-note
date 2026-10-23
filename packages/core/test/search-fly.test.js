// Search a massive graph and fly to a match (editor spec §53, scale_search_fly): search-fly.ts.
// - A search finds things by name or key in every group, open or closed, best matches first.
// - Opening a group puts its inside in the group's box and takes away its name and count.
// - The flight starts where the view is, ends on the match, and draws back on a far flight.
// - Under reduced motion the view is on the match at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ThingSearch, flyPath, folded, openGroup, placeOf, viewOnto } from '../src/search-fly.ts';
import { overviewOf } from '../src/overview.ts';

const box = (key, text = key) => ({ key, kind: 'Thing', text });
const BOXES = [
  box('a1', 'Planning board'),
  box('a2', 'Plan'),
  box('a3', 'Road-plan'),
  box('a4', 'Explanation'),
  box('b1', 'Café menu'),
  box('b2_plan_key', 'Kitchen'),
  box('b3', 'Plans'),
];
const GROUPING = {
  by: 'links',
  groups: [
    { id: 'group:a', label: 'A', by: 'links', keys: ['a1', 'a2', 'a3', 'a4'] },
    { id: 'group:b', label: 'B', by: 'links', keys: ['b1', 'b2_plan_key', 'b3'] },
  ],
  between: [{ from: 0, to: 1, links: 2 }],
};

test('a search finds things in every group: the whole name, its start, a word, then anywhere; shorter first', () => {
  const search = new ThingSearch(BOXES, GROUPING);
  assert.equal(search.size, 7);
  const found = search.find('plan');
  assert.deepEqual(
    found.map((m) => [m.key, m.rank]),
    [
      ['a2', 0],
      ['b3', 1],
      ['a1', 1],
      ['b2_plan_key', 2],
      ['a3', 2],
      ['a4', 3],
    ],
  );
  assert.equal(found.find((m) => m.key === 'b3').group, 'group:b', 'a match names the group it sits in');
  assert.equal(search.find('plan', 2).length, 2, 'at most the number asked for');
  assert.deepEqual(search.find('   '), [], 'an empty search finds nothing');
  assert.deepEqual(search.find('zebra'), []);
});

test('a search ignores case and accents', () => {
  const search = new ThingSearch(BOXES, GROUPING);
  assert.deepEqual(
    search.find('CAFE').map((m) => m.key),
    ['b1'],
  );
  assert.equal(folded('Ça Été'), 'ca ete');
});

test('opening a group puts its inside in its box, and leaves the rest of the picture where it was', () => {
  const overview = overviewOf(GROUPING);
  const group = overview.marks.find((m) => m.id === 'group:a');
  const inside = {
    space: { width: 200, height: 100 },
    marks: [
      { id: 't:a1', kind: 'box', style: 'thing', of: 'a1', x: 0, y: 0, width: 100, height: 50, outline: [[0, 0]] },
      { id: 't:a2', kind: 'box', style: 'thing', of: 'a2', x: 100, y: 50, width: 100, height: 50 },
      {
        id: 'e:a1a2',
        kind: 'link',
        style: 'link',
        points: [
          [50, 50],
          [150, 50],
        ],
      },
      {
        id: 'l:a1',
        kind: 'label',
        style: 'thing.name',
        of: 'a1',
        x: 50,
        y: 25,
        text: 'A1',
        size: 10,
        anchor: 'middle',
      },
    ],
  };
  const opened = openGroup(overview, 'group:a', inside);
  assert.ok(!opened.marks.some((m) => m.id === 'group:a:name' || m.id === 'group:a:count'), 'name and count go');
  assert.deepEqual(opened.space, overview.space);
  for (const m of overview.marks)
    if (!m.id.startsWith('group:a:')) assert.ok(opened.marks.includes(m), `${m.id} stays as it was`);
  const a1 = opened.marks.find((m) => m.id === 't:a1');
  const a2 = opened.marks.find((m) => m.id === 't:a2');
  assert.equal(a1.group, 'group:a');
  assert.equal(a1.outline, undefined, 'an outline drawn at the old size is dropped');
  const right = a2.x + a2.width,
    bottom = a2.y + a2.height;
  assert.ok(a1.x >= group.x && a1.y >= group.y, 'inside the box, top left');
  assert.ok(right <= group.x + group.width + 1e-9 && bottom <= group.y + group.height + 1e-9, 'and bottom right');
  assert.ok(Math.abs(a1.width / a1.height - 2) < 1e-9, 'it keeps its shape');
  const label = opened.marks.find((m) => m.id === 'l:a1');
  assert.ok(Math.abs(label.size / 10 - a1.width / 100) < 1e-9, 'text is scaled with the boxes');
  assert.equal(openGroup(overview, 'group:none', inside), overview, 'a group not there leaves it as it was');
});

test('a thing is found in the picture once its group is open, and not before', () => {
  const overview = overviewOf(GROUPING);
  assert.equal(placeOf(overview, 'a1'), null);
  const inside = {
    space: { width: 100, height: 100 },
    marks: [{ id: 't:a1', kind: 'box', style: 'thing', of: 'a1', x: 0, y: 0, width: 100, height: 100 }],
  };
  const place = placeOf(openGroup(overview, 'group:a', inside), 'a1');
  assert.ok(place && place.width > 0 && place.height > 0);
});

test('the view onto a place puts it in the middle of the screen', () => {
  const view = viewOnto({ x: 1000, y: 500, width: 40, height: 20 }, 800, 600);
  const cx = view.x + 400 / view.scale,
    cy = view.y + 300 / view.scale;
  assert.ok(Math.abs(cx - 1020) < 1e-9 && Math.abs(cy - 510) < 1e-9);
  assert.equal(view.scale, 4, 'a small place is not zoomed past the most');
  assert.ok(viewOnto({ x: 0, y: 0, width: 4000, height: 100 }, 800, 600).scale < 1, 'a wide one is zoomed out');
});

test('a flight starts at the view, ends on the match, draws back when far, and is there at once when reduced', () => {
  const from = { x: 0, y: 0, scale: 1 },
    to = { x: 9000, y: 6000, scale: 2 };
  const fly = flyPath(from, to, 800, 600);
  const close = (a, b) =>
    Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.scale - b.scale) < 1e-9;
  assert.ok(close(fly(0), from), 'starts where the view is');
  assert.ok(close(fly(1), to), 'ends on the match');
  assert.ok(fly(0.5).scale < Math.min(from.scale, to.scale), 'a far flight draws back on the way');
  assert.ok(close(fly(2), to), 'past the end it stays at the end');
  const near = flyPath(from, { x: 10, y: 10, scale: 1 }, 800, 600);
  assert.ok(Math.abs(near(0.5).scale - 1) < 1e-9, 'a near flight does not draw back');
  const reduced = flyPath(from, to, 800, 600, true);
  assert.equal(reduced(0), to, 'under reduced motion, there at once');
});
