#!/usr/bin/env node
// The work the benchmarks take, counted in CPU instructions and never in elapsed time (spec §12, quality_ratchet): each
// case of each benchmark in scripts/benchmarks/ runs in a process of its own under Valgrind's Cachegrind, and so does
// its setup alone, which is taken off. The total instructions (Ir) Cachegrind writes to its output file are the count.
// The same code on the same machine counts the same, under any load; a machine without Valgrind measures nothing and
// says so, never a number of another kind. Cachegrind runs on Linux, in the release's quality job and its dry run; it
// does not run on Apple-silicon Macs.
//
// Usage:
//   node scripts/instruction-counts.mjs                    count every benchmark, print the metrics JSON
//   node scripts/instruction-counts.mjs --only naming      count one benchmark
//   node scripts/instruction-counts.mjs --runs 3           count each process three times: the least is kept, and the
//                                                          spread between runs reported (what the tolerance rests on)
//   node scripts/instruction-counts.mjs --out <file>       write the JSON to a file instead
// Exits 1 when a benchmark's claim does not hold.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CASE_MS = 15 * 60 * 1000;

/**
 * Node's flags for a count, each to take a source of difference between runs away: V8 runs no background thread
 * (`--single-threaded`: no concurrent compiling, marking or sweeping, whose share of the work depends on timing), its
 * collector grows the heap on a fixed schedule rather than by measured speed (`--predictable-gc-schedule`), its random
 * numbers start from one seed (`--random-seed=1`), and WebAssembly checks its bounds in code instead of by catching
 * faults in reserved memory (`--disable-wasm-trap-handler`), which Valgrind follows plainly.
 */
export const NODE_FLAGS = [
  '--single-threaded',
  '--predictable-gc-schedule',
  '--random-seed=1',
  '--disable-wasm-trap-handler',
];

/**
 * Cachegrind counting instructions only (`--cache-sim=no`), and translating again any code that is rewritten, as V8's
 * compiled code is (`--smc-check=all`).
 */
export const VALGRIND_FLAGS = ['--tool=cachegrind', '--cache-sim=no', '--smc-check=all'];

/** Why nothing was counted on a machine without Valgrind. */
export const NOT_MEASURED =
  'not measured: valgrind is not installed here. Cachegrind runs on Linux, in the release and its dry run; it does not run on Apple-silicon Macs';

/** The metric a benchmark's count is held to, by its name. */
export const metricOf = (name) => `instructions_${name}`;
/** The metric of the benchmarks' claims that do not hold: none may. */
export const CLAIMS_METRIC = 'instruction_claims_broken';

/**
 * Reads a Cachegrind output file: its command, the events it counted, and their totals (its `summary:` line, or the sum
 * of its cost lines when it has none). Throws when the file holds no count of instructions (Ir).
 */
export function parseCachegrind(text) {
  const lines = text.split('\n');
  const field = (name) => {
    const line = lines.find((l) => l.startsWith(`${name}:`));
    return line === undefined ? undefined : line.slice(name.length + 1).trim();
  };
  const events = field('events')?.split(/\s+/) ?? [];
  if (!events.includes('Ir')) throw new Error('not a Cachegrind output file: it counts no instructions (Ir)');
  const summary = field('summary') ?? field('totals');
  let sums;
  if (summary) sums = summary.split(/\s+/).map(Number);
  else {
    // each cost line is a line number and then a count for each event, in the order `events:` gives
    sums = events.map(() => 0);
    for (const l of lines.filter((x) => /^\d+(?: \d+)+$/.test(x)))
      l.split(' ')
        .slice(1)
        .forEach((n, i) => (sums[i] += Number(n)));
  }
  if (sums.length < events.length || sums.some((n) => !Number.isSafeInteger(n)))
    throw new Error(`a Cachegrind output file whose totals cannot be read: ${summary}`);
  return { command: field('cmd') ?? '', events, totals: Object.fromEntries(events.map((e, i) => [e, sums[i]])) };
}

/** The installed Valgrind's version, as `valgrind-3.22.0`, or null when there is none. */
export function valgrindVersion() {
  const r = spawnSync('valgrind', ['--version'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The metrics and details of a run that counted nothing, and why: every count null, never a number of another kind. */
export function notMeasured(names, why = NOT_MEASURED) {
  return {
    metrics: Object.fromEntries([...names.map((n) => [metricOf(n), null]), [CLAIMS_METRIC, null]]),
    details: { instructions: { measured: false, why } },
  };
}

/**
 * The metrics of the counts, each case's already less its setup: for each benchmark, the sum of the cases it counts;
 * and how many of the claims do not hold, each claim listed with what was measured and what is allowed.
 */
export function instructionMetrics(benchmarks, counts) {
  const metrics = {},
    claims = [];
  for (const b of benchmarks) {
    metrics[metricOf(b.name)] = b.counted.reduce((sum, c) => sum + counts[b.name][c], 0);
    for (const claim of b.claims) {
      const [measured, allowed] = claim.of(counts[b.name]);
      claims.push({ benchmark: b.name, says: claim.says, measured, allowed, holds: measured < allowed });
    }
  }
  metrics[CLAIMS_METRIC] = claims.filter((c) => !c.holds).length;
  return { metrics, claims };
}

/**
 * How far a benchmark's metric could move between runs, as a share of it: each counted case's range over the runs and
 * the setup's, as the metric is each case less the setup. The ratchet's tolerance must be wider than this.
 */
export function metricSpread(benchmark, range, metrics) {
  const moved = benchmark.counted.reduce((sum, c) => sum + range[c] + range.setup, 0);
  return moved / metrics[metricOf(benchmark.name)];
}

/** Bundles the benchmarks into a folder, one file to run and a chunk for the engine, so a count reads no TypeScript. */
export async function bundleBenchmarks(dir) {
  const { default: esbuild } = await import('esbuild');
  await esbuild.build({
    entryPoints: [join(ROOT, 'scripts/benchmarks/one-case.mjs')],
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    outdir: dir,
    outExtension: { '.js': '.mjs' },
    logLevel: 'silent',
  });
  return join(dir, 'one-case.mjs');
}

/** Counts processes under Cachegrind: one case of one benchmark at a time, its output file in a folder of its own. */
async function cachegrind() {
  const dir = mkdtempSync(join(tmpdir(), 'instruction-counts-'));
  const script = await bundleBenchmarks(join(dir, 'bundle'));
  // a fixed, small environment, so nothing of the shell's reaches the count
  const env = { PATH: process.env.PATH ?? '', LC_ALL: 'C', TZ: 'UTC' };
  let n = 0;
  return {
    count(benchmark, which) {
      const out = join(dir, `cachegrind.out.${n++}`);
      const args = [...VALGRIND_FLAGS, `--cachegrind-out-file=${out}`, process.execPath, ...NODE_FLAGS];
      const r = spawnSync('valgrind', [...args, script, benchmark, which], {
        env,
        encoding: 'utf8',
        timeout: CASE_MS,
        maxBuffer: 1 << 26,
      });
      if (r.status !== 0) {
        const said = (r.stderr ?? '').trim().split('\n').slice(-5).join('\n');
        throw new Error(`${benchmark} ${which} failed under Cachegrind (${r.error?.message ?? r.status}):\n${said}`);
      }
      return parseCachegrind(readFileSync(out, 'utf8')).totals.Ir;
    },
    done: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Counts every case of `benchmarks` (all of them by default) and its setup, `runs` times each, keeping the least, and
 * gives the metrics and details as quality-metrics.mjs reports them. Without Valgrind (`version` gives null), it counts
 * nothing and says so. `counter` is what counts a process: Cachegrind, unless a test hands in another.
 */
export async function measureInstructions(options = {}) {
  const { runs = 1, version = valgrindVersion, counter = cachegrind } = options;
  const benchmarks = options.benchmarks ?? (await import('./benchmarks/index.mjs')).BENCHMARKS;
  const tool = version();
  if (!tool) return notMeasured(benchmarks.map((b) => b.name));
  const counting = await counter();
  try {
    const counts = {},
      ranges = {},
      reported = [];
    for (const b of benchmarks) {
      const least = {},
        range = {};
      for (const which of ['setup', ...Object.keys(b.cases)]) {
        const got = Array.from({ length: runs }, () => counting.count(b.name, which));
        least[which] = Math.min(...got);
        range[which] = Math.max(...got) - least[which];
      }
      counts[b.name] = Object.fromEntries(Object.keys(b.cases).map((c) => [c, least[c] - least.setup]));
      ranges[b.name] = range;
      reported.push({ name: b.name, spec: b.spec, proves: b.proves, setup: least.setup, cases: counts[b.name] });
    }
    const { metrics, claims } = instructionMetrics(benchmarks, counts);
    if (runs > 1) reported.forEach((r, i) => (r.spread = metricSpread(benchmarks[i], ranges[r.name], metrics)));
    const machine = { os: platform(), arch: arch(), node_major: Number(process.versions.node.split('.')[0]) };
    const instructions = {
      measured: true,
      machine: { ...machine, node: process.version, valgrind: tool },
      flags: { node: NODE_FLAGS, valgrind: VALGRIND_FLAGS },
      runs,
      benchmarks: reported,
      claims,
    };
    if (runs > 1) instructions.largest_spread = Math.max(...reported.map((b) => b.spread));
    return { metrics, details: { instructions } };
  } finally {
    counting.done();
  }
}

async function main(argv) {
  const value = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const { BENCHMARKS } = await import('./benchmarks/index.mjs');
  const only = value('--only');
  const benchmarks = only ? BENCHMARKS.filter((b) => b.name === only) : BENCHMARKS;
  if (!benchmarks.length) {
    console.error(`no benchmark ${only}: ${BENCHMARKS.map((b) => b.name).join(', ')}`);
    return 2;
  }
  const result = await measureInstructions({ benchmarks, runs: Number(value('--runs') ?? 1) });
  const { instructions } = result.details;
  if (!instructions.measured) console.error(`instruction counts: ${instructions.why}`);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  const out = value('--out');
  if (out) writeFileSync(resolve(ROOT, out), text);
  else process.stdout.write(text);
  const broken = (instructions.claims ?? []).filter((c) => !c.holds);
  for (const c of broken)
    console.error(`a claim does not hold: ${c.benchmark}, ${c.says} (${c.measured} ≥ ${c.allowed})`);
  return broken.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
