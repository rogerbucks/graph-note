// The layouts (editor spec §53, layout_contract, layout_force_3d): layouts/layouts.ts and layouts/force-3d.ts. Every
// layout keeps the same promises, and the 3D force layout uses depth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS, layoutById, layoutsOf } from '../src/layouts/layouts.ts';

/** A shape of things by key and links `[from, to]`. */
const shapeOf = (keys, links = []) => ({
  things: keys.map((key) => ({ key, text: key.toUpperCase(), kinds: ['Thing'] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
});

const apart = (at, a, b) => Math.hypot(...at.get(a).map((v, k) => v - at.get(b)[k]));

// two triangles, a b c and d e f, not linked to each other
const TWO = shapeOf(
  ['a', 'b', 'c', 'd', 'e', 'f'],
  [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'a'],
    ['d', 'e'],
    ['e', 'f'],
    ['f', 'd'],
  ],
);

test('each layout has its own id per dimension, and is found by it', () => {
  const names = LAYOUTS.map((l) => `${l.id} ${l.dims}`);
  assert.equal(new Set(names).size, names.length);
  for (const l of LAYOUTS) assert.equal(layoutById(l.id, l.dims), l);
  assert.equal(layoutById('force', 3), undefined);
  assert.deepEqual(
    layoutsOf(3).map((l) => l.id),
    ['force-3d'],
  );
});

for (const layout of LAYOUTS)
  test(`${layout.id} (${layout.dims}D): every key comes back once, the same each time, linked things nearest`, () => {
    const at = layout.place(TWO);
    assert.deepEqual([...at.keys()], ['a', 'b', 'c', 'd', 'e', 'f']);
    for (const spot of at.values()) {
      assert.equal(spot.length, layout.dims);
      assert.ok(spot.every(Number.isFinite));
    }
    assert.deepEqual([...layout.place(TWO)], [...at]);
    const inside = Math.max(apart(at, 'a', 'b'), apart(at, 'b', 'c'), apart(at, 'd', 'e'), apart(at, 'e', 'f'));
    const across = Math.min(...['a', 'b', 'c'].flatMap((p) => ['d', 'e', 'f'].map((q) => apart(at, p, q))));
    assert.ok(inside < across, `${inside} ${across}`);
    assert.equal(layout.place(shapeOf([])).size, 0);
  });

for (const layout of LAYOUTS)
  test(`${layout.id} (${layout.dims}D): a warm start moves the things already placed only a little`, () => {
    const before = layout.place(TWO);
    const grown = shapeOf([...'abcdefg'], [...TWO.links.map((l) => [l.from, l.to]), ['g', 'a']]);
    const after = layout.place(grown, before);
    const moved = (at) =>
      Math.max(...[...'abcdef'].map((k) => Math.hypot(...before.get(k).map((v, i) => v - at.get(k)[i]))));
    // in the layout's units a link is about one long: with nothing new, nothing moves as far as a tenth of a link
    assert.ok(moved(layout.place(TWO, before)) < 0.1, `${moved(layout.place(TWO, before))}`);
    assert.ok(moved(after) < moved(layout.place(grown)) / 2, `${moved(after)} ${moved(layout.place(grown))}`);
    assert.ok(after.has('g'));
  });

test('the 3D force layout spreads things in depth, as much as across', () => {
  // a ring of twelve with a spoke to every third: flat on a page, it has to cross itself
  const keys = Array.from({ length: 12 }, (_, i) => `t${i}`);
  const links = keys.map((k, i) => [k, keys[(i + 1) % 12]]);
  for (let i = 0; i < 12; i += 3) links.push([keys[i], keys[(i + 6) % 12]]);
  const at = layoutById('force-3d', 3).place(shapeOf(keys, links));
  const spread = (k) => Math.max(...[...at.values()].map((p) => p[k])) - Math.min(...[...at.values()].map((p) => p[k]));
  assert.ok(spread(2) > 0.5 * Math.min(spread(0), spread(1)), `${spread(0)} ${spread(1)} ${spread(2)}`);
});
