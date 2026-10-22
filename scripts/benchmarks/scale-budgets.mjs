// The budgets of the scale benchmark (editor spec §53, scale_benchmark; scripts/scale-benchmark.mjs). For each step
// and each size, the most milliseconds it may take and the most megabytes of memory it may keep. A size is a number of
// copies of the V-10 huge graph.
//
// Each was set from two runs on a cloud desktop core (Linux, Node 22, 22 Oct 2026): about three times the slower run,
// rounded up. That leaves room for a slower CI runner, and still catches a step that gets many times slower. When a
// step is rebuilt (wiki/Massive-graphs-design.md, way E), its budget is set again from new runs, and written down why.
// A step not built yet has no budget.

/** The most each step may take, by size: { ms, mb }. */
export const SCALE_BUDGETS = {
  // 1×: read in about 0.4 s. 10× and 100×: refused over the read limit, which still counts every byte first
  open: { 1: { ms: 1500, mb: 50 }, 10: { ms: 150, mb: 20 }, 100: { ms: 1200, mb: 20 } },
  // 1×: refused over the drawing limit in under a millisecond, so shown as text
  draw: { 1: { ms: 50, mb: 20 } },
  // the groups a massive graph opens as (scale_groups): about 6 ms, 0.13 s and 1 s. Past the read limit they are found
  // on copies of the V-10 drawing, as the reader refuses the text
  group: { 1: { ms: 100, mb: 20 }, 10: { ms: 800, mb: 50 }, 100: { ms: 5000, mb: 100 } },
  // the overview as marks, and its index of where they are (scale_overview): about 5 ms, 8 ms and 57 ms
  overview: { 1: { ms: 50, mb: 20 }, 10: { ms: 50, mb: 20 }, 100: { ms: 300, mb: 50 } },
  // the slowest of 61 frames, the first with the whole overview on screen: about 0.3 ms, 1.5 ms and 14 ms. A frame
  // must stay under 16 ms to be smooth; the budget leaves room for a slower runner, and the renderer culls the rest
  pan: { 1: { ms: 10, mb: 5 }, 10: { ms: 16, mb: 5 }, 100: { ms: 50, mb: 20 } },
  // 1×: a note set on one thing and the note read again, about 0.7 s. 10× and 100×: refused, after reading the block
  edit: { 1: { ms: 2500, mb: 50 }, 10: { ms: 1200, mb: 20 }, 100: { ms: 12_000, mb: 20 } },
};
