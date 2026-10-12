// The benchmarks' instruction counts in the quality ratchet (spec §12, quality_ratchet): one metric for each benchmark,
// with a small tolerance, held only against counts from the same machine; not measured, and said so, where Valgrind
// cannot run, which fails only on Linux, where the release counts them; recorded and printed, not held, until the
// baseline holds them; and a benchmark's claim that does not hold failing always. Test duration only warns. Proved on
// the committed baseline and copies of it with counts added.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { METRICS, acceptedProblems, baselineProblems, compare, toRecordText } from '../scripts/quality-check.mjs';
import { BENCHMARK_NAMES, INSTRUCTION_TOLERANCE } from '../scripts/quality-spec.mjs';
import { read, readJSON, ROOT, jobs, runCommands, stripComment, workflowFiles } from './repository/repo.js';

const COUNTS = BENCHMARK_NAMES.map((n) => `instructions_${n}`);
const CLAIMS = 'instruction_claims_broken';
const RUNNER = {
  os: 'linux',
  arch: 'x64',
  node_major: 24,
  node: 'v24.9.0',
  valgrind: 'valgrind-3.22.0',
  cpu: 'AMD EPYC 7763 64-Core Processor',
};
const failed = (r) => r.failures.map((f) => f.metric);
const warned = (r) => r.warnings.map((w) => w.metric);
/** The check's command on a metrics file, in CI (GitHub Actions) or not, whatever the environment running the test. */
function check(metrics, ci = false) {
  const file = join(mkdtempSync(join(tmpdir(), 'quality-')), 'metrics.json');
  writeFileSync(file, JSON.stringify(metrics));
  const { GITHUB_ACTIONS: _ci, ...env } = process.env;
  return spawnSync(process.execPath, ['scripts/quality-check.mjs', file], {
    cwd: ROOT,
    encoding: 'utf8',
    env: ci ? { ...env, GITHUB_ACTIONS: 'true' } : env,
  });
}

/** The committed baseline, as a run on `machine` measured it: every count as given, the rest as committed. */
function run(counts = {}, { os = 'linux', counter = RUNNER, why } = {}) {
  const b = structuredClone(readJSON('quality/baseline.json'));
  Object.assign(b.metrics, counts);
  b.machine = { ...b.machine, os };
  b.details = { ...b.details, instructions: why ? { measured: false, why } : { measured: true, machine: counter } };
  return b;
}
const counted = (scale = 1, extra = {}) => ({
  ...Object.fromEntries(COUNTS.map((n, i) => [n, Math.round((i + 1) * 1e8 * scale)])),
  [CLAIMS]: 0,
  ...extra,
});
const NOT_HERE = 'not measured: valgrind is not installed here';

describe('the metrics', () => {
  test('the work a fixed set of benchmarks takes, counted in instructions, one metric each, with a small tolerance', () => {
    for (const name of COUNTS) {
      assert.equal(METRICS[name].instructions, true, name);
      assert.equal(METRICS[name].better, 'lower');
      assert.equal(METRICS[name].tolerance, INSTRUCTION_TOLERANCE);
      assert.ok(!METRICS[name].scaled, 'a count is never stretched by how fast a machine is');
    }
    assert.ok(INSTRUCTION_TOLERANCE > 0 && INSTRUCTION_TOLERANCE <= 0.05);
    assert.equal(METRICS.draw_ms, undefined, 'no drawing time: its claim is the draw_fifty count');
  });

  test('test duration is reported as a warning only, however much worse, on any machine', () => {
    const slow = run(counted(), {});
    slow.metrics.suite_seconds *= 10;
    const r = compare(run(counted()), slow, []);
    assert.deepEqual(r.failures, []);
    assert.deepEqual(warned(r), ['suite_seconds']);
    assert.match(r.warnings[0].message, /never enforced/);
  });
});

describe('not measured', () => {
  test('on a machine other than Linux, each count warns, saying why, and nothing fails', () => {
    const mac = run(Object.fromEntries([...COUNTS, CLAIMS].map((n) => [n, null])), { os: 'darwin', why: NOT_HERE });
    const r = compare(run(counted()), mac, []);
    assert.deepEqual(r.failures, []);
    assert.deepEqual(warned(r), [...COUNTS, CLAIMS]);
    assert.match(r.warnings[0].message, /not measured: valgrind is not installed here/);
  });

  test('the fast check never asks for them, with a baseline that holds them or not', () => {
    const fast = { ...run(), metrics: { max_source_lines: 1, max_test_lines: 1, secrets_found: 0 } };
    for (const base of [run(counted()), run()]) {
      const r = compare(base, fast, [], { partial: true });
      assert.deepEqual([r.failures, r.warnings, r.toRecord], [[], [], []]);
    }
  });

  test('on Linux, where the release counts them, a count not measured fails', () => {
    const linux = run(Object.fromEntries([...COUNTS, CLAIMS].map((n) => [n, null])), { why: NOT_HERE });
    assert.deepEqual(failed(compare(run(counted()), linux, [])), [...COUNTS, CLAIMS]);
  });
});

describe('no baseline yet', () => {
  test('the counts are recorded, not held, and every other metric is still held', () => {
    const current = run(counted());
    current.metrics.bundle_bytes *= 2;
    const r = compare(readJSON('quality/baseline.json'), current, []);
    assert.deepEqual(failed(r), ['bundle_bytes']);
    assert.deepEqual(
      r.toRecord.map((t) => t.metric),
      [...COUNTS, CLAIMS],
    );
    assert.equal(r.toRecord[0].value, current.metrics[COUNTS[0]]);
  });

  test('they are printed as they go into the baseline, with the machine that counted them, for a follow-up pull request', () => {
    const r = compare(readJSON('quality/baseline.json'), run(counted()), []);
    const text = toRecordText(r.toRecord, run(counted()).details);
    assert.match(text, /no baseline yet for them/);
    assert.match(text, /follow-up pull request/);
    assert.ok(text.includes(`"${COUNTS[0]}": 100000000`), text);
    assert.ok(text.includes('"valgrind": "valgrind-3.22.0"'), text);
    assert.equal(toRecordText([], {}), '');
  });

  test('a claim that does not hold fails, with no baseline to hold it to, and no reason can waive it', () => {
    const r = compare(readJSON('quality/baseline.json'), run(counted(1, { [CLAIMS]: 1 })), []);
    assert.deepEqual(failed(r), [CLAIMS]);
    const waiver = { metric: CLAIMS, from: 0, to: 1, reason: 'x', date: '2026-10-12' };
    assert.match(acceptedProblems([waiver])[0], /cannot be waived/);
  });

  test('the command prints them, and passes on them', () => {
    const r = check(run(counted()));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /no baseline yet for them/);
    assert.match(r.stdout, /cannot hold instructions_draw_fifty/);
    assert.match(r.stdout, /"instructions_keystroke": 500000000/);
  });

  test('the command fails on a claim that does not hold, naming it, with what was counted and what is allowed', () => {
    const broken = run(counted(1, { [CLAIMS]: 1 }));
    broken.details.instructions.claims = [
      { benchmark: 'naming', says: 'linear in them', measured: 900, allowed: 600, holds: false },
      { benchmark: 'keystroke', says: 'reading back costs less', measured: 1, allowed: 2, holds: true },
    ];
    const r = check(broken);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /naming: linear in them \(900 instructions, where under 600 are allowed\)/);
    assert.doesNotMatch(r.stderr, /reading back/);
  });
});

describe('held to a baseline that holds them', () => {
  const base = () => run(counted());

  test('a count worse by more than the tolerance fails, naming it; within it passes', () => {
    const name = COUNTS[1];
    const by = (share) => run({ ...counted(), [name]: base().metrics[name] * (1 + share) });
    assert.deepEqual(compare(base(), by(INSTRUCTION_TOLERANCE * 0.9), []).failures, []);
    const r = compare(base(), by(INSTRUCTION_TOLERANCE * 1.5), []);
    assert.deepEqual(failed(r), [name]);
    assert.match(r.failures[0].message, /instructions_reading_limits got worse/);
  });

  test('counted on another machine, a worse count only warns', () => {
    for (const counter of [
      { ...RUNNER, arch: 'arm64' },
      { ...RUNNER, node_major: 26 },
      { ...RUNNER, os: 'darwin' },
      { ...RUNNER, valgrind: 'valgrind-3.23.0' },
    ]) {
      const r = compare(base(), run(counted(2), { counter }), []);
      assert.deepEqual(r.failures, [], JSON.stringify(counter));
      assert.deepEqual(warned(r), COUNTS);
      assert.match(r.warnings[0].message, /a different machine/);
    }
  });

  test('a worse count names the machine that counted it: Node, Valgrind and the processor', () => {
    const r = compare(base(), run({ ...counted(), [COUNTS[0]]: 2e8 }), []);
    assert.match(r.failures[0].message, /counted on linux x64, Node v24\.9\.0, valgrind-3\.22\.0, AMD EPYC 7763/);
  });
});

describe('in CI, the counts must be held', () => {
  const base = () => run(counted());

  test('with no instruction baseline, the run fails once, after the figures, saying its job is to print them', () => {
    const r = compare(readJSON('quality/baseline.json'), run(counted()), [], { ci: true });
    assert.deepEqual(failed(r), ['instructions']);
    assert.match(r.failures[0].message, /no instruction baseline yet, in CI this fails: this run’s job is to print/);
    assert.equal(r.toRecord.length, COUNTS.length + 1, 'every count, to record');
  });

  test('with the baseline counted on another machine, it fails, naming both, and gives every count to record', () => {
    const other = run(counted(), { counter: { ...RUNNER, valgrind: 'valgrind-3.23.0' } });
    const r = compare(base(), other, [], { ci: true });
    assert.deepEqual(failed(r), ['instructions']);
    const both = /made on linux x64, Node v24\.9\.0, valgrind-3\.22\.0.*these on .*valgrind-3\.23\.0/;
    assert.match(r.failures[0].message, both);
    assert.equal(r.toRecord.length, COUNTS.length + 1);
    assert.deepEqual(compare(base(), other, []).failures, [], 'outside CI, an equal count on another machine passes');
  });

  test('on the same machine, counts held to the baseline pass; the fast check and the baselines’ check never ask', () => {
    assert.deepEqual(compare(base(), run(counted()), [], { ci: true }).failures, []);
    const fast = { ...run(), metrics: { max_source_lines: 1, max_test_lines: 1, secrets_found: 0 } };
    assert.deepEqual(compare(readJSON('quality/baseline.json'), fast, [], { ci: true, partial: true }).failures, []);
    const none = readJSON('quality/baseline.json');
    assert.deepEqual(compare(none, base(), [], { ci: true, baselines: true }).failures, []);
  });

  test('the command, in GitHub Actions, prints the figures to paste and the machine, then fails saying why', () => {
    const r = check(run(counted()), true);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /"instructions_draw_fifty": 100000000/);
    assert.match(r.stdout, /"valgrind": "valgrind-3\.22\.0"/);
    assert.match(r.stderr, /this run’s job is to print the figures above, for a follow-up pull request/);
  });

  test('a baseline holds every count of one run or none, with the machine that counted them', () => {
    assert.deepEqual(baselineProblems(readJSON('quality/baseline.json')), [], 'none yet: allowed');
    assert.deepEqual(baselineProblems(base()), []);
    const part = base();
    delete part.metrics[COUNTS[0]];
    assert.match(baselineProblems(part)[0], new RegExp(`no ${COUNTS[0]}`));
    const anonymous = base();
    delete anonymous.details.instructions;
    assert.match(baselineProblems(anonymous)[0], /which machine counted them/);
  });

  test('a baseline that drops its counts fails against the one before; one that adds them passes', () => {
    const none = readJSON('quality/baseline.json');
    assert.deepEqual(failed(compare(base(), none, [], { baselines: true })), [...COUNTS, CLAIMS]);
    const added = compare(none, base(), [], { baselines: true });
    assert.deepEqual([added.failures, added.toRecord], [[], []]);
    assert.deepEqual(compare(none, none, [], { baselines: true }).failures, []);
  });
});

describe('the workflows that count them', () => {
  const commands = (file, job) => runCommands(jobs(read(`.github/workflows/${file}`))[job].join('\n'));

  test('the release and its dry run install Valgrind before they measure', () => {
    for (const file of ['release.yml', 'release-check.yml']) {
      const runs = commands(file, 'quality');
      const installed = runs.findIndex((r) => /sudo apt-get install -y --no-install-recommends valgrind$/.test(r));
      assert.ok(installed >= 0, `${file} installs Valgrind`);
      assert.ok(installed < runs.findIndex((r) => /^node scripts\/quality-metrics\.mjs\b/.test(r)), file);
    }
  });

  test('the quality baseline workflow counts them too, three times over, for the spread its tolerance needs', () => {
    const runs = commands('quality-baseline.yml', 'measure');
    assert.ok(runs.some((r) => /sudo apt-get install -y --no-install-recommends valgrind$/.test(r)));
    assert.ok(runs.includes('node scripts/instruction-counts.mjs --runs 3 --out quality/instruction-spread.json'));
    assert.match(read('.github/workflows/quality-baseline.yml'), /quality\/instruction-spread\.json\n/);
    assert.match(read('.gitignore'), /^quality\/instruction-spread\.json$/m);
  });

  test('every counting job runs on one pinned runner, with a time limit, so its counts come from the same machine', () => {
    for (const [file, job] of [
      ['release.yml', 'quality'],
      ['release-check.yml', 'quality'],
      ['quality-baseline.yml', 'measure'],
    ]) {
      const lines = jobs(read(`.github/workflows/${file}`))[job].join('\n');
      assert.match(lines, /^ {4}runs-on: ubuntu-24\.04$/m, `${file} ${job}`);
      assert.match(lines, /^ {4}timeout-minutes: \d+$/m, `${file} ${job}`);
    }
  });

  test('no workflow clears or sets GITHUB_ACTIONS, so the check always knows it runs in CI; the release checks last', () => {
    // anywhere a workflow could set it: env at the top, the job or the step, or a command's own prefix or unset
    const touches = (text) =>
      text
        .split('\n')
        .map(stripComment)
        .some((l) => /\bGITHUB_ACTIONS\b/.test(l));
    for (const planted of [
      'env:\n  GITHUB_ACTIONS: ""',
      'jobs:\n  quality:\n    env:\n      GITHUB_ACTIONS: false',
      '      - env:\n          GITHUB_ACTIONS: ""\n        run: node scripts/quality-check.mjs quality/metrics.json',
      '        run: GITHUB_ACTIONS= node scripts/quality-check.mjs quality/metrics.json',
      '        run: unset GITHUB_ACTIONS && node scripts/quality-check.mjs quality/metrics.json',
      '        run: env -u GITHUB_ACTIONS node scripts/quality-check.mjs quality/metrics.json',
    ])
      assert.ok(touches(planted), planted);
    assert.equal(touches('      # GITHUB_ACTIONS is set by the runner'), false, 'a comment sets nothing');
    for (const f of workflowFiles()) assert.equal(touches(read(f)), false, `${f} touches GITHUB_ACTIONS`);
    for (const file of ['release.yml', 'release-check.yml'])
      assert.equal(commands(file, 'quality').at(-1), 'node scripts/quality-check.mjs quality/metrics.json', file);
  });

  test('every counting job pins Node exactly, one version for all, of the major the counts are held to', () => {
    const versions = [
      ['release.yml', 'quality'],
      ['release-check.yml', 'quality'],
      ['quality-baseline.yml', 'measure'],
    ].map(([file, job]) => /node-version: (\S+)/.exec(jobs(read(`.github/workflows/${file}`))[job].join('\n'))?.[1]);
    for (const v of versions) assert.match(v ?? '', /^24\.\d+\.\d+$/, 'an exact version, never 24 alone');
    assert.equal(new Set(versions).size, 1, versions.join(', '));
  });

  test('the counts and their spread are uploaded whatever the steps before gave', () => {
    const lines = jobs(read('.github/workflows/quality-baseline.yml')).measure.join('\n');
    assert.match(lines, /uses: actions\/upload-artifact@[0-9a-f]{40}.*\n\s+if: always\(\)\n/);
  });
});
