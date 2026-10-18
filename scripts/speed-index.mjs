// How fast this machine is (spec §12, quality_ratchet): the time a fixed piece of plain work takes, in ms, the least of
// seven runs. The quality metrics record it as `speed_index`, and scale their timings by it when machines differ
// (scripts/quality-check.mjs). It is a loop with no branches. So it says how fast the machine runs plain work, and
// nothing of how coverage slows the core's code. No test scales a time by it, as a test asserts the work done, never
// the time taken (12 Oct 2026).

// what the plain work gives, kept where the module can see it, so the work is never dropped as unused
let sink = 0;

/** The fixed plain work: three million rounds of a multiply and shift. Returns what it made. */
export function plainWork() {
  let h = 0;
  for (let i = 0; i < 3e6; i++) h = (Math.imul(h ^ i, 16777619) + (i >> 3)) | 0;
  return h;
}

/** The speed index by `clock`, in ms (the wall clock by default): the least of seven runs of the plain work, to 0.01. */
export function speedIndex(clock = () => performance.now()) {
  let least = Infinity;
  for (let k = 0; k < 7; k++) {
    const t = clock();
    sink ^= plainWork();
    least = Math.min(least, clock() - t);
  }
  return Math.round(least * 100) / 100;
}
