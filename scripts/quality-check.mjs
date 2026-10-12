#!/usr/bin/env node
// The quality ratchet's comparison (spec §12, quality_ratchet): the metrics measured by scripts/quality-metrics.mjs are
// held against the committed baseline, quality/baseline.json, and any that got worse fails unless quality/accepted.json
// records the reason for that exact change. The baseline is held the same way against its own earlier copy, so it cannot
// be loosened without a reason either. Every metric declares which way is better and how much noise it tolerates.
//
// Usage:
//   node scripts/quality-check.mjs quality/metrics.json    compare a full run (the release's quality job)
//   node scripts/quality-check.mjs --fast                  measure the quick metrics now (file sizes, secrets) and compare
//   node scripts/quality-check.mjs --baseline-since <ref>  compare the committed baseline with the one at this commit
//
// Exits 1 and names each metric that is worse, with the baseline value, the new one and what would let it through. A timing
// measured on another operating system or Node major than the baseline's only warns, until a baseline from that machine is
// committed (the "Quality baseline" workflow measures one on the CI runner).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { METRICS } from './quality-spec.mjs';

export { METRICS };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE = 'quality/baseline.json';
export const ACCEPTED = 'quality/accepted.json';

const has = (v) => typeof v === 'number' && Number.isFinite(v);
const measured = () => Object.keys(METRICS).filter((n) => !METRICS[n].informational);

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
    if (METRICS[a.metric].waivable === false) return [`${at}: ${a.metric} cannot be waived by a reason: fix it`];
    if (!has(a.from) || !has(a.to)) return [`${at} (${a.metric}): from and to must be numbers`];
    if (typeof a.reason !== 'string' || !a.reason.trim()) return [`${at} (${a.metric}): it gives no reason`];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.date))) return [`${at} (${a.metric}): its date is not YYYY-MM-DD`];
    return [];
  });
}

/** What is wrong with a baseline as a baseline: a metric missing, tests left out, or no word of the machine. */
export function baselineProblems(baseline) {
  const found = [];
  for (const name of measured())
    if (!has(baseline.metrics?.[name])) found.push(`${BASELINE} has no ${name}: re-measure it with the metrics script`);
  if (baseline.details?.left_out?.length)
    found.push(`${BASELINE} was measured with test files left out (${baseline.details.left_out.join(', ')})`);
  if (typeof baseline.machine?.os !== 'string' || !has(baseline.machine?.node_major))
    found.push(`${BASELINE} does not say which machine (os and node_major) it was measured on`);
  return found;
}

const where = (m) => (m ? `${m.os}, Node ${m.node_major}` : 'an unknown machine');

/**
 * Holds `current` against `baseline`. Gives `{ failures, warnings, accepted, improved }`, each metric by name: a failure
 * when it is worse with no recorded reason, was not measured, or has nothing in the baseline to be held to; a warning when
 * it is a timing worse than a baseline measured on another machine; accepted when a reason covers it; improved when it is
 * better. A reason covers a change from the baseline's value to the figure it names, or anything no worse than that; for a
 * timing that figure is scaled with the baseline, to the speed of the machine measuring. With `partial`, a metric the run
 * left out is skipped, but one it measured as nothing still fails.
 */
export function compare(baseline, current, accepted = [], { partial = false } = {}) {
  const out = { failures: [], warnings: [], accepted: [], improved: [] };
  const speed =
    has(baseline.metrics.speed_index) && has(current.metrics.speed_index)
      ? current.metrics.speed_index / baseline.metrics.speed_index
      : 1;
  const [a, b] = [baseline.machine, current.machine];
  const sameMachine = Boolean(a && b && a.os === b.os && a.node_major === b.node_major);
  const valid = accepted.filter((x) => acceptedProblems([x]).length === 0);
  for (const [name, spec] of Object.entries(METRICS)) {
    if (spec.informational) continue;
    const base = baseline.metrics[name],
      value = current.metrics[name];
    if (value === undefined && partial && has(base)) continue;
    if (!has(value)) {
      out.failures.push({ metric: name, baseline: base, value, message: `${name} was not measured` });
      continue;
    }
    if (!has(base)) {
      out.failures.push({
        metric: name,
        baseline: base,
        value,
        message: `${name} is not in the baseline: re-measure it`,
      });
      continue;
    }
    const scale = spec.scaled ? speed : 1,
      wanted = base * scale;
    if (!worse(spec, wanted, value)) {
      if (spec.better === 'lower' ? value < wanted : value > wanted)
        out.improved.push({ metric: name, baseline: base, value });
      continue;
    }
    const reason = valid.find((x) => x.metric === name && x.from === base && !worse(spec, x.to * scale, value));
    const way = spec.better === 'lower' ? 'higher' : 'lower';
    const said = `${name} got worse: ${value} ${spec.unit}, ${way} than the baseline's ${base}`;
    const detail = spec.scaled && scale !== 1 ? ` (${wanted.toFixed(1)} on this machine)` : '';
    if (reason) out.accepted.push({ metric: name, baseline: base, value, reason: reason.reason });
    else if (spec.scaled && !sameMachine)
      out.warnings.push({
        metric: name,
        baseline: base,
        value,
        message: `${said}${detail}; measured on ${where(b)}, the baseline on ${where(a)}: a different machine, so it only warns`,
      });
    else
      out.failures.push({
        metric: name,
        baseline: base,
        value,
        message:
          `${said}${detail}. Fix it, or record why in ${ACCEPTED}: ` +
          `{ "metric": "${name}", "from": ${base}, "to": ${value}, "reason": "…", "date": "YYYY-MM-DD" }`,
      });
  }
  return out;
}

const readJSON = (file) => JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'));

/**
 * Holds the baseline committed in `root` against the one at this commit, with the reasons committed beside it. Gives
 * `{ result }` as `compare` does, or `{ skipped }` and why when there is nothing earlier to compare with. A reference
 * that cannot be read is an error, never a pass.
 */
export function compareWithRef(ref, root = ROOT) {
  if (/^0+$/.test(ref)) return { skipped: 'no earlier commit to compare the baseline with' };
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  } catch {
    throw new Error(`cannot read ${ref}: is the history deep enough (fetch-depth)?`);
  }
  let text;
  try {
    text = git('show', `${ref}:${BASELINE}`);
  } catch {
    return { skipped: `no baseline at ${ref} to compare with` };
  }
  const read = (file) => JSON.parse(readFileSync(join(root, file), 'utf8'));
  return { result: compare(JSON.parse(text), read(BASELINE), read(ACCEPTED).accepted) };
}

/** Prints what a comparison found; true when it passed. */
function report(r, details, passed) {
  for (const a of r.accepted)
    console.log(`quality: ${a.metric} is worse (${a.baseline} to ${a.value}), by a recorded reason: ${a.reason}`);
  if (r.improved.length)
    console.log(
      `quality: better than the baseline: ${r.improved.map((i) => i.metric).join(', ')} (re-measure to lock it in)`,
    );
  for (const w of r.warnings) console.error(`warning: ${w.message}`);
  if (r.failures.length) {
    console.error(r.failures.map((f) => f.message).join('\n'));
    for (const s of r.failures.some((f) => f.metric === 'secrets_found') ? (details?.secrets ?? []) : [])
      console.error(`  ${s.file}:${s.line} (${s.rule})`);
    // the flaky tests by name, as the suite's two runs found them: the count alone leaves a release no way to fix them
    for (const name of r.failures.some((f) => f.metric === 'flaky_tests') ? (details?.flaky ?? []) : [])
      console.error(`  ${name}`);
    return false;
  }
  console.log(passed);
  return true;
}

async function main(argv) {
  const since = argv.includes('--baseline-since') ? argv[argv.indexOf('--baseline-since') + 1] : undefined;
  const fast = argv.includes('--fast');
  const file = argv.find((x) => !x.startsWith('--') && x !== since);
  if (!fast && !file && !since) {
    console.error('usage: node scripts/quality-check.mjs <metrics.json> | --fast | --baseline-since <ref>');
    return 2;
  }
  const baseline = readJSON(BASELINE),
    accepted = readJSON(ACCEPTED).accepted;
  const bad = [...acceptedProblems(accepted), ...baselineProblems(baseline)];
  if (bad.length) {
    console.error(bad.join('\n'));
    return 1;
  }
  if (since) {
    const r = compareWithRef(since);
    if (r.skipped) {
      console.log(`quality: ${r.skipped}`);
      return 0;
    }
    const passed = `quality: the baseline is no worse than ${since}'s, or every change has a reason`;
    return report(r.result, {}, passed) ? 0 : 1;
  }
  const quick = fast ? (await import('./quality-metrics.mjs')).measureFast() : undefined;
  const current = quick ?? readJSON(file);
  if (current.details?.left_out?.length) {
    console.error(`the suite was run with test files left out (${current.details.left_out.join(', ')}): not a measure`);
    return 1;
  }
  const r = compare(baseline, current, accepted, { partial: fast });
  const passed = `quality: ${fast ? 'the quick metrics are' : 'every metric is'} no worse than the baseline of ${baseline.measured}`;
  return report(r, current.details, passed) ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
