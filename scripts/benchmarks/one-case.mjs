// One case of one benchmark, in a process of its own, for Cachegrind to count (scripts/instruction-counts.mjs bundles
// this file and runs it): `node one-case.mjs <benchmark> <case>` builds the benchmark's setup and does the case once;
// `setup` as the case does the setup alone, which is taken off every case's count. It prints nothing; a case that goes
// wrong throws, so the process fails and no count is kept.
import { BENCHMARKS } from './index.mjs';

const [name, which] = process.argv.slice(2);
const benchmark = BENCHMARKS.find((b) => b.name === name);
if (!benchmark) throw new Error(`no benchmark ${name}`);
if (which !== 'setup' && !benchmark.cases[which]) throw new Error(`${name} has no case ${which}`);
const inputs = await benchmark.setup();
// what the case gave, kept where nothing can drop it as unused
globalThis.benchmarkResult = which === 'setup' ? null : await benchmark.cases[which](inputs);
inputs?.close?.();
