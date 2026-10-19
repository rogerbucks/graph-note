// The quality metrics, declared (spec §12, quality_ratchet). Each has its name, which way is better, and how much noise
// it tolerates before a worse figure counts. Measured by quality-metrics.mjs, compared by quality-check.mjs.

import { HOSTS as JOURNEY_HOSTS } from './ux-journey.mjs';

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
 * run. What varies is the little a JIT and a collector do differently, and the processor's model. The release runner's
 * model varies, and the baseline's machine does not hold it. Counted three times on the release runner (18 Oct 2026,
 * the "Quality baseline" job, WebAssembly compiled once: instruction-counts.mjs), no metric moved by 0.03%.
 */
export const INSTRUCTION_TOLERANCE = 0.05;

const instructionMetric = {
  better: 'lower',
  tolerance: INSTRUCTION_TOLERANCE,
  slack: 0,
  unit: 'instructions',
  instructions: true,
};

/**
 * Every metric:
 * - `better` is the direction that is an improvement.
 * - `tolerance` is the share of the baseline a noisy metric may worsen by with no reason recorded.
 * - `slack` is an absolute amount it may worsen by, for a figure too small for a share to mean anything.
 * - `scaled` marks a timing. Its baseline is stretched by how much slower this machine measured itself than the
 *   baseline's did.
 * - `warnOnly` marks one that is reported when worse, never failed on.
 * - `instructions` marks a count of the benchmarks' instructions. It is measured only where Valgrind runs. It is held
 *   only against a baseline counted on the same machine.
 * - `most` is a figure no metric may pass, baseline or none.
 * - `fast` marks the metrics that are measured in a moment, from the files alone.
 * - `journey` marks a count of the first-run journey (scripts/ux-journey.mjs). It is measured by running the journey in
 *   each host, which the suite does too: test/ux-journey.test.js holds it in CI.
 * - `waivable: false` marks one no recorded reason can excuse.
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
  ...Object.fromEntries(BENCHMARK_NAMES.map((name) => [`instructions_${name}`, instructionMetric])),
  // a benchmark's claim, such as linear and not square, that does not hold: never, whatever the baseline says
  instruction_claims_broken: { ...instructionMetric, tolerance: 0, unit: 'claims', most: 0, waivable: false },
  // test duration is reported, never enforced (Roger, 12 Oct 2026): a test asserts the work done, never the time taken
  suite_seconds: { better: 'lower', tolerance: 0.3, slack: 0, unit: 's', scaled: true, warnOnly: true },
  flaky_tests: { better: 'lower', tolerance: 0, slack: 0, unit: 'tests' },
  quiet_run_bytes: { better: 'lower', tolerance: 0, slack: 20, unit: 'bytes' },
  coverage_percent: { better: 'higher', tolerance: 0, slack: 1, unit: '%' },
  // the first-run journey's steps and interactions in each host (scripts/ux-journey.mjs): one more is a worse journey
  ...Object.fromEntries(
    Object.values(JOURNEY_HOSTS).flatMap((h) => [
      [h.steps, { better: 'lower', tolerance: 0, slack: 0, unit: 'steps', journey: true }],
      [h.interactions, { better: 'lower', tolerance: 0, slack: 0, unit: 'interactions', journey: true }],
    ]),
  ),
  // how long a fixed piece of work took on the machine that measured: what the timings are scaled by, never compared
  speed_index: { better: 'lower', tolerance: 0, slack: 0, unit: 'ms', informational: true },
};
