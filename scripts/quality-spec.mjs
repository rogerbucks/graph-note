// The quality metrics, declared (spec §12, quality_ratchet): each one's name, which way is better, and how much noise it
// tolerates before a worse figure counts. Measured by quality-metrics.mjs, compared by quality-check.mjs.

/**
 * Every metric: `better` is the direction that is an improvement; `tolerance` the share of the baseline a noisy metric may
 * worsen by with no reason recorded; `slack` an absolute amount it may worsen by, for a figure too small for a share to
 * mean anything; `scaled` marks a timing, whose baseline is stretched by how much slower this machine measured itself
 * than the baseline's did; `fast` marks the metrics that are measured in a moment, from the files alone; `waivable: false`
 * marks one no recorded reason can excuse.
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
  draw_ms: { better: 'lower', tolerance: 0.25, slack: 0, unit: 'ms', scaled: true },
  suite_seconds: { better: 'lower', tolerance: 0.3, slack: 0, unit: 's', scaled: true },
  flaky_tests: { better: 'lower', tolerance: 0, slack: 0, unit: 'tests' },
  quiet_run_bytes: { better: 'lower', tolerance: 0, slack: 20, unit: 'bytes' },
  coverage_percent: { better: 'higher', tolerance: 0, slack: 1, unit: '%' },
  // how long a fixed piece of work took on the machine that measured: what the timings are scaled by, never compared
  speed_index: { better: 'lower', tolerance: 0, slack: 0, unit: 'ms', informational: true },
};
