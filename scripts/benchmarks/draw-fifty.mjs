// The instruction-count benchmark of drawing a graph of 50 things (spec §11, fifty_in_half_second). It is read and
// drawn by two routes:
// - by the engine on the calling thread, as render.test.js drew it;
// - through the core's layout runner, as the plugin draws it apart from its interface (layout-worker.test.js).
// The runner's port is served in this process, as the plugin's page port is. So no second thread, with its own start
// and its own timing, is in the count. Each is one draw after a warm one. The engine's start and the warm draw are the
// setup, counted alone and taken off. Run by scripts/instruction-counts.mjs.
import { readNote } from '../../packages/core/src/drawing.ts';
import { draw } from '../../packages/core/src/render.ts';
import { LAYOUT_LIMITS } from '../../packages/core/src/layout-limits.ts';
import { LayoutRunner, inThreadPort, serveLayouts } from '../../packages/core/src/layout-worker.ts';
import { withinBudget } from './budgets.mjs';

/** A graph of `count` things and `links` links, of five kinds and three types, each thing named in a few words. */
export function graphOf(count, links) {
  const kinds = ['Question', 'Option', 'Reason', 'Claim', 'Source'],
    types = ['ANSWERS', 'FAVOURS', 'CITES'];
  const nodes = Array.from(
    { length: count },
    (_, i) => `(n${i}:${kinds[i % 5]} {name: 'Thing ${i}, a few words long'})`,
  );
  const edges = Array.from(
    { length: links },
    (_, i) => `(n${i % count})-[:${types[i % 3]}]->(n${(i * 7 + 3) % count})`,
  );
  return `// graph: g\n${[...nodes, ...edges].join(',\n')}`;
}

/** A graph of 50 things and 70 links, as the spec's half second is about. */
export const fiftyThings = () => graphOf(50, 70);

/** A drawing that is not an SVG is a broken benchmark, never a count. */
function drawn(result, count) {
  if (!result?.svg?.startsWith('<svg')) throw new Error(`the graph of ${count} things was not drawn`);
  return result;
}

/**
 * A benchmark of drawing a graph of `count` things and `links` links, on the calling thread and through the layout
 * runner. Each case's count is held to `budget` (budgets.mjs) by a claim that says `says` of its route.
 */
export function drawingBenchmark({ name, spec, count, links, budget, says }) {
  return {
    name,
    spec,
    proves: `a graph of ${count} things is read and drawn, on the calling thread and through the layout runner, ${says}`,
    async setup() {
      // the engine is loaded only here, so no other benchmark starts it
      const { loadEngine } = await import('../../packages/core/src/engine.ts');
      const engine = await loadEngine();
      const block = graphOf(count, links);
      // no time limit can fire while the counting slows the engine down: the work counted is the layout, never a timeout
      const limits = () => ({ ...LAYOUT_LIMITS, ms: 1e9, startMs: 1e9 });
      const spawn = () => inThreadPort((scope) => serveLayouts(scope, async () => engine));
      const clock = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };
      const runner = new LayoutRunner({ worker: spawn, page: spawn, clock, limits });
      // warm: the first draws compile the engine's code paths, on each route
      drawn(draw(readNote([block]).graphs.get('g'), engine), count);
      drawn(await runner.draw(readNote([block]).graphs.get('g')), count);
      return { engine, block, runner, close: () => runner.close() };
    },
    cases: {
      draw: ({ engine, block }) => drawn(draw(readNote([block]).graphs.get('g'), engine), count),
      'through-runner': async ({ runner, block }) => drawn(await runner.draw(readNote([block]).graphs.get('g')), count),
    },
    counted: ['draw', 'through-runner'],
    // the engine's WebAssembly compiled by the optimising compiler alone, in the warm draw (instruction-counts.mjs)
    nodeFlags: ['--no-liftoff'],
    claims: [
      withinBudget(budget, 'draw', `read and drawn ${says}`),
      withinBudget(budget, 'through-runner', `read and drawn through the layout runner ${says}`),
    ],
  };
}

/** The benchmark: what it proves, its setup, its cases, the cases its count sums, and its claims. */
export const BENCHMARK = drawingBenchmark({
  name: 'draw_fifty',
  spec: '§11, fifty_in_half_second',
  count: 50,
  links: 70,
  budget: 'draw_fifty',
  says: 'in under half a second on a mid-range phone’s big core, about 4 instructions a nanosecond',
});
