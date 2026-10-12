// How fast this machine is (spec §12, quality_ratchet): the time a fixed piece of plain work takes, in ms, the least of
// seven runs. The quality metrics record it as `speed_index`, and scale their timings by it when machines differ
// (scripts/quality-check.mjs). The speed tests scale by it too: a budget the spec states for a desktop is held, on any
// other machine, to that budget times how much slower the plain work runs there, measured in processor time in the
// same process. So a shared runner that is slower, or a run that coverage slows, is given proportionally longer, and a
// faster machine less; never a number simply widened (12 Oct 2026).

/**
 * The speed index of the desktop the spec's budgets were set on: an Apple silicon Mac, darwin, Node 26, as
 * quality/baseline.json measured it on 9 Oct 2026. Fixed here, not read from the baseline, so a baseline measured later
 * on the CI runner does not turn the runner into the desktop.
 */
export const DESKTOP_SPEED_INDEX = 3.86;

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

/** The processor time this process has used so far, every thread of it, in ms. */
export function processorTime() {
  const { user, system } = process.cpuUsage();
  return (user + system) / 1000;
}

let here;

/** This process's speed index in processor time, measured the first time it is asked for and kept. */
export function processorSpeedIndex() {
  here ??= speedIndex(processorTime);
  return here;
}

/**
 * A budget the spec states in ms on the desktop, on this machine: scaled by its speed `index` (by default, this process's
 * in processor time) against the desktop's.
 */
export function onThisMachine(desktopMs, index = processorSpeedIndex()) {
  return (desktopMs * index) / DESKTOP_SPEED_INDEX;
}
