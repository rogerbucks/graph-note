#!/usr/bin/env node
// The quality ratchet's comparison (spec §12, quality_ratchet). The metrics measured by scripts/quality-metrics.mjs are
// held against the committed baseline, quality/baseline.json. Any that got worse fails, unless quality/accepted.json
// records the reason for that exact change. The baseline is held the same way against its own earlier copy, so it cannot
// be loosened without a reason either. Every metric declares which way is better and how much noise it tolerates.
//
// Usage:
//   node scripts/quality-check.mjs quality/metrics.json    compare a full run (the release's quality job).
//   node scripts/quality-check.mjs --fast                  measure the quick metrics now (file sizes, secrets) and
//                                                          compare.
//   node scripts/quality-check.mjs --baseline-since <ref>  compare the committed baseline with the one at this commit.
//
// Exits 1 and names each metric that is worse, with the baseline value, the new one and what would let it through. Test
// duration only warns: a test asserts the work done, never the time taken.
//
// The benchmarks' instruction counts are held only against counts from the same machine. That is the operating
// system, processor, Node major and Valgrind. Otherwise they warn.
// - Where Valgrind cannot run they are not measured, which warns everywhere but Linux.
// - While the baseline holds none, a run that counts them prints them and passes on them. They are then committed by a
//   follow-up pull request.
// - In CI (GITHUB_ACTIONS set), no baseline for them, or one counted on another machine, fails. It fails after the
//   figures are printed.
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

/** The machine that counted a run's instructions, as its details record it. */
const counter = (run) => run.details?.instructions?.machine;
/** Counts are held to counts from the same machine: its operating system, processor, Node major and Valgrind. */
const sameCounter = (a, b) =>
  Boolean(a && b) && ['os', 'arch', 'node_major', 'valgrind'].every((key) => a[key] === b[key]);

/**
 * What is wrong with a baseline as a baseline: a metric missing, tests left out, or no word of the machine. The
 * instruction counts may all be absent, until the first run that counts them is committed. Once there, all must be,
 * with the machine that counted them.
 */
export function baselineProblems(baseline) {
  const found = [];
  const counts = measured().filter((n) => METRICS[n].instructions);
  for (const name of measured().filter((n) => !METRICS[n].instructions))
    if (!has(baseline.metrics?.[name])) found.push(`${BASELINE} has no ${name}: re-measure it with the metrics script`);
  const held = counts.filter((n) => has(baseline.metrics?.[n]));
  if (held.length) {
    for (const name of counts.filter((n) => !held.includes(n)))
      found.push(`${BASELINE} has instruction counts but no ${name}: commit every count of one run together`);
    if (!counter(baseline))
      found.push(
        `${BASELINE} has instruction counts but does not say which machine counted them (details.instructions.machine)`,
      );
  }
  if (baseline.details?.left_out?.length)
    found.push(`${BASELINE} was measured with test files left out (${baseline.details.left_out.join(', ')})`);
  if (typeof baseline.machine?.os !== 'string' || !has(baseline.machine?.node_major))
    found.push(`${BASELINE} does not say which machine (os and node_major) it was measured on`);
  return found;
}

/** A counting machine in words: what is held the same, and the processor it ran on. */
const where = (m) =>
  m
    ? [`${m.os}${m.arch ? ` ${m.arch}` : ''}`, `Node ${m.node ?? m.node_major}`, m.valgrind, m.cpu]
        .filter(Boolean)
        .join(', ')
    : 'an unknown machine';
const NOT_COUNTED = 'not measured: Cachegrind counts instructions on Linux only';
/** Why a run in CI fails on instruction counts the baseline cannot hold it to, after printing them. */
export const CI_RECORDS =
  'in CI this fails: this run’s job is to print the figures above, for a follow-up pull request to commit to ' +
  'quality/baseline.json; once they are committed, the counts are held to them';

/**
 * Holds `current` against `baseline`. Gives `{ failures, warnings, accepted, improved, toRecord }`, each metric by
 * name.
 * - A failure when it is worse with no recorded reason, or was not measured. Or when it has nothing in the baseline to
 *   be held to, or is past the most it may ever be.
 * - A warning when it is test duration and worse. Or an instruction count worse than one counted on another machine.
 *   Or an instruction count not measured on a machine other than Linux.
 * - Accepted when a reason covers it.
 * - Improved when it is better.
 * - To record when it is an instruction count the baseline does not hold yet.
 *
 * A reason covers a change from the baseline's value to the figure it names, or anything no worse than that. For a
 * timing that figure is scaled with the baseline, to the speed of the machine measuring. With `partial`, a metric the
 * run left out is skipped, but one it measured as nothing still fails. With `baselines`, two baselines are compared.
 * Instruction counts neither holds are passed over, and one the earlier held and the later dropped fails. A metric new
 * in the later one, which the earlier did not hold, is its first record and passes.
 *
 * With `ci` (a run in GitHub Actions), counts the baseline cannot hold the run to fail rather than pass. They are none
 * in it yet, or counted on another machine. Every count is still given in `toRecord`, to be printed first.
 */
export function compare(baseline, current, accepted = [], { partial = false, baselines = false, ci = false } = {}) {
  const out = { failures: [], warnings: [], accepted: [], improved: [], toRecord: [] };
  const speed =
    has(baseline.metrics.speed_index) && has(current.metrics.speed_index)
      ? current.metrics.speed_index / baseline.metrics.speed_index
      : 1;
  const [a, b] = [counter(baseline), counter(current)];
  const valid = accepted.filter((x) => acceptedProblems([x]).length === 0);
  for (const [name, spec] of Object.entries(METRICS)) {
    if (spec.informational) continue;
    const base = baseline.metrics[name],
      value = current.metrics[name];
    if (value === undefined && partial && (has(base) || spec.instructions)) continue;
    if (spec.instructions && !has(value)) {
      if (baselines && !has(base)) continue;
      if (!baselines && current.machine?.os !== 'linux') {
        const why = current.details?.instructions?.why ?? NOT_COUNTED;
        out.warnings.push({ metric: name, baseline: base, value, message: `${name} was ${why}` });
        continue;
      }
    }
    if (!has(value)) {
      out.failures.push({ metric: name, baseline: base, value, message: `${name} was not measured` });
      continue;
    }
    if (spec.most !== undefined && value > spec.most) {
      const message = `${name} is ${value} ${spec.unit}, where it may never be more than ${spec.most}`;
      out.failures.push({ metric: name, baseline: base, value, message });
      continue;
    }
    if (!has(base) && spec.instructions) {
      // a baseline that counts them for the first time is that record; nothing earlier holds it
      if (!baselines) out.toRecord.push({ metric: name, value });
      continue;
    }
    // a metric the earlier baseline did not hold is new: the baseline that adds it is its first record
    if (!has(base) && baselines) continue;
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
    const detail =
      spec.scaled && scale !== 1
        ? ` (${wanted.toFixed(1)} on this machine)`
        : spec.instructions
          ? ` (counted on ${where(b)})`
          : '';
    if (reason) out.accepted.push({ metric: name, baseline: base, value, reason: reason.reason });
    else if (spec.warnOnly)
      out.warnings.push({ metric: name, baseline: base, value, message: `${said}${detail}: reported, never enforced` });
    else if (spec.instructions && !sameCounter(a, b))
      out.warnings.push({
        metric: name,
        baseline: base,
        value,
        message: `${said}; counted on ${where(b)}, the baseline on ${where(a)}: a different machine, so it only warns`,
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
  if (ci && !baselines) holdInCi(out, current, a, b);
  return out;
}

/**
 * In CI, the instruction counts must be held. With none in the baseline yet, or the baseline's counted on another
 * machine, the run fails. It fails once, saying why, with every count it made to record.
 */
function holdInCi(out, current, a, b) {
  const counts = Object.keys(METRICS).filter((n) => METRICS[n].instructions && has(current.metrics[n]));
  if (!counts.length) return;
  let why = null;
  if (out.toRecord.length) why = `there is no instruction baseline yet, ${CI_RECORDS}`;
  else if (!sameCounter(a, b))
    why = `the baseline's counts were made on ${where(a)}, these on ${where(b)}: ${CI_RECORDS}`;
  if (!why) return;
  out.toRecord = counts.map((metric) => ({ metric, value: current.metrics[metric] }));
  out.warnings = out.warnings.filter((w) => !METRICS[w.metric]?.instructions);
  out.failures.push({ metric: 'instructions', message: `instruction counts not held: ${why}` });
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
  return { result: compare(JSON.parse(text), read(BASELINE), read(ACCEPTED).accepted, { baselines: true }) };
}

/**
 * What a run counted that the baseline does not hold yet, said so it can be committed. It gives the figures as they go
 * into the baseline's metrics. It also gives the machine that counted them, as it goes into its details. Empty when
 * there is none.
 */
export function toRecordText(toRecord, details) {
  if (!toRecord.length) return '';
  const figures = JSON.stringify(Object.fromEntries(toRecord.map((t) => [t.metric, t.value])), null, 2);
  const machine = JSON.stringify({ instructions: { machine: details?.instructions?.machine ?? null } }, null, 2);
  return (
    `quality: the baseline cannot hold ${toRecord.map((t) => t.metric).join(', ')} yet (no baseline yet for them, ` +
    `or one counted on another machine): these are recorded, not held. ` +
    `Commit them to ${BASELINE} in a follow-up pull request, the figures under "metrics":\n${figures}\n` +
    `and the machine that counted them under "details":\n${machine}`
  );
}

/** Prints what a comparison found; true when it passed. */
function report(r, details, passed) {
  if (r.toRecord.length) console.log(toRecordText(r.toRecord, details));
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
    // each benchmark claim that does not hold, with what was counted and what it allows
    const broken = r.failures.some((f) => f.metric === 'instruction_claims_broken');
    for (const c of (broken ? (details?.instructions?.claims ?? []) : []).filter((x) => !x.holds))
      console.error(`  ${c.benchmark}: ${c.says} (${c.measured} instructions, where under ${c.allowed} are allowed)`);
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
  // in GitHub Actions, counts the baseline cannot hold fail the run, after they are printed
  const r = compare(baseline, current, accepted, { partial: fast, ci: Boolean(process.env.GITHUB_ACTIONS) });
  const passed = `quality: ${fast ? 'the quick metrics are' : 'every metric is'} no worse than the baseline of ${baseline.measured}`;
  return report(r, current.details, passed) ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
