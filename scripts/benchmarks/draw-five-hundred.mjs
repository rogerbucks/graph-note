// The instruction-count benchmark of drawing a graph of 500 things (editor spec §41, speed_budgets). It is ten times
// the graph of draw-fifty.mjs, read and drawn by the same two routes. They are on the calling thread, and through the
// layout runner as the Obsidian plugin draws, each held to its budget. The engine's start and a warm draw are the
// setup, counted alone and taken off. Run by scripts/instruction-counts.mjs.
import { drawingBenchmark } from './draw-fifty.mjs';

/** The benchmark: what it proves, its setup, its cases, the cases its count sums, and its claims. */
export const BENCHMARK = drawingBenchmark({
  name: 'draw_five_hundred',
  spec: '§41, speed_budgets',
  count: 500,
  links: 700,
  budget: 'draw_five_hundred',
  says: 'within its budget of instructions',
});
