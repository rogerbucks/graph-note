// A drawing that runs across is read right to left in a right-to-left language (editor spec §42, rtl_drawing_direction):
// Graphviz lays it out left to right as always, and the drawing is mirrored after, so the layout source and every export
// stay byte for byte the same. Its words are not mirrored: each label keeps its letters and is anchored at its other end.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { directions, draw } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';
import { hitAreas, centres } from '../src/hits.ts';
import { mirrored, inReadingDirection } from '../src/drawing-direction.ts';
import { landingFor } from '../src/box-drag.ts';
import { setDirection } from '../src/words.ts';
import { AcrossZoom } from '../src/zoom-across.ts';

const NOTE = ["// graph: g\n(a:T {name: 'Ann'}),\n(b:T {name: 'Bob', age: 3}),\n(c:T),\n(a)-[:R]->(b), (b)-[:S]->(c)"];
const graph = () => readNote(NOTE).graphs.get('g');
const across = async () => draw({ ...graph(), direction: 'LR' }, await loadEngine());
const down = async () => draw({ ...graph(), direction: 'TB' }, await loadEngine());
const xs = (svg) => {
  const c = centres(hitAreas(svg));
  return ['node1', 'node2', 'node3'].map((id) => c.get(id).x);
};

describe('a drawing in a right-to-left language', () => {
  after(() => setDirection('ltr'));

  // proves: rtl_drawing_direction
  test('a drawing that runs across is mirrored: its first thing on the right, its last on the left', async () => {
    const drawn = await across();
    const [a, b, c] = xs(drawn.svg);
    assert.ok(a < b && b < c, 'left to right as Graphviz lays it out');
    const shown = inReadingDirection(drawn, 'rtl');
    assert.equal(shown.mirrored, true);
    const [ma, mb, mc] = xs(shown.svg);
    assert.ok(ma > mb && mb > mc, `right to left: ${[ma, mb, mc]}`);
    // the same room, the same width: each box as far from the right edge as it was from the left
    assert.deepEqual([shown.width, shown.height, shown.rankdir], [drawn.width, drawn.height, drawn.rankdir]);
    const width = Number(/viewBox="[\d.]+ [\d.]+ ([\d.]+)/.exec(drawn.svg)[1]);
    for (const [x, m] of [
      [a, ma],
      [c, mc],
    ])
      assert.ok(Math.abs(x + m - width) < 0.05, `${x} and ${m} sit either side of the middle`);
  });

  test('its words are not mirrored: no flip of the whole picture, each label anchored at its other end', async () => {
    const drawn = await across();
    const shown = mirrored(drawn.svg);
    assert.doesNotMatch(shown, /scale\(-1/);
    const anchors = (svg) => [...svg.matchAll(/text-anchor="(\w+)"/g)].map((m) => m[1]);
    const swap = { start: 'end', end: 'start', middle: 'middle' };
    assert.deepEqual(
      anchors(shown),
      anchors(drawn.svg).map((a) => swap[a]),
    );
    const texts = (svg) => [...svg.matchAll(/<text\b[^>]*>([^<]*)</g)].map((m) => m[1]);
    assert.deepEqual(texts(shown), texts(drawn.svg));
  });

  test('mirrored twice it is the drawing it was', async () => {
    const { svg } = await across();
    const twice = mirrored(mirrored(svg));
    const numbers = (s) => (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const [p, q] = [numbers(twice), numbers(svg)];
    assert.equal(p.length, q.length);
    p.forEach((n, i) => assert.ok(Math.abs(n - q[i]) < 0.02, `${n} ≠ ${q[i]}`));
  });

  test('a drawing that runs down, and any drawing in a left-to-right language, is shown as laid out', async () => {
    const tb = await down();
    assert.equal(inReadingDirection(tb, 'rtl'), tb);
    const lr = await across();
    assert.equal(inReadingDirection(lr, 'ltr'), lr);
    assert.equal(inReadingDirection({ svg: '', rankdir: 'LR', width: 0, height: 0 }, 'rtl').mirrored, undefined);
  });

  test('by default it follows the direction the interface is read in', async () => {
    const lr = await across();
    setDirection('rtl');
    assert.equal(inReadingDirection(lr).mirrored, true);
    setDirection('ltr');
    assert.equal(inReadingDirection(lr), lr);
  });

  test('the layout source is the same in either direction, so the drawing laid out and every export are too', async () => {
    const before = directions(graph()).map((d) => d.dot);
    const ltr = (await across()).svg;
    setDirection('rtl');
    assert.deepEqual(
      directions(graph()).map((d) => d.dot),
      before,
    );
    assert.equal((await across()).svg, ltr);
    setDirection('ltr');
  });

  test('a box dragged in a mirrored drawing goes before the box it is dropped to the right of', () => {
    const boxes = [{ key: 'b', left: 0, top: 0, right: 40, bottom: 20 }];
    const right = { x: 60, y: 10 },
      left = { x: -20, y: 10 };
    assert.equal(landingFor('a', right, boxes, 'LR')?.side, 'after');
    assert.equal(landingFor('a', right, boxes, 'RL')?.side, 'before');
    assert.equal(landingFor('a', left, boxes, 'RL')?.side, 'after');
    // a radial drawing mirrored runs round the other way: where it went before a thing, it now goes after it
    const round = [
      { key: 'sun', left: 80, top: 90, right: 120, bottom: 110 },
      { key: 'b', left: 180, top: 90, right: 220, bottom: 110 },
    ];
    assert.equal(landingFor('a', { x: 200, y: 125 }, round, 'LR', [], 'sun')?.side, 'before');
    assert.equal(landingFor('a', { x: 200, y: 125 }, round, 'RL', [], 'sun')?.side, 'after');
  });

  test('a wide flow scrolled across on a phone opens at its start, which is now its right end', () => {
    const viewport = { width: 375, height: 400 };
    const z = new AcrossZoom({ width: 2000, height: 400, fromRight: true }, viewport, 'note');
    assert.equal(z.view().x, 375 - 2000, 'its right end in view');
    assert.ok(z.isFitted());
    z.zoomIn();
    z.fit();
    assert.equal(z.view().x, 375 - 2000, 'Fit brings it back to its start');
    assert.equal(new AcrossZoom({ width: 2000, height: 400 }, viewport, 'note').view().x, 0, 'laid out: its left end');
  });
});
