#!/usr/bin/env node
// The quality ratchet's comparison (spec §12, quality_ratchet): the metrics measured by scripts/quality-metrics.mjs are
// held against the committed baseline, quality/baseline.json, and any that got worse fails unless quality/accepted.json
// records the reason for that exact change. Every metric declares which way is better and how much noise it tolerates.
//
// Usage:
//   node scripts/quality-check.mjs quality/metrics.json    compare a full run (the release's quality job)
//   node scripts/quality-check.mjs --fast                  measure the quick metrics now (file sizes, secrets) and compare
//
// Exits 1 and names each metric that is worse, with the baseline value, the new one and what would let it through.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { METRICS } from './quality-spec.mjs';

export { METRICS };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE = 'quality/baseline.json';
export const ACCEPTED = 'quality/accepted.json';

const has = (v) => typeof v === 'number' && Number.isFinite(v);

/** True when `value` is worse than `base` by more than the metric's tolerance and slack allow. */
function worse(spec, base, value) {
  const room = Math.abs(base) * spec.tolerance + spec.slack;
  return spec.better === 'lower' ? value > base + room : value < base - room;
}

/** What is wrong with the recorded reasons, if anything: each must name a known metric, a reason and a day. */
export function acceptedProblems(accepted) {
  return accepted.flatMap((a, i) => {
    const at = `accepted.json entry ${i + 1}`;
    if (!METRICS[a?.metric] || METRICS[a.metric].informational) return [`${at}: ${a?.metric} is not a metric`];
    if (!has(a.from) || !has(a.to)) return [`${at} (${a.metric}): from and to must be numbers`];
    if (typeof a.reason !== 'string' || !a.reason.trim()) return [`${at} (${a.metric}): it gives no reason`];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.date))) return [`${at} (${a.metric}): its date is not YYYY-MM-DD`];
    return [];
  });
}

/**
 * Holds `current` against `baseline`. Gives `{ failures, accepted, improved }`, each metric by name: a failure when
 * it is worse with no recorded reason (or was not measured), accepted when a reason covers it, improved when it is
 * better. A reason covers a change from the baseline's value to the figure it names, or anything no worse than that.
 * With `partial`, a metric the run left out is skipped, but one it measured as nothing still fails.
 */
export function compare(baseline, current, accepted = [], { partial = false } = {}) {
  const out = { failures: [], accepted: [], improved: [] };
  const speed =
    has(baseline.metrics.speed_index) && has(current.metrics.speed_index)
      ? current.metrics.speed_index / baseline.metrics.speed_index
      : 1;
  const valid = accepted.filter((a) => acceptedProblems([a]).length === 0);
  for (const [name, spec] of Object.entries(METRICS)) {
    if (spec.informational) continue;
    const base = baseline.metrics[name],
      value = current.metrics[name];
    if (value === undefined && partial) continue;
    if (!has(value)) {
      out.failures.push({ metric: name, baseline: base, value, message: `${name} was not measured` });
      continue;
    }
    if (!has(base)) continue; // a metric newer than the baseline has nothing to be worse than
    const wanted = spec.scaled ? base * speed : base;
    if (!worse(spec, wanted, value)) {
      if (spec.better === 'lower' ? value < wanted : value > wanted)
        out.improved.push({ metric: name, baseline: base, value });
      continue;
    }
    const reason = valid.find((a) => a.metric === name && a.from === base && !worse(spec, a.to, value));
    if (reason) out.accepted.push({ metric: name, baseline: base, value, reason: reason.reason });
    else {
      const way = spec.better === 'lower' ? 'higher' : 'lower';
      out.failures.push({
        metric: name,
        baseline: base,
        value,
        message:
          `${name} got worse: ${value} ${spec.unit}, ${way} than the baseline's ${base}` +
          (spec.scaled && speed !== 1 ? ` (${wanted.toFixed(1)} on this machine)` : '') +
          `. Fix it, or record why in ${ACCEPTED}: { "metric": "${name}", "from": ${base}, "to": ${value}, "reason": "…", "date": "YYYY-MM-DD" }`,
      });
    }
  }
  return out;
}

const readJSON = (file) => JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));

async function main(argv) {
  const fast = argv.includes('--fast');
  const file = argv.find((a) => !a.startsWith('--'));
  if (!fast && !file) {
    console.error('usage: node scripts/quality-check.mjs <metrics.json> | --fast');
    return 2;
  }
  const baseline = readJSON(BASELINE),
    accepted = readJSON(ACCEPTED).accepted;
  const bad = acceptedProblems(accepted);
  if (bad.length) {
    console.error(bad.join('\n'));
    return 1;
  }
  const current = fast ? { metrics: (await import('./quality-metrics.mjs')).measureFast().metrics } : readJSON(file);
  if (current.details?.left_out?.length) {
    console.error(`the suite was run with test files left out (${current.details.left_out.join(', ')}): not a measure`);
    return 1;
  }
  const r = compare(baseline, current, accepted, { partial: fast });
  for (const a of r.accepted)
    console.log(`quality: ${a.metric} is worse (${a.baseline} to ${a.value}), by a recorded reason: ${a.reason}`);
  if (r.improved.length)
    console.log(
      `quality: better than the baseline: ${r.improved.map((i) => i.metric).join(', ')} (re-measure to lock it in)`,
    );
  if (r.failures.length) {
    console.error(r.failures.map((f) => f.message).join('\n'));
    return 1;
  }
  console.log(
    `quality: ${fast ? 'the quick metrics are' : 'every metric is'} no worse than the baseline of ${baseline.measured}`,
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
