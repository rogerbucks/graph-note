// The instruction-count benchmarks (spec §12, quality_ratchet): a small, fixed set of deterministic pieces of work, each
// counted in CPU instructions by Valgrind's Cachegrind, never timed. scripts/instruction-counts.mjs runs each case of
// each benchmark in a process of its own, and its setup alone, and takes the one from the other.
//
// A benchmark is { name, spec, proves, setup, cases, counted, claims }: `setup()` builds what every case needs (and may
// return `close`, called before the process ends); each case does one piece of work on it; `counted` names the cases
// whose counts the ratchet sums; and each claim's `of(counts)` gives [measured, allowed], holding when measured < allowed.
import { BENCHMARK as COLD_START } from './cold-start.mjs';
import { BENCHMARK as DRAW_FIFTY } from './draw-fifty.mjs';
import { BENCHMARK as DRAW_FIVE_HUNDRED } from './draw-five-hundred.mjs';
import { BENCHMARK as KEYSTROKE } from './keystroke.mjs';
import { BENCHMARK as LAYOUT_REFUSALS } from './layout-refusals.mjs';
import { BENCHMARK as MESH_QUERY } from './mesh-query.mjs';
import { BENCHMARK as NAMING } from './naming.mjs';
import { BENCHMARK as READING_LIMITS } from './reading-limits.mjs';

/** Every benchmark, in the order they are run and reported. */
export const BENCHMARKS = [
  DRAW_FIFTY,
  READING_LIMITS,
  LAYOUT_REFUSALS,
  NAMING,
  KEYSTROKE,
  DRAW_FIVE_HUNDRED,
  MESH_QUERY,
  COLD_START,
];
