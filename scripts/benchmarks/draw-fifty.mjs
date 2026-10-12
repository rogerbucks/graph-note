// The instruction-count benchmark of drawing a graph of 50 things (spec §11, fifty_in_half_second): read and drawn by
// the engine on the calling thread, as render.test.js drew it, and through the core's layout runner, as the plugin draws
// it apart from its interface (layout-worker.test.js). Each is one draw after a warm one, as the tests had it; the
// engine's start and the warm draw are the setup, counted alone and taken off. Run by scripts/instruction-counts.mjs.
import { readNote } from '../../packages/core/src/drawing.ts';
import { draw } from '../../packages/core/src/render.ts';
import { LAYOUT_LIMITS } from '../../packages/core/src/layout-limits.ts';
import { LayoutRunner, inThreadPort, serveLayouts } from '../../packages/core/src/layout-worker.ts';

/**
 * Half a second at four instructions a nanosecond: a cautious figure for a phone's core, which runs at several GHz and
 * retires several instructions a cycle, so a count under it is inside the spec's half second there. The phone itself is
 * checked on the device (test_device); this holds the work to it on every release. Measured on Apple silicon by its
 * hardware counter, one draw was about 590 million (12 Oct 2026).
 */
export const HALF_SECOND = 2_000_000_000;

/** A graph of 50 things and 70 links, of five kinds and three types, as the spec's half second is about. */
export function fiftyThings() {
  const kinds = ['Question', 'Option', 'Reason', 'Claim', 'Source'],
    types = ['ANSWERS', 'FAVOURS', 'CITES'];
  const nodes = Array.from({ length: 50 }, (_, i) => `(n${i}:${kinds[i % 5]} {name: 'Thing ${i}, a few words long'})`);
  const links = Array.from({ length: 70 }, (_, i) => `(n${i % 50})-[:${types[i % 3]}]->(n${(i * 7 + 3) % 50})`);
  return `// graph: g\n${[...nodes, ...links].join(',\n')}`;
}

/** A drawing that is not an SVG is a broken benchmark, never a count. */
function drawn(result) {
  if (!result?.svg?.startsWith('<svg')) throw new Error('the graph of 50 things was not drawn');
  return result;
}

/** The benchmark: what it proves, its setup, its cases, the cases its count sums, and its claims. */
export const BENCHMARK = {
  name: 'draw_fifty',
  spec: '§11, fifty_in_half_second',
  proves:
    'a graph of 50 things is read and drawn, on the calling thread and through the layout runner, within half a second',
  async setup() {
    // the engine is loaded only here, so no other benchmark starts it
    const { loadEngine } = await import('../../packages/core/src/engine.ts');
    const engine = await loadEngine();
    const block = fiftyThings();
    // no time limit can fire while the counting slows the engine down: the work counted is the layout, never a timeout
    const limits = () => ({ ...LAYOUT_LIMITS, ms: 1e9, startMs: 1e9 });
    const spawn = () => inThreadPort((scope) => serveLayouts(scope, async () => engine));
    const clock = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };
    const runner = new LayoutRunner({ worker: spawn, page: spawn, clock, limits });
    // warm: the first draws compile the engine's code paths, on each route
    drawn(draw(readNote([block]).graphs.get('g'), engine));
    drawn(await runner.draw(readNote([block]).graphs.get('g')));
    return { engine, block, runner, close: () => runner.close() };
  },
  cases: {
    draw: ({ engine, block }) => drawn(draw(readNote([block]).graphs.get('g'), engine)),
    'through-runner': async ({ runner, block }) => drawn(await runner.draw(readNote([block]).graphs.get('g'))),
  },
  counted: ['draw', 'through-runner'],
  claims: [
    { says: 'read and drawn in under half a second', of: (n) => [n.draw, HALF_SECOND] },
    {
      says: 'read and drawn through the layout runner in under half a second',
      of: (n) => [n['through-runner'], HALF_SECOND],
    },
  ],
};
