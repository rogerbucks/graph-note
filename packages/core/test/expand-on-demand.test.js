// Growing the picture from one thing (editor spec §53, scale_expand_on_demand): expand-on-demand.ts.
// - A step adds the thing's neighbours one link out, and nothing else. A second step adds the next ring.
// - A ring too big to read is cut to its best-linked things, and the count left out is kept.
// - A step back takes the last ring away. The part to lay out holds only what is kept.
// - Opening a group shows its things in place: that is openGroup, proved in search-fly.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPANSION_MOST, Expansion, RING_MOST } from '../src/expand-on-demand.ts';

const box = (key) => ({ key, kind: 'Thing', text: key });
const link = (from, to) => ({ from, to, type: 'Thing', reading: 'links' });

/** A chain a - b - c - d, with e off b and f off on its own. */
const CHAIN = {
  graph: 'G',
  boxes: ['a', 'b', 'c', 'd', 'e', 'f'].map(box),
  links: [link('a', 'b'), link('c', 'b'), link('c', 'd'), link('b', 'e')],
  estimates: [],
};

test('a step adds the neighbours one link out, either way along each, and nothing else', () => {
  const x = new Expansion(CHAIN, 'b');
  assert.deepEqual(x.keys(), ['b']);
  assert.deepEqual(x.grow(), ['a', 'c', 'e']);
  assert.equal(x.steps, 1);
  assert.deepEqual(x.grow(), ['d'], 'a second step adds the next ring');
  assert.deepEqual(x.grow(), [], 'f is linked to none of them, so it never comes');
  assert.equal(x.steps, 2);
});

test('the part to lay out holds only what is kept and the links among those', () => {
  const x = new Expansion(CHAIN, 'a');
  x.grow();
  const part = x.part();
  assert.deepEqual(
    part.boxes.map((b) => b.key),
    ['a', 'b'],
  );
  assert.deepEqual(
    part.links.map((l) => `${l.from}-${l.to}`),
    ['a-b'],
  );
  assert.equal(CHAIN.boxes.length, 6, 'the drawing is never changed');
});

test('a step back takes the last ring away, and the start always stays', () => {
  const x = new Expansion(CHAIN, 'b');
  x.grow();
  x.grow();
  x.shrink();
  assert.deepEqual(x.keys(), ['b', 'a', 'c', 'e']);
  x.shrink();
  x.shrink();
  assert.deepEqual(x.keys(), ['b']);
  assert.deepEqual(x.grow(), ['a', 'c', 'e'], 'grown again, it finds the same ring');
});

test('a ring too big to read is cut to its best-linked things, and the count left out is kept', () => {
  // a hub with 100 spokes, each linked to it once, so all are linked as well as each other
  const boxes = [box('hub'), ...Array.from({ length: 100 }, (_, i) => box(`s${i}`))];
  const links = Array.from({ length: 100 }, (_, i) => link('hub', `s${i}`));
  const drawing = { graph: 'G', boxes, links, estimates: [] };
  const x = new Expansion(drawing, 'hub');
  const ring = x.grow();
  assert.equal(ring.length, RING_MOST);
  assert.equal(x.cut[1], 100 - RING_MOST);
  assert.deepEqual(ring.slice(0, 3), ['s0', 's1', 's2'], 'ties keep the order written');
});

test('the best-linked come first in a ring', () => {
  const drawing = {
    graph: 'G',
    boxes: ['a', 'b', 'c', 'x', 'y'].map(box),
    links: [link('a', 'x'), link('a', 'y'), link('a', 'b'), link('b', 'y'), link('c', 'y')],
    estimates: [],
  };
  const x = new Expansion(drawing, 'a');
  x.grow();
  assert.deepEqual(x.grow(), ['c'], 'y is kept already, so only c is new');
  const from = new Expansion(drawing, 'y');
  assert.deepEqual(from.grow(), ['a', 'b', 'c']);
  assert.deepEqual(from.grow(), ['x']);
});

test('an expansion never holds more than can be laid out at once', () => {
  const boxes = [box('r')],
    links = [];
  // a tree: each thing has 10 children, five levels deep
  let level = ['r'];
  for (let d = 0; d < 4; d++) {
    const next = [];
    for (const p of level)
      for (let i = 0; i < 10; i++) {
        const k = `${p}.${i}`;
        boxes.push(box(k));
        links.push(link(p, k));
        next.push(k);
      }
    level = next;
  }
  const x = new Expansion({ graph: 'G', boxes, links, estimates: [] }, 'r');
  while (x.grow().length);
  assert.ok(x.keys().length <= EXPANSION_MOST, `${x.keys().length} kept`);
});
