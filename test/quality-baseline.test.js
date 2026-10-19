// The quality baseline cannot be quietly loosened, and says where it was measured (spec §12, quality_ratchet):
// - A baseline committed worse than its parent's needs a recorded reason, as a measured run does.
// - One that lacks a metric, or was measured with tests left out, is refused.
// - A timing measured on another machine than the baseline's only warns.
// Proved on tampered pairs of baselines, and on small repositories made for the purpose.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { METRICS, compare, acceptedProblems, baselineProblems, compareWithRef } from '../scripts/quality-check.mjs';
import { block, read, readJSON, ROOT, jobs, permissionValues, runCommands, stripComment } from './repository/repo.js';

/** The environment of a spawned check outside CI: whatever runs this test, GITHUB_ACTIONS is not set for the child. */
const outsideCi = () => {
  const { GITHUB_ACTIONS: _ci, ...env } = process.env;
  return env;
};
const baseline = () => readJSON('quality/baseline.json');
const changed = (changes, machine) => {
  const copy = structuredClone(baseline());
  Object.assign(copy.metrics, changes);
  if (machine) copy.machine = machine;
  return copy;
};
const failed = (r) => r.failures.map((f) => f.metric);
const entry = (name, from, to, extra = {}) => ({
  metric: name,
  from,
  to,
  reason: 'wanted',
  date: '2026-10-10',
  ...extra,
});

describe('the committed baseline', () => {
  test('is whole: every metric, no test left out, and the machine it was measured on', () => {
    assert.deepEqual(baselineProblems(baseline()), []);
    const { machine } = baseline();
    assert.equal(typeof machine.os, 'string');
    assert.equal(typeof machine.node_major, 'number');
  });

  test('a baseline missing a metric is refused, naming it', () => {
    const b = baseline();
    delete b.metrics.coverage_percent;
    const found = baselineProblems(b);
    assert.equal(found.length, 1);
    assert.match(found[0], /coverage_percent/);
  });

  test('a baseline measured with test files left out, or without its machine, is refused', () => {
    assert.match(
      baselineProblems({ ...baseline(), details: { ...baseline().details, left_out: ['test/x.test.js'] } })[0],
      /left out.*test\/x\.test\.js/,
    );
    const { machine: _machine, ...bare } = baseline();
    assert.match(baselineProblems(bare)[0], /machine/);
  });

  test('a metric missing from the baseline fails the comparison, whatever was measured', () => {
    const b = baseline();
    delete b.metrics.bundle_bytes;
    const r = compare(b, baseline(), []);
    assert.deepEqual(failed(r), ['bundle_bytes']);
    assert.match(r.failures[0].message, /not in the baseline/);
    assert.deepEqual(failed(compare(b, baseline(), [], { partial: true })), ['bundle_bytes']);
  });

  test('every metric but the machine’s speed must be in it, as the spec declares them', () => {
    // the instruction counts all, or none until the first run that counts them is committed (quality-instructions.test.js)
    const declared = Object.keys(METRICS).filter((n) => !METRICS[n].informational && !METRICS[n].instructions);
    for (const name of declared) assert.equal(typeof baseline().metrics[name], 'number', name);
  });
});

describe('a baseline committed worse than its parent’s', () => {
  const repository = (parent, current, accepted = []) => {
    const dir = mkdtempSync(join(tmpdir(), 'quality-baseline-'));
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'commit.gpgsign', 'false');
    mkdirSync(join(dir, 'quality'));
    const put = (name, value) => writeFileSync(join(dir, 'quality', name), JSON.stringify(value));
    put('accepted.json', { accepted: [] });
    if (parent) put('baseline.json', parent);
    git('add', '-A');
    git('commit', '-q', '-m', 'parent');
    const before = git('rev-parse', 'HEAD');
    put('baseline.json', current);
    put('accepted.json', { accepted });
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', 'current');
    return { dir, before };
  };
  const grown = () => baseline().metrics.bundle_bytes * 1.5;
  const check = (parent, current, accepted) => {
    const r = repository(parent, current, accepted);
    return compareWithRef(r.before, r.dir);
  };

  test('fails, naming the metric, when no reason is recorded', () => {
    const r = check(baseline(), changed({ bundle_bytes: grown() }));
    assert.deepEqual(failed(r.result), ['bundle_bytes']);
    assert.match(r.result.failures[0].message, /bundle_bytes/);
  });

  test('passes with a recorded reason for that exact change, and not for another', () => {
    const from = baseline().metrics.bundle_bytes;
    const ok = check(baseline(), changed({ bundle_bytes: grown() }), [entry('bundle_bytes', from, grown())]);
    assert.deepEqual(ok.result.failures, []);
    assert.equal(ok.result.accepted.length, 1);
    const other = check(baseline(), changed({ bundle_bytes: grown() }), [entry('bundle_bytes', from, from * 1.1)]);
    assert.deepEqual(failed(other.result), ['bundle_bytes']);
    const wrongFrom = check(baseline(), changed({ bundle_bytes: grown() }), [entry('bundle_bytes', 5, grown())]);
    assert.deepEqual(failed(wrongFrom.result), ['bundle_bytes']);
  });

  test('passes when the baseline is unchanged or better; a coverage that fell fails', () => {
    assert.deepEqual(check(baseline(), baseline()).result.failures, []);
    const better = changed({ max_source_lines: baseline().metrics.max_source_lines - 10 });
    assert.deepEqual(check(baseline(), better).result.failures, []);
    const lower = changed({ coverage_percent: baseline().metrics.coverage_percent - 20 });
    assert.deepEqual(failed(check(baseline(), lower).result), ['coverage_percent']);
  });

  test('passes for a metric the parent’s baseline did not hold yet: the baseline that adds it is its first record', () => {
    const parent = baseline();
    delete parent.metrics.journey_steps_obsidian;
    assert.deepEqual(check(parent, baseline()).result.failures, []);
    // and one the parent held that the baseline then drops still fails
    assert.deepEqual(failed(compare(baseline(), parent, [], { baselines: true })), ['journey_steps_obsidian']);
  });

  test('a secrets count cannot be waived by a reason', () => {
    const from = baseline().metrics.secrets_found;
    const r = check(baseline(), changed({ secrets_found: 1 }), [entry('secrets_found', from, 1)]);
    assert.deepEqual(failed(r.result), ['secrets_found']);
    assert.match(acceptedProblems([entry('secrets_found', from, 1)])[0], /secrets_found.*cannot be waived/);
  });

  test('says so, and passes, when there is no earlier baseline to compare with', () => {
    assert.match(check(undefined, baseline()).skipped, /no baseline/);
    assert.match(compareWithRef('0000000000000000000000000000000000000000', ROOT).skipped, /no earlier commit/);
  });

  test('a reference that cannot be read is an error, never a pass', () => {
    assert.throws(() => compareWithRef('no-such-reference', ROOT), /no-such-reference/);
  });

  test('the command runs it against a reference, and passes on the repository as committed', () => {
    const r = spawnSync(process.execPath, ['scripts/quality-check.mjs', '--baseline-since', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: outsideCi(),
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /baseline is no worse than HEAD\b/);
  });

  test('CI runs it against the base of the change, and the release against the commit before', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.match(ci, /BASE: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/);
    assert.ok(runCommands(ci).includes('node scripts/quality-check.mjs --baseline-since "$BASE"'));
    const quality = jobs(read('.github/workflows/release.yml')).quality.join('\n');
    assert.ok(runCommands(quality).includes('node scripts/quality-check.mjs --baseline-since HEAD~1'));
    assert.match(quality, /fetch-depth: 0/);
  });

  test('every workflow job that runs the suite checks out the full history, as the tests-first records need it', () => {
    const runsSuite = (text) => runCommands(text).some((r) => /quality-metrics\.mjs|npm test\b/.test(r));
    const suiteJobs = [];
    for (const file of readdirSync(join(ROOT, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f))) {
      const all = jobs(read(`.github/workflows/${file}`));
      for (const name of Object.keys(all).filter((n) => runsSuite(all[n].join('\n')))) {
        suiteJobs.push(`${file} ${name}`);
        assert.match(
          all[name].join('\n'),
          /fetch-depth: 0/,
          `the ${name} job of ${file} checks out with fetch-depth: 0`,
        );
      }
    }
    assert.deepEqual(suiteJobs.sort(), [
      'ci.yml suite',
      'nightly.yml build',
      'quality-baseline.yml measure',
      'release-check.yml quality',
      'release.yml quality',
      'release.yml release',
    ]);
  });
});

// No timing is enforced on any machine: test duration only warns. The work is held by the benchmarks' instruction
// counts, which are held only against counts from the same machine (quality-instructions.test.js).
describe('timings on another machine than the baseline’s', () => {
  const base = () => baseline().metrics;

  test('the command warns on stderr and exits 0, naming the timing', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'quality-')), 'metrics.json');
    const machine = { ...baseline().machine, node_major: baseline().machine.node_major + 1 };
    const slow = changed({ suite_seconds: base().suite_seconds * 3 }, machine);
    writeFileSync(file, JSON.stringify({ ...slow, details: {} }));
    const r = spawnSync(process.execPath, ['scripts/quality-check.mjs', file], {
      cwd: ROOT,
      encoding: 'utf8',
      env: outsideCi(),
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /warning: suite_seconds/);
  });
});

describe('a baseline measured on the CI runner', () => {
  const f = '.github/workflows/quality-baseline.yml';

  test('is made by a workflow run by hand, which only reads and uploads the metrics as an artifact', () => {
    const text = read(f);
    assert.match(text, /^on:\n {2}workflow_dispatch:/m);
    assert.doesNotMatch(text, /:\s*write/);
    assert.deepEqual(Object.keys(jobs(text)), ['measure']);
    const runs = runCommands(text);
    assert.ok(runs.includes('node scripts/quality-metrics.mjs --out quality/metrics.json'));
    assert.ok(runs.includes('npm ci') && runs.includes('npm audit signatures'));
    assert.match(text, /actions\/upload-artifact@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
    assert.match(text, /path: \|\n\s+quality\/metrics\.json\n/);
    assert.match(text, /node-version: 24/);
  });
});

describe('the release check, run by hand before a release is tagged', () => {
  const f = '.github/workflows/release-check.yml';
  const steps = (lines) => lines.map(stripComment).filter((l) => l.trim());

  test('runs every check the release waits on, step for step as release.yml has them, so a failure costs no version', () => {
    const release = jobs(read('.github/workflows/release.yml')),
      dry = jobs(read(f));
    const waited = block(release.release, 'needs', 4).join('\n');
    const checks = Object.keys(release).filter((name) => name !== 'release');
    for (const name of checks) assert.match(waited, new RegExp(`\\b${name}\\b`), `the release waits on ${name}`);
    assert.deepEqual(Object.keys(dry), checks);
    for (const name of checks) assert.deepEqual(steps(dry[name]), steps(release[name]), name);
  });

  test('has every workflow-wide setting release.yml has, such as its env, defaults, concurrency and permissions, and no other', () => {
    // every top-level block but the name, the trigger and the jobs (held above), each as its lines without comments
    const settings = (file) => {
      const lines = read(file).split('\n');
      const keys = lines
        .map(stripComment)
        .map((l) => /^([\w-]+):/.exec(l)?.[1])
        .filter((k) => k && !['name', 'on', 'jobs'].includes(k));
      return Object.fromEntries(keys.map((k) => [k, steps(block(lines, k, 0))]));
    };
    const release = settings('.github/workflows/release.yml');
    assert.ok('permissions' in release, 'the control: the release’s own settings are found');
    assert.deepEqual(settings(f), release);
  });

  test('is named so, run only by hand, releases nothing and only reads', () => {
    const text = read(f);
    assert.match(text, /^name: Release check \(dry run\)$/m);
    assert.deepEqual(block(text.split('\n'), 'on', 0).map(stripComment), ['on:', '  workflow_dispatch:']);
    assert.doesNotMatch(text, /:\s*write\b|gh release|git push|git tag/);
    assert.deepEqual(permissionValues(block(text.split('\n'), 'permissions', 0)), ['read']);
  });
});
