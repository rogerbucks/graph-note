// Timing for the core's speed tests (spec §9, §11): processor time, every thread of this process, never the clock. The
// clock runs on while a busy machine runs something else: four whole suites at once, with a load average of 176 on 10
// cores, slowed a step by the clock up to 60 times against a plain pass measured beside it (10 Oct 2026). Each speed
// test holds a step to a baseline measured beside it, of the same kind of work, and to its old number of milliseconds,
// now in processor time, as a backstop against a slowdown that would slow the baseline too (the review of #40). That old
// number is a desktop's, so it is scaled to the machine running the test by `onThisMachine` (scripts/speed-index.mjs):
// the release's second run of the suite, with coverage, on a shared runner, broke the old numbers unscaled, and a plain
// pass timed in the test, which coverage leaves fast while it slows the core (0.4.2, 12 Oct 2026). Where what is held is
// really work, such as a text never read or never written, the work is counted instead (reader-work.js).
import { processorTime } from '../../../scripts/speed-index.mjs';

export { onThisMachine, processorTime as used } from '../../../scripts/speed-index.mjs';

/** The processor time one run of a step took, in ms, and what it gave. */
export function timed(step) {
  const t = processorTime();
  const out = step();
  return { ms: processorTime() - t, out };
}

/** The least processor time of `n` runs of a step, in ms, and what the last gave. */
export function fastest(n, step) {
  let ms = Infinity,
    out;
  for (let k = 0; k < n; k++) {
    const run = timed(step);
    ms = Math.min(ms, run.ms);
    out = run.out;
  }
  return { ms, out };
}
