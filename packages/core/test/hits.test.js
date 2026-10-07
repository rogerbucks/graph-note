// Tapping near things (editor spec §3, tap_cycles_near; asked for 7 Oct 2026): a tap that lands on or near one or more
// boxes or links selects the nearest; tapping again in the same place selects the next, round and back to the first.
// Host-free: the areas come from the drawing's own SVG, and a tap is a point in the drawing's units.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { loadEngine, draw } from '../src/render.ts';
import { hitAreas, nearby, TapCycle } from '../src/hits.ts';

// As Graphviz writes it: a translate on the graph, rounded boxes as paths, a link as a curve, its arrowhead and its label
const SVG = `<svg width="221" viewBox="0.00 0.00 166.00 71.00" xmlns="http://www.w3.org/2000/svg">
<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(7.2 63.6)">
<g id="node1" class="node">
<path d="M42,-56.4C42,-56.4 12,-56.4 12,-56.4 6,-56.4 0,-50.4 0,-44.4 0,-44.4 0,-12 0,-12 0,-6 6,0 12,0 12,0 42,0 42,0 48,0 54,-6 54,-12 54,-12 54,-44.4 54,-44.4 54,-50.4 48,-56.4 42,-56.4"/>
<text text-anchor="start" x="22.83" y="-15.3" font-size="12.50">A</text>
</g>
<g id="node2" class="node">
<polygon points="151.5,-56.4 97.5,-56.4 97.5,0 151.5,0 151.5,-56.4"/>
<text text-anchor="start" x="120.33" y="-15.3" font-size="12.50">B</text>
</g>
<g id="edge1" class="edge">
<path fill="none" d="M54.35,-28.2C64.91,-28.2 77.22,-28.2 88.52,-28.2"/>
<polygon points="88.39,-30.65 95.39,-28.2 88.39,-25.75 88.39,-30.65"/>
<text text-anchor="middle" x="75.75" y="-31.35" font-size="10.50">r</text>
</g>
</g>
</svg>`;

/** A point in the graph's own units, moved by the graph's translate into the drawing's. */
const at = (x, y) => [x + 7.2, y + 63.6];

describe('the areas of a drawing', () => {
  test('each box and each link, by its id, in the drawing’s units', () => {
    const a = hitAreas(SVG);
    assert.deepEqual(a.viewBox, { x: 0, y: 0, width: 166, height: 71 });
    assert.deepEqual(
      a.shapes.map((s) => [s.id, s.kind]),
      [
        ['node1', 'node'],
        ['node2', 'node'],
        ['edge1', 'edge'],
      ],
    );
  });

  test('every box and link of a real drawing has an area', async () => {
    const engine = await loadEngine();
    const r = readNote(["// graph: g\n(a:T {name: 'A'}),\n(b:T {name: 'B'}),\n(c:T),\n(a)-[:R]->(b), (b)-[:S]->(c)"]);
    const a = hitAreas(draw(r.graphs.get('g'), engine).svg);
    assert.deepEqual(a.shapes.map((s) => s.id).sort(), ['edge1', 'edge2', 'node1', 'node2', 'node3']);
    for (const s of a.shapes) assert.ok(s.polygons.length + s.lines.length > 0, s.id);
  });
});

describe('what is near a tap', () => {
  const a = hitAreas(SVG);

  test('a tap inside a box, away from everything else, is that box alone', () => {
    assert.deepEqual(nearby(a, ...at(27, -45), 8), ['node1']);
  });

  test('a tap near a box but outside it still finds it', () => {
    assert.deepEqual(nearby(a, ...at(27, -62), 8), ['node1']);
  });

  test('a tap near a link’s line finds the link; on its arrowhead or its label too', () => {
    assert.deepEqual(nearby(a, ...at(72, -24), 8), ['edge1']);
    assert.deepEqual(nearby(a, ...at(94, -28.2), 1), ['edge1']);
    assert.deepEqual(nearby(a, ...at(75.75, -34), 1), ['edge1']);
  });

  test('where a link meets a box, both are found: the one tapped on first, then the nearest', () => {
    assert.deepEqual(nearby(a, ...at(52, -28.2), 8), ['node1', 'edge1']);
    assert.deepEqual(nearby(a, ...at(58, -28.2), 8), ['edge1', 'node1']);
  });

  test('a tap far from everything finds nothing', () => {
    assert.deepEqual(nearby(a, ...at(75, -2), 4), []);
  });
});

describe('tapping again in the same place', () => {
  test('selects the next thing near, round and back to the first', () => {
    const c = new TapCycle(10);
    assert.equal(c.tap(10, 10, ['node1', 'edge1']), 'node1');
    assert.equal(c.tap(12, 11, ['node1', 'edge1']), 'edge1');
    assert.equal(c.tap(11, 9, ['node1', 'edge1']), 'node1');
  });

  test('a tap somewhere else starts again with the nearest', () => {
    const c = new TapCycle(10);
    c.tap(10, 10, ['node1', 'edge1']);
    assert.equal(c.tap(40, 10, ['node1', 'edge1']), 'node1');
  });

  test('the same place with other things near starts again too', () => {
    const c = new TapCycle(10);
    c.tap(10, 10, ['node1', 'edge1']);
    assert.equal(c.tap(10, 10, ['edge1', 'node1']), 'edge1');
  });

  test('a tap near nothing selects nothing, and the next tap starts again', () => {
    const c = new TapCycle(10);
    c.tap(10, 10, ['node1', 'edge1']);
    assert.equal(c.tap(10, 10, []), null);
    assert.equal(c.tap(10, 10, ['node1', 'edge1']), 'node1');
  });
});
