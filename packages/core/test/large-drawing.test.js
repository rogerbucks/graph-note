// A large graph drawn quickly (spec §11, large_drawn_quick). Past 300 things a graph is laid out once, in one
// direction, with Graphviz's quick settings. Laid out both ways in full, 2,000 things took close to a minute on a
// desktop. That is far past the five seconds a layout may take. The quick way takes about three. A graph of 300
// things or fewer is laid out as before, byte for byte.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import * as render from '../src/render.ts';
import { STYLE } from '../src/layout.ts';
import { loadEngine } from '../src/engine.ts';

const { directions, draw } = render;
/** Past this many things a graph is laid out quickly. */
const QUICK_LAYOUT = 300;

/** A graph of `n` things, each linked to the one before. */
const chain = (n) =>
  readNote([
    `// graph: g\n${[
      ...Array.from({ length: n }, (_, i) => `(t${i}:Thing {name: 'Thing ${i}'})`),
      ...Array.from({ length: n - 1 }, (_, i) => `(t${i})-[:THEN]->(t${i + 1})`),
    ].join(',\n')}`,
  ]).graphs.get('g');

describe('a large graph', () => {
  // proves: large_drawn_quick
  test('of more than 300 things is laid out once, in the first direction, with the quick settings', () => {
    assert.equal(render.QUICK_LAYOUT, QUICK_LAYOUT);
    const laid = directions(chain(QUICK_LAYOUT + 1));
    assert.deepEqual(
      laid.map((d) => d.rankdir),
      [STYLE.directions[0]],
    );
    assert.match(laid[0].dot, /^ {2}graph \[nslimit=0\.5, mclimit=0\.05\];$/m);
  });

  // proves: large_drawn_curved
  test('keeps its links curved: the quick settings never draw them straight (Roger, 23 Oct 2026)', () => {
    const [laid] = directions(chain(QUICK_LAYOUT + 1));
    assert.doesNotMatch(laid?.dot ?? '', /splines/, 'Graphviz curves links unless told otherwise');
  });

  // proves: large_drawn_quick
  test('of 300 things or fewer is laid out each way in full, as before', () => {
    const laid = directions(chain(QUICK_LAYOUT));
    assert.deepEqual(
      laid.map((d) => d.rankdir),
      STYLE.directions,
    );
    for (const d of laid) assert.doesNotMatch(d.dot, /nslimit|mclimit|splines/);
  });

  // proves: large_drawn_quick
  test('keeps its own direction when it was given one', () => {
    const g = chain(QUICK_LAYOUT + 1);
    const own = STYLE.directions.at(-1);
    const laid = directions({ ...g, direction: own });
    assert.deepEqual(
      laid.map((d) => d.rankdir),
      [own],
    );
    assert.match(laid[0].dot, /nslimit=0\.5/);
  });

  // proves: large_drawn_quick
  test('keeps the routing a person chose: it is written after the quick settings, so it wins', () => {
    const lines = directions({ ...chain(QUICK_LAYOUT + 1), routing: 'right-angled' })[0].dot.split('\n');
    const quick = lines.findIndex((l) => l.includes('nslimit=0.5')),
      chosen = lines.findIndex((l) => l.includes('splines=ortho'));
    assert.ok(quick > 0 && chosen > quick, `the quick settings on line ${quick}, the routing chosen on ${chosen}`);
  });

  // proves: large_drawn_quick
  test('is still drawn whole: every thing has its box', async () => {
    const engine = await loadEngine();
    const drawn = draw(chain(QUICK_LAYOUT + 1), engine);
    assert.equal(drawn.rankdir, STYLE.directions[0]);
    assert.equal(drawn.svg.match(/class="node"/g).length, QUICK_LAYOUT + 1);
  });
});
