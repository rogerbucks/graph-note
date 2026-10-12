// Timing for the core's speed tests that compare like with like (spec §9, §11): processor time, every thread of this
// process, never the clock, which runs on while a busy machine runs something else (10 Oct 2026). A test asserts the
// work done, never the time taken (spec §12, quality_ratchet, 12 Oct 2026): where what is held is work, such as a text
// never read or a block read again only within its budget, the work is counted (reader-work.js). What is left here is a
// step held to a step of the same kind measured beside it in the same run, as a ratio, never to a number of
// milliseconds; those ratios move to the instruction-count benchmarks.

/** The processor time this process has used so far, every thread of it, in ms. */
export function used() {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
}

/** The processor time one run of a step took, in ms, and what it gave. */
export function timed(step) {
  const t = used();
  const out = step();
  return { ms: used() - t, out };
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
