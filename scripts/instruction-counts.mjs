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
//   node scripts/instruction-counts.mjs --parallel 2       count two processes at once (every core, by default)
//   node scripts/instruction-counts.mjs --out <file>       write the JSON to a file instead
//   node scripts/instruction-counts.mjs --reuse <file>     keep the counts of an earlier run (a metrics JSON, such as
//                                                          quality/baseline.json) for each benchmark whose fingerprint
//                                                          is unchanged: its bundle, the machine, Node and Valgrind
// Exits 1 when a benchmark's claim does not hold.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, availableParallelism, cpus, platform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CASE_MS = 15 * 60 * 1000;

/**
 * Node's flags for a count, each to take a source of difference between runs away: V8 runs no background thread
 * (`--single-threaded`: no concurrent compiling, marking or sweeping, whose share of the work depends on timing), makes
 * no decision by the clock (`--predictable`), its collector grows the heap on a fixed schedule rather than by measured
 * speed (`--predictable-gc-schedule`), its random numbers start from one seed (`--random-seed=1`), and WebAssembly
 * checks its bounds in code instead of by catching faults in reserved memory (`--disable-wasm-trap-handler`), which
 * Valgrind follows plainly. Counted three times under Cachegrind (ARM Linux in Docker, 12 Oct 2026), without
 * `--predictable` a metric moved by up to 8.9% between runs; with it, by at most 1.9% (draw_fifty), the rest 0.001%.
 */
export const NODE_FLAGS = [
  '--single-threaded',
  '--predictable',
  '--predictable-gc-schedule',
  '--random-seed=1',
  '--disable-wasm-trap-handler',
];

/**
 * Cachegrind counting instructions only (`--cache-sim=no`), and translating again any code that is rewritten, as V8's
 * compiled code is (`--smc-check=all`). `all-non-file` was 15% quicker, but counted reading_limits 0.13% apart from
 * `all`, where three runs of either agreed to 0.0001%: so every write to code is watched, at the cost of the time.
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
  // a case that counts nothing beyond its setup did no work, or the setup did more than the case: never a count
  const empty = benchmarks.flatMap((b) =>
    Object.entries(counts[b.name])
      .filter(([, n]) => !(n > 0))
      .map(([c, n]) => `${b.name} ${c}: ${n}`),
  );
  if (empty.length) throw new Error(`a case counted no work beyond its setup, so nothing is kept: ${empty.join('; ')}`);
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

/** The file in scripts/benchmarks/ that holds a benchmark, by its name: draw_fifty in draw-fifty.mjs. */
export const benchmarkFile = (name) => `${name.replaceAll('_', '-')}.mjs`;

/**
 * Bundles each benchmark into a folder of its own, a file to run and a chunk for the engine it loads, so a count reads
 * no TypeScript and a benchmark's process holds its own code alone. Gives each one's file, and its fingerprint: the hash
 * of every file of its bundle, the same wherever the folder is, and changed by any change to the code it runs.
 */
export async function bundleBenchmarks(dir, benchmarks) {
  const { default: esbuild } = await import('esbuild');
  const files = {},
    fingerprints = {};
  for (const { name } of benchmarks) {
    const out = join(dir, name);
    // the entry is made in memory, so no path of a temporary folder is written into the bundle
    const entry = {
      name: 'benchmark-entry',
      setup(build) {
        build.onResolve({ filter: /^benchmark-entry$/ }, () => ({ path: name, namespace: 'benchmark-entry' }));
        build.onLoad({ filter: /.*/, namespace: 'benchmark-entry' }, () => ({
          contents: `import { BENCHMARK } from './${benchmarkFile(name)}';\nimport { runCase } from './one-case.mjs';\nawait runCase(BENCHMARK, process.argv[2]);\n`,
          resolveDir: join(ROOT, 'scripts/benchmarks'),
          loader: 'js',
        }));
      },
    };
    await esbuild.build({
      entryPoints: { [name]: 'benchmark-entry' },
      plugins: [entry],
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      outdir: out,
      outExtension: { '.js': '.mjs' },
      logLevel: 'silent',
    });
    const hash = createHash('sha256');
    for (const f of readdirSync(out).sort())
      hash
        .update(`${f}\0`)
        .update(readFileSync(join(out, f)))
        .update('\0');
    files[name] = join(out, `${name}.mjs`);
    fingerprints[name] = hash.digest('hex');
  }
  return { files, fingerprints };
}

/**
 * Counts processes under Cachegrind: each case of each benchmark in a process of its own, its output file in a folder
 * of its own, so as many can run at once as the machine has cores; a count is the process's alone.
 */
async function cachegrind(benchmarks) {
  const dir = mkdtempSync(join(tmpdir(), 'instruction-counts-'));
  const { files, fingerprints } = await bundleBenchmarks(join(dir, 'bundle'), benchmarks);
  // a fixed, small environment, so nothing of the shell's reaches the count
  const env = { PATH: process.env.PATH ?? '', LC_ALL: 'C', TZ: 'UTC' };
  let n = 0;
  return {
    fingerprints,
    count(benchmark, which) {
      const out = join(dir, `cachegrind.out.${n++}`);
      const args = [...VALGRIND_FLAGS, `--cachegrind-out-file=${out}`, process.execPath, ...NODE_FLAGS];
      return new Promise((counted, failed) => {
        const child = spawn('valgrind', [...args, files[benchmark], which], {
          env,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
        let said = '';
        child.stderr.on('data', (d) => (said = (said + d).slice(-4000)));
        const timer = setTimeout(() => child.kill('SIGKILL'), CASE_MS);
        child.on('error', (e) => (clearTimeout(timer), failed(e)));
        child.on('close', (code, signal) => {
          clearTimeout(timer);
          const last = said.trim().split('\n').slice(-5).join('\n');
          if (code !== 0)
            failed(new Error(`${benchmark} ${which} failed under Cachegrind (${signal ?? code}):\n${last}`));
          else {
            try {
              counted(parseCachegrind(readFileSync(out, 'utf8')).totals.Ir);
            } catch (e) {
              failed(e);
            }
          }
        });
      });
    },
    done: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Runs `tasks` (functions giving a promise or a value), at most `width` at once, and gives their results in order. On a
 * failure no further task starts; the ones running are waited for, and the first failure is thrown.
 */
async function inParallel(tasks, width) {
  const results = new Array(tasks.length);
  let next = 0,
    failure = null;
  const lane = async () => {
    while (!failure && next < tasks.length) {
      const i = next++;
      try {
        results[i] = await tasks[i]();
      } catch (e) {
        failure ??= e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(width, tasks.length)) }, lane));
  if (failure) throw failure;
  return results;
}

/**
 * Counts every case of `benchmarks` (all of them by default) and its setup, `runs` times each, keeping the least, and
 * gives the metrics and details as quality-metrics.mjs reports them. Without Valgrind (`version` gives null), it counts
 * nothing and says so. `counter` is what counts a process: Cachegrind, unless a test hands in another. `parallel` is how
 * many processes are counted at once: as many as the machine has cores, by default. `reuse` is an earlier run's
 * instruction details: a benchmark whose fingerprint is the same there, on the same machine with the same flags, keeps
 * that count, uncounted, and is held to its claims as if counted. Counted several times over, nothing is kept.
 */
export async function measureInstructions(options = {}) {
  const { runs = 1, version = valgrindVersion, counter = cachegrind, parallel = availableParallelism() } = options;
  const benchmarks = options.benchmarks ?? (await import('./benchmarks/index.mjs')).BENCHMARKS;
  const tool = version();
  if (!tool) return notMeasured(benchmarks.map((b) => b.name));
  const counting = await counter(benchmarks);
  try {
    const machine = {
      os: platform(),
      arch: arch(),
      node_major: Number(process.versions.node.split('.')[0]),
      // held the same: os, arch, node_major and valgrind; the full Node version and the processor are said with them
      node: process.version,
      valgrind: tool,
      cpu: cpus()[0]?.model?.trim() ?? 'unknown',
    };
    const flags = { node: NODE_FLAGS, valgrind: VALGRIND_FLAGS };
    const fingerprint = (name) =>
      counting.fingerprints?.[name] &&
      createHash('sha256')
        .update(JSON.stringify([counting.fingerprints[name], machine, flags]))
        .digest('hex');
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const before = runs === 1 && same(options.reuse?.machine, machine) && same(options.reuse?.flags, flags);
    const kept = new Map(
      (before ? options.reuse.benchmarks : [])
        .filter((r) => r.fingerprint && r.fingerprint === fingerprint(r.name))
        .map((r) => [r.name, r]),
    );
    const jobs = benchmarks
      .filter((b) => !kept.has(b.name))
      .flatMap((b) =>
        ['setup', ...Object.keys(b.cases)].flatMap((which) =>
          Array.from({ length: runs }, () => ({ name: b.name, which })),
        ),
      );
    const got = await inParallel(
      jobs.map((j) => () => counting.count(j.name, j.which)),
      parallel,
    );
    const counts = {},
      ranges = {},
      reported = [];
    for (const b of benchmarks) {
      const about = { name: b.name, spec: b.spec, proves: b.proves, fingerprint: fingerprint(b.name) };
      if (kept.has(b.name)) {
        const { setup, cases } = kept.get(b.name);
        counts[b.name] = cases;
        reported.push({ ...about, setup, cases, kept: true });
        continue;
      }
      const least = {},
        range = {},
        seen = {};
      for (const which of ['setup', ...Object.keys(b.cases)]) {
        seen[which] = got.filter((_, i) => jobs[i].name === b.name && jobs[i].which === which);
        least[which] = Math.min(...seen[which]);
        range[which] = Math.max(...seen[which]) - least[which];
      }
      counts[b.name] = Object.fromEntries(Object.keys(b.cases).map((c) => [c, least[c] - least.setup]));
      ranges[b.name] = range;
      reported.push({ ...about, setup: least.setup, cases: counts[b.name] });
      // every process's own count, when there are several, so how they differ can be seen
      if (runs > 1) reported.at(-1).seen = seen;
    }
    const { metrics, claims } = instructionMetrics(benchmarks, counts);
    if (runs > 1) reported.forEach((r, i) => (r.spread = metricSpread(benchmarks[i], ranges[r.name], metrics)));
    const instructions = { measured: true, machine, flags, runs, benchmarks: reported, claims };
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
  const parallel = value('--parallel') === undefined ? undefined : Number(value('--parallel'));
  const reuse = value('--reuse') && JSON.parse(readFileSync(resolve(ROOT, value('--reuse')), 'utf8'));
  const result = await measureInstructions({
    benchmarks,
    runs: Number(value('--runs') ?? 1),
    parallel,
    reuse: reuse?.details?.instructions,
  });
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
