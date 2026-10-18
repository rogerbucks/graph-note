// The quality metrics, declared (spec §12, quality_ratchet): each one's name, which way is better, and how much noise it
// tolerates before a worse figure counts. Measured by quality-metrics.mjs, compared by quality-check.mjs.

/** The instruction-count benchmarks, by name (scripts/benchmarks/index.mjs; a test holds the two lists the same). */
export const BENCHMARK_NAMES = [
  'draw_fifty',
  'reading_limits',
  'layout_refusals',
  'naming',
  'keystroke',
  'draw_five_hundred',
  'mesh_query',
  'cold_start',
];

/**
 * How much an instruction count may grow with no reason recorded: 5%. Cachegrind counts the same code alike from run to
 * run; what varies is the little a JIT and a collector do differently. Counted three times under Cachegrind on ARM Linux
 * (npm run bench:local, 12 Oct 2026), a metric (each case less its setup) moved by at most 1.9% (draw_fifty, where the
 * engine's WebAssembly is), the others by 0.001% or less. That is not the release's x86-64 runner: once the "Quality
 * baseline" workflow has counted
 * three runs there, this may come down to a few times the spread it finds.
 */
export const INSTRUCTION_TOLERANCE = 0.05;

/**
 * The drawings' counts move from run to run on the release runner, where the others do not. Counted four times there
 * (18 Oct 2026, the "Quality baseline" job, each benchmark bundled on its own), each process of draw_five_hundred moved
 * by 1.3% and of cold_start by 20%; every other metric by 0.01% or less. So each of those may grow by a little more with
 * no reason recorded. draw_fifty's whole process lands about 500 million instructions apart from run to run, nearly a
 * draw's own count, so its metric moved fivefold: it is reported, never failed on, until what moves it is found. Each
 * drawing's speed budget (benchmarks/budgets.mjs) still caps it, whatever the baseline says.
 */
export const DRAWING_TOLERANCE = { draw_five_hundred: 0.1, cold_start: 0.3 };
/** The benchmarks whose metric is reported when worse and never failed on, until their counts hold still. */
export const UNSTEADY_BENCHMARKS = ['draw_fifty'];

const instructionMetric = {
  better: 'lower',
  tolerance: INSTRUCTION_TOLERANCE,
  slack: 0,
  unit: 'instructions',
  instructions: true,
};

/**
 * Every metric: `better` is the direction that is an improvement; `tolerance` the share of the baseline a noisy metric may
 * worsen by with no reason recorded; `slack` an absolute amount it may worsen by, for a figure too small for a share to
 * mean anything; `scaled` marks a timing, whose baseline is stretched by how much slower this machine measured itself
 * than the baseline's did; `warnOnly` one that is reported when worse, never failed on; `instructions` a count of the
 * benchmarks' instructions, measured only where Valgrind runs and held only against a baseline counted on the same
 * machine; `most` a figure no metric may pass, baseline or none; `fast` marks the metrics that are measured in a moment,
 * from the files alone; `waivable: false` marks one no recorded reason can excuse.
 */
export const METRICS = {
  max_source_lines: { better: 'lower', tolerance: 0, slack: 0, unit: 'lines', fast: true },
  max_test_lines: { better: 'lower', tolerance: 0, slack: 0, unit: 'lines', fast: true },
  audit_critical: { better: 'lower', tolerance: 0, slack: 0, unit: 'vulnerabilities' },
  audit_high: { better: 'lower', tolerance: 0, slack: 0, unit: 'vulnerabilities' },
  audit_moderate: { better: 'lower', tolerance: 0, slack: 0, unit: 'vulnerabilities' },
  audit_low: { better: 'lower', tolerance: 0, slack: 0, unit: 'vulnerabilities' },
  secrets_found: { better: 'lower', tolerance: 0, slack: 0, unit: 'secrets', fast: true, waivable: false },
  bundle_bytes: { better: 'lower', tolerance: 0.03, slack: 0, unit: 'bytes' },
  bundle_bytes_without_viz: { better: 'lower', tolerance: 0.03, slack: 0, unit: 'bytes' },
  ...Object.fromEntries(
    BENCHMARK_NAMES.map((name) => [
      `instructions_${name}`,
      {
        ...instructionMetric,
        tolerance: DRAWING_TOLERANCE[name] ?? INSTRUCTION_TOLERANCE,
        ...(UNSTEADY_BENCHMARKS.includes(name) && { warnOnly: true }),
      },
    ]),
  ),
  // a benchmark's claim, such as linear and not square, that does not hold: never, whatever the baseline says
  instruction_claims_broken: { ...instructionMetric, tolerance: 0, unit: 'claims', most: 0, waivable: false },
  // test duration is reported, never enforced (Roger, 12 Oct 2026): a test asserts the work done, never the time taken
  suite_seconds: { better: 'lower', tolerance: 0.3, slack: 0, unit: 's', scaled: true, warnOnly: true },
  flaky_tests: { better: 'lower', tolerance: 0, slack: 0, unit: 'tests' },
  quiet_run_bytes: { better: 'lower', tolerance: 0, slack: 20, unit: 'bytes' },
  coverage_percent: { better: 'higher', tolerance: 0, slack: 1, unit: '%' },
  // how long a fixed piece of work took on the machine that measured: what the timings are scaled by, never compared
  speed_index: { better: 'lower', tolerance: 0, slack: 0, unit: 'ms', informational: true },
};
