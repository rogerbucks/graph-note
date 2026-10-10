// Timing for the core's speed tests (spec §9, §11): processor time, every thread of this process, never the clock. The
// clock runs on while a busy machine runs something else: four whole suites at once, with a load average of 176 on 10
// cores, slowed a step by the clock up to 60 times against a plain pass measured beside it (10 Oct 2026). Each speed
// test holds a step to a baseline measured beside it, and to its old number of milliseconds, now in processor time, as
// a backstop against a slowdown that would slow the baseline too (the review of #40).

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

/** The least processor time of three plain passes over a text, in ms: the unit a refusal that only measures is priced in. */
export function onePass(text) {
  return fastest(3, () => {
    let spaces = 0;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 0x20) spaces++;
    return spaces;
  }).ms;
}
