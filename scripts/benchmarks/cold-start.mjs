// The instruction-count benchmark of each host's cold start (editor spec §41, speed_budgets). It takes a note of 50
// things, from a process that has drawn nothing, to its first drawing, one case for each host.
// - The Obsidian plugin's start: the core's layout runner, the engine started in its worker's port, and the note read
//   and drawn. The port is served in this process as draw-fifty.mjs serves it. So no second thread, with its own start
//   and its own timing, is in the count.
// - The Claude Code pane's start: its view of the note (graph-view.ts) loaded and run. The core's engine is laid out
//   in this process as the pane's Graphviz process does it (bin/render-process.ts), less Node starting that process.
// The engine and each host's own code are loaded in the case. What every benchmark shares is the setup, counted alone
// and taken off. Run by scripts/instruction-counts.mjs.
import { readNote } from '../../packages/core/src/drawing.ts';
import { LAYOUT_LIMITS } from '../../packages/core/src/layout-limits.ts';
import { LayoutRunner, inThreadPort, serveLayouts } from '../../packages/core/src/layout-worker.ts';
import { withinBudget } from './budgets.mjs';
import { fiftyThings } from './draw-fifty.mjs';

/** A drawing that is not an SVG is a broken benchmark, never a count. */
function drawn(result, host) {
  if (!result?.svg?.startsWith('<svg')) throw new Error(`${host} drew nothing on its cold start: ${result?.why ?? ''}`);
  return result;
}

/** The Obsidian plugin's first drawing: the runner, its engine started on first use, and the note drawn. */
async function obsidian({ note }) {
  const { loadEngine } = await import('../../packages/core/src/engine.ts');
  // no time limit can fire while the counting slows the engine down: the work counted is the start, never a timeout
  const limits = () => ({ ...LAYOUT_LIMITS, ms: 1e9, startMs: 1e9 });
  const port = () => inThreadPort((scope) => serveLayouts(scope, loadEngine));
  const clock = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };
  const runner = new LayoutRunner({ worker: port, page: port, clock, limits });
  try {
    return drawn(await runner.draw(readNote([note]).graphs.get('g')), 'the Obsidian plugin');
  } finally {
    runner.close();
  }
}

/** The Claude Code pane's first drawing: its view of the note, the engine laying the sources out as its process does. */
async function claudeCode({ note }) {
  const { viewOf, PANE_PALETTE } = await import('../../packages/claude-code/src/graph-view.ts');
  const lay = async (dots) => {
    const { loadEngine } = await import('../../packages/core/src/engine.ts');
    const engine = await loadEngine();
    return { svgs: dots.map((d) => engine.render(d)) };
  };
  return drawn(await viewOf(`# A note\n\n\`\`\`gql\n${note}\n\`\`\`\n`, lay, PANE_PALETTE), 'the Claude Code pane');
}

/** The benchmark: what it proves, its setup, its cases, the cases its count sums, and its claims. */
export const BENCHMARK = {
  name: 'cold_start',
  spec: '§41, speed_budgets',
  proves: 'each host draws a note of 50 things from a cold start within its own budget',
  setup: () => ({ note: fiftyThings() }),
  cases: {
    obsidian,
    'claude-code': claudeCode,
  },
  counted: ['obsidian', 'claude-code'],
  claims: [
    withinBudget(
      'cold_start_obsidian',
      'obsidian',
      'the Obsidian plugin draws its first note of 50 things from a cold start within its budget',
    ),
    withinBudget(
      'cold_start_claude_code',
      'claude-code',
      'the Claude Code pane draws its first note of 50 things from a cold start within its budget',
    ),
  ],
};
