// The overview filtered live (editor spec §53, scale_filter_live): filter-live.ts.
// - The kept groups keep their order and close the gaps; they are never laid out afresh.
// - They glide from their old places to their new ones; a group left empty shrinks away.
// The time budget, 10,000 kept things under 100 ms, is held by the scale benchmark (scripts/scale-benchmark.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filteredOverview, glide } from '../src/filter-live.ts';
import { overviewOf, overviewOrder } from '../src/overview.ts';

const keys = (name, n) => Array.from({ length: n }, (_, i) => `${name}${i}`);
/** Three groups of 10, 8 and 6 things; a and b link. */
const WHOLE = {
  by: 'kind',
  groups: [
    { id: 'group:a', label: 'A', by: 'kind', keys: keys('a', 10) },
    { id: 'group:b', label: 'B', by: 'kind', keys: keys('b', 8) },
    { id: 'group:c', label: 'C', by: 'kind', keys: keys('c', 6) },
  ],
  between: [{ from: 0, to: 1, links: 3 }],
};
const ORDER = overviewOrder(WHOLE);
const box = (laid, id) => laid.marks.find((m) => m.id === id);

test('the overview of the whole graph is the same with its order given or not', () => {
  assert.deepEqual(overviewOf(WHOLE, ORDER), overviewOf(WHOLE));
  assert.deepEqual(filteredOverview(WHOLE, ORDER, null).laid, overviewOf(WHOLE));
});

test('a filter keeps the groups in the whole graph’s order, though a fresh layout would move them', () => {
  // a keeps 1 thing, b all 8 and c all 6: a fresh layout would put b first, as it is now the largest
  const kept = new Set(['a0', ...keys('b', 8), ...keys('c', 6)]);
  const { grouping, laid } = filteredOverview(WHOLE, ORDER, kept);
  assert.deepEqual(
    grouping.groups.map((g) => g.keys.length),
    [1, 8, 6],
  );
  const fresh = overviewOrder(grouping);
  assert.deepEqual(fresh[0], ['group:b', 'group:a'], 'a fresh order would lead with b');
  assert.deepEqual(ORDER[0], ['group:a', 'group:b']);
  const a = box(laid, 'group:a'),
    b = box(laid, 'group:b');
  assert.ok(a.x <= b.x && a.y <= b.y, 'a still comes first, in the top left corner');
});

test('the kept groups close the gaps: the overview shrinks to fit only what is kept', () => {
  const whole = overviewOf(WHOLE);
  const { laid } = filteredOverview(WHOLE, ORDER, new Set([...keys('a', 10), ...keys('c', 6)]));
  assert.ok(laid.space.width < whole.space.width);
  assert.equal(box(laid, 'group:b'), undefined, 'a group left empty is taken away');
  const rooms = ['group:a', 'group:c'].map((id) => box(laid, id));
  for (const r of rooms) {
    assert.ok(r.x >= 0 && r.y >= 0, `${r.id} is inside the overview`);
    assert.ok(r.x + r.width <= laid.space.width + 1e-9 && r.y + r.height <= laid.space.height + 1e-9);
  }
  // the kept boxes fill the square but for the gap round each one
  const area = rooms.reduce((n, r) => n + (r.width + 8) * (r.height + 8), 0);
  assert.ok(Math.abs(area - laid.space.width * laid.space.height) / area < 0.01);
});

test('the groups glide from their old places to their new ones, and end exactly where they are laid out', () => {
  const from = overviewOf(WHOLE);
  const { laid: to } = filteredOverview(WHOLE, ORDER, new Set([...keys('a', 10), ...keys('c', 6)]));
  const at = glide(from, to);
  const start = at(0),
    half = at(0.5);
  assert.deepEqual(box(start, 'group:a'), box(from, 'group:a'), 'at the start a kept group is where it was');
  assert.strictEqual(at(1), to, 'at the end the marks are the new layout itself');
  const [a0, a1, ah] = [from, to, half].map((l) => box(l, 'group:c'));
  for (const k of ['x', 'y', 'width', 'height'])
    assert.ok(
      Math.min(a0[k], a1[k]) - 1e-9 <= ah[k] && ah[k] <= Math.max(a0[k], a1[k]) + 1e-9,
      `half way, c's ${k} is between`,
    );
  assert.notDeepEqual(box(half, 'group:c'), a1, 'half way it is still moving');
  assert.deepEqual(start.space, from.space);
});

test('a group left empty shrinks to its centre and is gone at the end; a group back again grows from its centre', () => {
  const from = overviewOf(WHOLE);
  const { laid: to } = filteredOverview(WHOLE, ORDER, new Set(keys('a', 10)));
  const at = glide(from, to);
  const b = box(from, 'group:b');
  const shrinking = box(at(0.5), 'group:b');
  assert.ok(shrinking.width < b.width && shrinking.width > 0);
  assert.ok(Math.abs(shrinking.x + shrinking.width / 2 - (b.x + b.width / 2)) < 1e-9, 'it shrinks about its centre');
  assert.equal(box(at(0.999), 'group:b').width < b.width / 100, true);
  assert.equal(box(at(1), 'group:b'), undefined);
  assert.equal(
    at(1).marks.some((m) => m.id === 'group:b->group:a' || m.id === 'group:a->group:b'),
    false,
    'its links go with it',
  );
  // and back: the whole graph again, b growing from nothing
  const back = glide(to, from);
  assert.equal(box(back(0), 'group:b').width, 0);
  assert.deepEqual(box(back(1), 'group:b'), b);
});
