// The quality ratchet (spec §12, quality_ratchet and slice_end_review): the code's quality metrics are measured, held
// against a committed baseline, and a release fails on any that got worse without a recorded reason. The measuring of
// the slow metrics (the audit, the build, two runs of the suite) is not run here: this file proves the comparison, the
// secrets scan, the readers of the suite's reports and the workflows, on the committed baseline and tampered copies.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { METRICS, compare, acceptedProblems } from '../scripts/quality-check.mjs';
import { findSecrets, scanRepo, scannedFiles } from '../scripts/quality-secrets.mjs';
import { measureFast } from '../scripts/quality-metrics.mjs';
import { testsForChanges } from '../scripts/changed-tests.mjs';
import { parseJunit, flakyBetween, parseLcov } from '../scripts/quality-suite.mjs';
import { exists, read, readJSON, ROOT, block, jobs, runCommands } from './repository/repo.js';

const baseline = () => readJSON('quality/baseline.json');
/** The baseline with one metric changed (and any other given). */
const changed = (changes) => {
  const copy = structuredClone(baseline());
  Object.assign(copy.metrics, changes);
  return copy;
};
const failed = (result) => result.failures.map((f) => f.metric);
/** A number that is certainly worse than the baseline's for this metric. */
const worse = (name, by = 1.5) => {
  const v = baseline().metrics[name];
  return METRICS[name].better === 'lower' ? v * by + 100 : v / by - 100;
};
const entry = (name, to, extra = {}) => ({
  metric: name,
  from: baseline().metrics[name],
  to,
  reason: 'the feature needs it',
  date: '2026-10-10',
  ...extra,
});

describe('the metrics the requirement names', () => {
  const NAMED = {
    'file sizes': ['max_source_lines', 'max_test_lines'],
    'a dependency vulnerability scan': ['audit_critical', 'audit_high', 'audit_moderate', 'audit_low'],
    'a secrets scan': ['secrets_found'],
    'bundle size': ['bundle_bytes', 'bundle_bytes_without_viz'],
    'drawing time': ['draw_ms'],
    'test duration': ['suite_seconds'],
    'flaky tests': ['flaky_tests'],
    'the size of a passing quiet test run': ['quiet_run_bytes'],
    coverage: ['coverage_percent'],
  };

  test('each is declared, with the direction in which it is better and a tolerance', () => {
    for (const [what, names] of Object.entries(NAMED))
      for (const name of names) {
        const m = METRICS[name];
        assert.ok(m, `${what}: ${name} is declared`);
        assert.ok(['lower', 'higher'].includes(m.better), `${name} says which way is better`);
        assert.ok(m.tolerance >= 0 && m.tolerance < 1, `${name} has a tolerance`);
      }
    assert.equal(METRICS.coverage_percent.better, 'higher');
    assert.equal(METRICS.draw_ms.better, 'lower');
  });

  test('the noisy timings carry a tolerance; the exact counts carry none', () => {
    assert.ok(METRICS.draw_ms.tolerance >= 0.25);
    assert.ok(METRICS.suite_seconds.tolerance >= 0.25);
    for (const name of ['max_source_lines', 'max_test_lines', 'audit_high', 'secrets_found', 'flaky_tests'])
      assert.equal(METRICS[name].tolerance, 0, name);
  });

  test('the committed baseline holds every one, measured, with the day and what measured it', () => {
    const b = baseline();
    assert.match(b.measured, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(b.about, /scripts\/quality-metrics\.mjs/);
    for (const names of Object.values(NAMED))
      for (const name of names) assert.equal(typeof b.metrics[name], 'number', `${name} is in the baseline`);
    assert.equal(
      typeof b.metrics.speed_index,
      'number',
      'the machine’s speed, so timings can be compared across machines',
    );
    assert.ok(b.metrics.coverage_percent > 0 && b.metrics.coverage_percent <= 100);
    assert.equal(b.metrics.secrets_found, 0);
    assert.equal(b.metrics.flaky_tests, 0);
    assert.ok(b.metrics.bundle_bytes_without_viz < b.metrics.bundle_bytes);
  });

  test('the report says what is large in the bundle, besides the engine', () => {
    const { bundle } = baseline().details;
    assert.ok(Array.isArray(bundle) && bundle.length >= 3);
    assert.ok(bundle.some((b) => b.name === '@viz-js/viz'));
    for (const b of bundle) assert.ok(typeof b.name === 'string' && b.bytes > 0, JSON.stringify(b));
    assert.deepEqual(
      bundle.map((b) => b.bytes),
      bundle.map((b) => b.bytes).sort((a, b) => b - a),
      'largest first',
    );
  });

  test('the quick metrics are measured here, from the files', () => {
    const { metrics } = measureFast();
    assert.ok(metrics.max_source_lines > 100 && metrics.max_source_lines <= 400);
    assert.ok(metrics.max_test_lines > 100 && metrics.max_test_lines <= 600);
    assert.equal(metrics.secrets_found, 0);
  });
});

describe('the bundle is measured from the build’s own settings', () => {
  test('the build config can be imported for them without building anything', async () => {
    const { options } = await import('../packages/obsidian/esbuild.config.mjs');
    assert.deepEqual(options.entryPoints, ['src/main.ts']);
    assert.ok(options.external.includes('obsidian'));
    assert.equal(options.write, false, 'it is written by the build’s own plugin, not by esbuild');
  });
});

describe('against the committed baseline', () => {
  test('the baseline passes against itself', () => {
    const r = compare(baseline(), baseline(), []);
    assert.deepEqual(r.failures, []);
  });

  test('the repository, measured now, is no worse in the quick metrics than the baseline', () => {
    const { metrics } = measureFast();
    const r = compare(baseline(), { ...baseline(), metrics }, [], { partial: true });
    assert.deepEqual(
      r.failures.map((f) => f.message),
      [],
      'a file grew past the baseline: shrink it, or record why in quality/accepted.json',
    );
  });

  test('the recorded reasons are well formed', () => {
    const accepted = readJSON('quality/accepted.json');
    assert.ok(Array.isArray(accepted.accepted));
    assert.deepEqual(acceptedProblems(accepted.accepted), []);
  });
});

describe('a metric that got worse fails, naming it', () => {
  test('a bigger bundle', () => {
    const r = compare(baseline(), changed({ bundle_bytes: worse('bundle_bytes') }), []);
    assert.deepEqual(failed(r), ['bundle_bytes']);
    assert.match(r.failures[0].message, /bundle_bytes/);
    assert.match(r.failures[0].message, new RegExp(String(baseline().metrics.bundle_bytes)));
  });

  test('every metric, one at a time, fails on its own', () => {
    for (const name of Object.keys(METRICS).filter((n) => !METRICS[n].informational)) {
      const r = compare(baseline(), changed({ [name]: worse(name, 3) }), []);
      assert.deepEqual(failed(r), [name]);
    }
  });

  test('one more line in the largest file, one more high vulnerability, one secret', () => {
    const b = baseline().metrics;
    assert.deepEqual(failed(compare(baseline(), changed({ max_source_lines: b.max_source_lines + 1 }), [])), [
      'max_source_lines',
    ]);
    assert.deepEqual(failed(compare(baseline(), changed({ audit_high: b.audit_high + 1 }), [])), ['audit_high']);
    assert.deepEqual(failed(compare(baseline(), changed({ secrets_found: 1 }), [])), ['secrets_found']);
  });

  test('a metric that is better passes, and is said to be better', () => {
    const r = compare(baseline(), changed({ max_source_lines: baseline().metrics.max_source_lines - 5 }), []);
    assert.deepEqual(r.failures, []);
    assert.deepEqual(
      r.improved.map((i) => i.metric),
      ['max_source_lines'],
    );
  });

  test('a metric the run did not measure fails, unless only the quick ones were asked for', () => {
    const current = structuredClone(baseline());
    delete current.metrics.coverage_percent;
    current.metrics.draw_ms = null;
    assert.deepEqual(failed(compare(baseline(), current, [])), ['draw_ms', 'coverage_percent']);
    const r = compare(baseline(), current, [], { partial: true });
    assert.deepEqual(failed(r), ['draw_ms'], 'a metric measured as nothing is a failure even in a partial run');
  });
});

describe('higher is better, for coverage', () => {
  test('less coverage fails; more passes; a small dip within the slack passes', () => {
    const c = baseline().metrics.coverage_percent;
    assert.deepEqual(failed(compare(baseline(), changed({ coverage_percent: c - 10 }), [])), ['coverage_percent']);
    assert.deepEqual(compare(baseline(), changed({ coverage_percent: Math.min(100, c + 5) }), []).failures, []);
    assert.deepEqual(
      compare(baseline(), changed({ coverage_percent: c - METRICS.coverage_percent.slack / 2 }), []).failures,
      [],
    );
  });

  test('a reason covers a fall in coverage down to the figure it names, and no further', () => {
    const c = baseline().metrics.coverage_percent;
    const accepted = [entry('coverage_percent', c - 8)];
    assert.deepEqual(compare(baseline(), changed({ coverage_percent: c - 8 }), accepted).failures, []);
    assert.deepEqual(failed(compare(baseline(), changed({ coverage_percent: c - 12 }), accepted)), [
      'coverage_percent',
    ]);
  });
});

describe('timings carry a tolerance, and a machine’s speed', () => {
  const draw = () => baseline().metrics.draw_ms;

  test('a drawing a fifth slower passes; twice as slow fails', () => {
    assert.deepEqual(compare(baseline(), changed({ draw_ms: draw() * 1.2 }), []).failures, []);
    assert.deepEqual(failed(compare(baseline(), changed({ draw_ms: draw() * 2 }), [])), ['draw_ms']);
  });

  test('on a machine half as fast, the baseline is stretched to match: nothing fails for the machine alone', () => {
    const slow = changed({
      speed_index: baseline().metrics.speed_index * 2,
      draw_ms: draw() * 1.9,
      suite_seconds: baseline().metrics.suite_seconds * 1.9,
    });
    assert.deepEqual(compare(baseline(), slow, []).failures, []);
    const slower = changed({ speed_index: baseline().metrics.speed_index * 2, draw_ms: draw() * 3 });
    assert.deepEqual(failed(compare(baseline(), slower, [])), ['draw_ms']);
  });

  test('a count is never stretched by the machine', () => {
    const slow = changed({ speed_index: baseline().metrics.speed_index * 2, bundle_bytes: worse('bundle_bytes') });
    assert.deepEqual(failed(compare(baseline(), slow, [])), ['bundle_bytes']);
  });

  test('a tiny quiet run may gain a few bytes, not a page', () => {
    const q = baseline().metrics.quiet_run_bytes;
    assert.deepEqual(compare(baseline(), changed({ quiet_run_bytes: q + 3 }), []).failures, []);
    assert.deepEqual(failed(compare(baseline(), changed({ quiet_run_bytes: q + 3000 }), [])), ['quiet_run_bytes']);
  });
});

describe('a recorded reason lets exactly that change through', () => {
  const grown = () => baseline().metrics.bundle_bytes * 1.5;

  test('an entry for this metric, from this baseline value, to this value', () => {
    const r = compare(baseline(), changed({ bundle_bytes: grown() }), [entry('bundle_bytes', grown())]);
    assert.deepEqual(r.failures, []);
    assert.deepEqual(
      r.accepted.map((a) => [a.metric, a.reason]),
      [['bundle_bytes', 'the feature needs it']],
    );
  });

  test('an entry for a smaller value does not cover a bigger one', () => {
    const r = compare(baseline(), changed({ bundle_bytes: grown() }), [entry('bundle_bytes', grown() * 0.9)]);
    assert.deepEqual(failed(r), ['bundle_bytes']);
  });

  test('an entry written from another baseline value does not apply', () => {
    const r = compare(baseline(), changed({ bundle_bytes: grown() }), [entry('bundle_bytes', grown(), { from: 1 })]);
    assert.deepEqual(failed(r), ['bundle_bytes']);
  });

  test('an entry for another metric does not apply', () => {
    const r = compare(baseline(), changed({ bundle_bytes: grown() }), [entry('max_source_lines', grown())]);
    assert.deepEqual(failed(r), ['bundle_bytes']);
  });

  test('an entry with no reason, or no date, covers nothing, and is itself a problem', () => {
    for (const bad of [{ reason: '' }, { reason: '   ' }, { date: 'last week' }]) {
      const accepted = [entry('bundle_bytes', grown(), bad)];
      assert.deepEqual(failed(compare(baseline(), changed({ bundle_bytes: grown() }), accepted)), ['bundle_bytes']);
      assert.equal(acceptedProblems(accepted).length, 1, JSON.stringify(bad));
    }
    assert.deepEqual(acceptedProblems([{ metric: 'nope', from: 1, to: 2, reason: 'x', date: '2026-10-10' }]).length, 1);
  });

  test('a reason covers only the metric it names: another that got worse still fails', () => {
    const current = changed({ bundle_bytes: grown(), audit_high: 2 });
    assert.deepEqual(failed(compare(baseline(), current, [entry('bundle_bytes', grown())])), ['audit_high']);
  });
});

describe('the commands', () => {
  const run = (script, args) => spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8' });
  const metricsFile = (metrics, details = {}) => {
    const file = join(mkdtempSync(join(tmpdir(), 'quality-')), 'metrics.json');
    writeFileSync(file, JSON.stringify({ ...baseline(), metrics, details }));
    return file;
  };

  test('--fast measures the quick metrics and passes on the repository as committed', () => {
    const r = run('scripts/quality-check.mjs', ['--fast']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /quality: .* no worse than the baseline/);
  });

  test('a metrics file with a worse value exits 1 and names the metric', () => {
    const r = run('scripts/quality-check.mjs', [metricsFile({ ...baseline().metrics, audit_critical: 2 })]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /audit_critical/);
  });

  test('the baseline itself passes as a metrics file', () => {
    const r = run('scripts/quality-check.mjs', [metricsFile(baseline().metrics)]);
    assert.equal(r.status, 0, r.stderr);
  });

  test('a run that left a test file out of the suite is no measure of a release, and is refused', () => {
    const r = run('scripts/quality-check.mjs', [metricsFile(baseline().metrics, { left_out: ['test/x.test.js'] })]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /left out.*test\/x\.test\.js/);
  });

  test('a secret that is found is named by file and line, and the text that matched is never printed', () => {
    const secrets = [{ file: 'src/a.js', line: 7, rule: 'aws-key' }];
    const r = run('scripts/quality-check.mjs', [metricsFile({ ...baseline().metrics, secrets_found: 1 }, { secrets })]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /src\/a\.js:7 \(aws-key\)/);
    assert.deepEqual(measureFast().details.secrets, []);
  });

  test('the metrics script writes to a file with --out, and to the screen without it', () => {
    const src = read('scripts/quality-metrics.mjs');
    assert.match(src, /--out/);
    assert.match(src, /--fast/);
    assert.ok(exists('quality/baseline.json') && exists('quality/accepted.json'));
  });
});

describe('the secrets scan', () => {
  // each sample is assembled here from parts, so this file holds none of them whole; the scan reads this file too
  const join_ = (...parts) => parts.join('');
  const SAMPLES = {
    'private-key': `-----BEGIN ${join_('RS', 'A')} ${join_('PRIV', 'ATE')} ${join_('K', 'EY')}-----`,
    'github-token': join_('gh', 'p_', 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bD1fH3jL5'),
    'aws-key': join_('AK', 'IA', 'ABCD1234EFGH5678'),
    'api-key': join_('s', 'k-', 'proj1234567890abcdefghijklmnop'),
    'slack-token': join_('xo', 'xb-', '123456789012-abcdefghijkl'),
    'password-literal': `const ${join_('pass', 'word')} = '${join_('hunter', '2hunter2')}';`,
  };

  test('finds each kind of secret, by file line, and never repeats the text', () => {
    for (const [rule, sample] of Object.entries(SAMPLES)) {
      const found = findSecrets(`one\ntwo ${sample}\nthree`);
      assert.deepEqual(
        found.map((f) => [f.rule, f.line]),
        [[rule, 2]],
        rule,
      );
      assert.doesNotMatch(
        JSON.stringify(found),
        new RegExp(sample.slice(8, 20).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')),
      );
    }
  });

  test('a long token in a quoted setting is found; ordinary words about passwords are not', () => {
    assert.equal(findSecrets(`${join_('api', 'Key')}: "${'x1Y2'.repeat(8)}"`).length, 1);
    for (const calm of [
      'the password field is hidden',
      "const password = process.env['PASSWORD'];",
      "password: 'example'",
      "const token = ''",
      'tokens are read from the lexer',
      'const sky = 1; // sk-learn is not a key',
      'AKIA is how such keys start',
    ])
      assert.deepEqual(findSecrets(calm), [], calm);
  });

  test('finds none in the repository', () => {
    assert.deepEqual(scanRepo(), []);
  });

  test('the scan looks at the files git would commit, new ones included, and skips what is ignored', () => {
    const files = scannedFiles();
    assert.ok(files.includes('scripts/quality-secrets.mjs'));
    assert.ok(files.includes('package.json'));
    assert.ok(!files.some((f) => f.startsWith('node_modules/') || f === 'main.js'));
  });
});

describe('reading the suite’s reports', () => {
  const junit = (cases) =>
    `<?xml version="1.0"?><testsuites>${cases
      .map(
        ([file, suite, name, ok]) =>
          `<testsuite name="${suite}"><testcase name="${name}" file="${ROOT}/${file}"${ok ? '' : ' failure="x"'}/></testsuite>`,
      )
      .join('')}</testsuites>`;

  test('every test, by file, suite and name, passed or failed', () => {
    const got = parseJunit(
      junit([
        ['a/test/x.test.js', 'one', 'works &amp; more', true],
        ['a/test/y.test.js', 'two', 'breaks', false],
      ]),
      ROOT,
    );
    assert.deepEqual(
      [...got],
      [
        ['a/test/x.test.js > one > works & more', 'pass'],
        ['a/test/y.test.js > two > breaks', 'fail'],
      ],
    );
  });

  test('a flaky test is one whose result differs between two runs, and is listed', () => {
    const first = junit([
      ['t/a.test.js', 's', 'steady', true],
      ['t/a.test.js', 's', 'flicker', true],
      ['t/a.test.js', 's', 'broken', false],
    ]);
    const second = junit([
      ['t/a.test.js', 's', 'steady', true],
      ['t/a.test.js', 's', 'flicker', false],
      ['t/a.test.js', 's', 'broken', false],
    ]);
    const a = parseJunit(first, ROOT),
      b = parseJunit(second, ROOT);
    assert.deepEqual(flakyBetween(a, b), ['t/a.test.js > s > flicker']);
    assert.deepEqual(flakyBetween(a, a), []);
  });

  test('a test missing from one of the runs is flaky too, and so is a second run that failed with no test to blame', () => {
    const both = parseJunit(junit([['t/a.test.js', 's', 'steady', true]]), ROOT);
    const extra = parseJunit(
      junit([
        ['t/a.test.js', 's', 'steady', true],
        ['t/a.test.js', 's', 'sometimes there', true],
      ]),
      ROOT,
    );
    assert.deepEqual(flakyBetween(extra, both), ['t/a.test.js > s > sometimes there']);
    assert.deepEqual(flakyBetween(both, extra), ['t/a.test.js > s > sometimes there']);
    assert.equal(flakyBetween(both, both, false).length, 1, 'the run itself failed');
    assert.deepEqual(flakyBetween(both, both, true), []);
  });

  test('line coverage of the files under a folder, as a percentage of their lines', () => {
    const lcov = [
      'SF:packages/core/src/a.ts',
      'LF:100',
      'LH:90',
      'end_of_record',
      'SF:packages/core/src/b.ts',
      'LF:100',
      'LH:50',
      'end_of_record',
      'SF:packages/obsidian/src/c.ts',
      'LF:100',
      'LH:0',
      'end_of_record',
    ].join('\n');
    assert.deepEqual(parseLcov(lcov, 'packages/core/src/'), { files: 2, lines: 200, hit: 140, percent: 70 });
    assert.deepEqual(parseLcov('', 'packages/core/src/'), { files: 0, lines: 0, hit: 0, percent: 0 });
  });
});

describe('a change to the ratchet’s files', () => {
  const tracked = [
    'test/quality-metrics.test.js',
    'test/quality-baseline.test.js',
    'test/engine-version.test.js',
    'test/policy.test.js',
    'test/run-ceiling.test.js',
  ];

  test('runs only the tests that read them, not the whole suite', () => {
    for (const changed of ['scripts/quality-secrets.mjs', 'scripts/quality-metrics.mjs'])
      assert.deepEqual(testsForChanges([changed], tracked), { all: false, files: ['test/quality-metrics.test.js'] });
    // the suite's two runs go through the ceiling's runner, and its test shows they do
    assert.deepEqual(testsForChanges(['scripts/quality-suite.mjs'], tracked), {
      all: false,
      files: ['test/quality-metrics.test.js', 'test/run-ceiling.test.js'],
    });
    for (const changed of [
      'scripts/quality-check.mjs',
      'scripts/quality-spec.mjs',
      'quality/baseline.json',
      'quality/accepted.json',
    ])
      assert.deepEqual(testsForChanges([changed], tracked), {
        all: false,
        files: ['test/quality-baseline.test.js', 'test/quality-metrics.test.js'],
      });
    for (const changed of ['scripts/engine-version.mjs', 'quality/advisories.json'])
      assert.deepEqual(testsForChanges([changed], tracked), { all: false, files: ['test/engine-version.test.js'] });
  });
});

describe('the workflows', () => {
  const release = () => read('.github/workflows/release.yml');
  const runs = (job) => runCommands(jobs(release())[job].join('\n'));

  test('a quality job measures, checks and runs the engine check, and the release waits for it', () => {
    assert.ok('quality' in jobs(release()), 'release.yml has a quality job');
    const quality = runs('quality');
    const at = (re) => quality.findIndex((r) => re.test(r));
    assert.ok(at(/^npm ci\b/) >= 0 && at(/^npm audit signatures\b/) > at(/^npm ci\b/));
    const measured = at(/^node scripts\/quality-metrics\.mjs --out quality\/metrics\.json\b/);
    assert.ok(measured > at(/^npm audit signatures\b/), 'the metrics are measured after the install is verified');
    assert.ok(at(/^node scripts\/quality-check\.mjs quality\/metrics\.json\b/) > measured, 'and then checked');
    assert.ok(at(/^node scripts\/engine-version\.mjs\b(?!.*--)/) >= 0, 'the engine check runs');
    const releaseJob = block(jobs(release()).release, 'needs', 4);
    assert.ok(releaseJob, 'the release job has needs');
    assert.match(releaseJob.join('\n'), /\bquality\b/);
  });

  test('the quality job reads, and never writes', () => {
    const perms = block(jobs(release()).quality, 'permissions', 4);
    assert.equal(perms, null, 'it keeps the workflow’s read-only default');
  });

  test('ordinary CI runs the quick check, and nothing that reaches the network for advisories', () => {
    const ci = runCommands(read('.github/workflows/ci.yml'));
    assert.ok(ci.some((r) => /^node scripts\/quality-check\.mjs --fast$/.test(r)));
    assert.equal(
      ci.some((r) => /--refresh|quality-metrics|npm audit(?! signatures)/.test(r)),
      false,
      'the slow, networked metrics are the release’s',
    );
  });

  test('the measured metrics are not committed: only the baseline and the reasons are', () => {
    assert.match(read('.gitignore'), /^quality\/metrics\.json$/m);
  });
});
