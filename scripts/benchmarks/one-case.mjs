// One case of one benchmark, in a process of its own, for Cachegrind to count: scripts/instruction-counts.mjs bundles
// each benchmark with this file, on its own, and runs `node <bundle> <case>`, which builds the benchmark's setup and does
// the case once; `setup` as the case does the setup alone, which is taken off every case's count. It prints nothing; a
// case that goes wrong throws, so the process fails and no count is kept.

/** Builds the setup of `benchmark` and does its case `which` once (or nothing more, for `setup`). */
export async function runCase(benchmark, which) {
  if (which !== 'setup' && !benchmark.cases[which]) throw new Error(`${benchmark.name} has no case ${which}`);
  const inputs = await benchmark.setup();
  // what the case gave, kept where nothing can drop it as unused
  globalThis.benchmarkResult = which === 'setup' ? null : await benchmark.cases[which](inputs);
  inputs?.close?.();
}
