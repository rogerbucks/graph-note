// Curves kept by what was laid out (spec §11, curves_saved). Past 300 things a card is drawn straight first, and its
// curves are laid out next (curves_after_drawing). The worker keeps those curves. So the same graph opened again is
// drawn curved at once, with no Graphviz run at all.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { QUICK_LAYOUT } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';
import { inThreadPort, serveLayouts } from '../src/layout-worker.ts';
import { CurvesSaved } from '../src/curves-saved.ts';

/** A graph of `n` things, each linked to the one before; `name` changes every box's text. */
const chain = (n, name = 'Thing') =>
  readNote([
    `// graph: g\n${[
      ...Array.from({ length: n }, (_, i) => `(t${i}:Thing {name: '${name} ${i}'})`),
      ...Array.from({ length: n - 1 }, (_, i) => `(t${i})-[:THEN]->(t${i + 1})`),
    ].join(',\n')}`,
  ]).graphs.get('g');

const big = chain(QUICK_LAYOUT + 1);

/** A worker served on this thread, counting what its engine is asked to lay out. */
async function counting() {
  const engine = await loadEngine();
  const laid = [];
  const counted = { render: (dot) => (laid.push(dot), engine.render(dot)) };
  const port = inThreadPort((scope) => serveLayouts(scope, async () => counted));
  const waiting = new Map();
  let next = 1;
  port.onmessage = ({ data }) => {
    if ('id' in data) waiting.get(data.id)?.(data);
  };
  const ask = (drawing) =>
    new Promise((resolve) => {
      const id = next++;
      waiting.set(id, resolve);
      port.postMessage({ id, drawing, sourceBytes: 10_000_000 });
    });
  return { laid, ask };
}

describe('curves kept by what was laid out', () => {
  // proves: curves_saved
  test('a large graph asked for straight first again comes back curved at once, with no layout', async () => {
    const { laid, ask } = await counting();
    const first = await ask({ ...big, straightFirst: true });
    assert.equal(first.drawn.curvesToCome, true);
    const curved = await ask(big);
    const before = laid.length;
    const again = await ask({ ...big, straightFirst: true });
    assert.equal(laid.length, before, 'Graphviz is not run for curves it laid out before');
    assert.equal(again.drawn.curvesToCome, undefined);
    assert.equal(again.drawn.svg, curved.drawn.svg);
  });

  // proves: curves_saved
  test('a changed graph is drawn straight first again, and small graphs are laid out each time', async () => {
    const { laid, ask } = await counting();
    await ask(big);
    const changed = await ask({ ...chain(QUICK_LAYOUT + 1, 'Step'), straightFirst: true });
    assert.equal(changed.drawn.curvesToCome, true);
    const small = chain(QUICK_LAYOUT);
    await ask(small);
    const before = laid.length;
    await ask(small);
    assert.ok(laid.length > before, 'a small graph is laid out as before');
  });

  // proves: curves_saved
  test('keeps the newest up to its size, and lets the oldest go', () => {
    const saved = new CurvesSaved(10);
    saved.keep('a', '1234');
    saved.keep('b', '1234');
    assert.equal(saved.get('a'), '1234', 'reading one makes it the newest');
    saved.keep('c', '1234');
    assert.equal(saved.get('b'), undefined, 'the oldest is let go past the size');
    assert.equal(saved.get('a'), '1234');
    assert.equal(saved.get('c'), '1234');
    saved.keep('d', '12345678901');
    assert.equal(saved.get('d'), undefined, 'one larger than the size is never kept');
  });
});
