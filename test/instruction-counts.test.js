// The benchmarks' work counted in CPU instructions, never in elapsed time (spec §12, quality_ratchet): Cachegrind's
// output read, each case counted less its setup, the claims checked, and nothing counted, and said so, where Valgrind
// is not installed. Valgrind itself is not run here: its output is read from files in its own format, and the counting
// of processes is handed a fake. The benchmarks are run once without it, to show each still does its work.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CLAIMS_METRIC,
  NODE_FLAGS,
  VALGRIND_FLAGS,
  bundleBenchmarks,
  measureInstructions,
  parseCachegrind,
  valgrindVersion,
} from '../scripts/instruction-counts.mjs';
import { BENCHMARK_NAMES } from '../scripts/quality-spec.mjs';
import { BENCHMARKS } from '../scripts/benchmarks/index.mjs';
import { DOCKERFILE, imageTag, modulesVolume, runArgs } from '../scripts/bench-local.mjs';
import { read, readJSON, ROOT } from './repository/repo.js';

const fixture = (name) => read(`test/instruction-counts/cachegrind.out.${name}`);

// The fixtures are real Cachegrind 3.24.0 output, of /bin/true in the benchmarks' image (ARM Linux, 12 Oct 2026): its
// header, the first and last of its cost lines, and its summary, cut in the middle (the whole is 3,199 lines), with the
// cache simulated (`.simulated`) and not (`.counted`).
describe('reading Cachegrind’s output', () => {
  test('the instructions counted, from its summary, and the command that was counted', () => {
    const r = parseCachegrind(fixture('counted'));
    assert.deepEqual(r.events, ['Ir']);
    assert.equal(r.totals.Ir, 125_571);
    assert.equal(r.command, '/bin/true');
  });

  test('the instructions among the cache events, by their place in the events line', () => {
    const r = parseCachegrind(fixture('simulated'));
    assert.equal(r.totals.Ir, 125_571);
    assert.equal(r.totals.Dr, 34_222);
    assert.equal(r.totals.DLmw, 315);
    assert.equal(r.events.length, 9, 'the events line’s trailing space is no event');
  });

  test('without a summary line, the sum of the cost lines, each a line number and then its counts', () => {
    const bare = fixture('counted').replace(/^summary: .*\n/m, '');
    assert.equal(parseCachegrind(bare).totals.Ir, 167, 'the cost lines kept in the fixture');
  });

  test('a file that counts no instructions, or whose totals cannot be read, is refused, never read as nothing', () => {
    assert.throws(() => parseCachegrind('cmd: x\nevents: Dr Dw\nsummary: 1 2\n'), /counts no instructions/);
    assert.throws(() => parseCachegrind('nothing at all'), /counts no instructions/);
    assert.throws(() => parseCachegrind('events: Ir\nsummary: lots\n'), /cannot be read/);
  });
});

/** A benchmark made for the purpose: two sizes of one piece of work, the whole held under three quarters done four times. */
const LINEAR = {
  name: 'linear',
  spec: 'a test',
  proves: 'that the counting works',
  setup: () => null,
  cases: { whole: () => {}, quarters: () => {} },
  counted: ['whole'],
  claims: [{ says: 'the whole is linear', of: (n) => [n.whole, 3 * n.quarters] }],
};
/** A counter of processes that gives these counts, by case, in turn for each run; and the calls it was asked. */
function fakeCounter(counts, fingerprints) {
  const asked = [];
  const runs = {};
  return {
    asked,
    counter: async () => ({
      fingerprints,
      count(benchmark, which) {
        asked.push(`${benchmark} ${which}`);
        const list = [counts[which]].flat();
        runs[which] = (runs[which] ?? -1) + 1;
        return list[runs[which] % list.length];
      },
      done: () => asked.push('done'),
    }),
  };
}
const HERE = () => 'valgrind-3.22.0';
const LINEAR_COUNTS = { setup: 1000, whole: 1400, quarters: 1200 };

describe('counting the benchmarks', () => {
  test('without Valgrind, nothing is counted, and it says why: every count null, never a number of another kind', async () => {
    const r = await measureInstructions({ benchmarks: [LINEAR], version: () => null, counter: () => assert.fail() });
    assert.deepEqual(r.metrics, { instructions_linear: null, [CLAIMS_METRIC]: null });
    assert.equal(r.details.instructions.measured, false);
    assert.match(r.details.instructions.why, /^not measured: valgrind is not installed here/);
    assert.match(r.details.instructions.why, /Linux.*Apple-silicon Macs/);
  });

  test('each case is counted less its setup, the cases it counts summed, and each claim checked', async () => {
    const fake = fakeCounter({ setup: 1000, whole: 1400, quarters: 1200 });
    const r = await measureInstructions({ benchmarks: [LINEAR], version: HERE, counter: fake.counter });
    assert.deepEqual(fake.asked, ['linear setup', 'linear whole', 'linear quarters', 'done']);
    assert.deepEqual(r.metrics, { instructions_linear: 400, [CLAIMS_METRIC]: 0 });
    const { instructions } = r.details;
    assert.equal(instructions.measured, true);
    assert.deepEqual(instructions.benchmarks[0].cases, { whole: 400, quarters: 200 });
    assert.equal(instructions.benchmarks[0].setup, 1000);
    assert.deepEqual(instructions.claims, [
      { benchmark: 'linear', says: 'the whole is linear', measured: 400, allowed: 600, holds: true },
    ]);
    assert.equal(instructions.machine.valgrind, 'valgrind-3.22.0');
    for (const key of ['os', 'arch', 'node_major']) assert.ok(key in instructions.machine, key);
    assert.deepEqual(instructions.flags, { node: NODE_FLAGS, valgrind: VALGRIND_FLAGS });
  });

  test('a claim that does not hold is counted as broken, with what was measured and what is allowed', async () => {
    const fake = fakeCounter({ setup: 1000, whole: 2000, quarters: 1100 });
    const r = await measureInstructions({ benchmarks: [LINEAR], version: HERE, counter: fake.counter });
    assert.equal(r.metrics[CLAIMS_METRIC], 1);
    assert.deepEqual(
      r.details.instructions.claims.map((c) => [c.measured, c.allowed, c.holds]),
      [[1000, 300, false]],
    );
  });

  test('counted several times over, the least of each is kept, and how far each metric could move is reported', async () => {
    const fake = fakeCounter({ setup: [1000, 1010, 1000], whole: [1400, 1400, 1420], quarters: 1200 });
    const r = await measureInstructions({ benchmarks: [LINEAR], runs: 3, version: HERE, counter: fake.counter });
    assert.equal(fake.asked.filter((a) => a === 'linear whole').length, 3);
    assert.equal(r.metrics.instructions_linear, 400);
    // the whole's range (20) and the setup's (10), over the metric (400)
    assert.equal(r.details.instructions.benchmarks[0].spread, 30 / 400);
    assert.equal(r.details.instructions.largest_spread, 30 / 400);
  });

  test('a case that counts no work beyond its setup, or less, fails the run, naming it, never kept as a count', async () => {
    for (const whole of [1000, 900]) {
      const fake = fakeCounter({ setup: 1000, whole, quarters: 1200 });
      const counting = measureInstructions({ benchmarks: [LINEAR], version: HERE, counter: fake.counter });
      await assert.rejects(counting, new RegExp(`counted no work beyond its setup.*linear whole: ${whole - 1000}`));
    }
  });

  test('processes are counted at once, as many as asked, each count still its own case’s, and the machine named', async () => {
    let running = 0,
      most = 0;
    const counts = { setup: 1000, whole: 1400, quarters: 1200 };
    const counter = async () => ({
      count: async (_name, which) => {
        most = Math.max(most, ++running);
        await new Promise((r) => setImmediate(r));
        running--;
        return counts[which];
      },
      done: () => {},
    });
    const r = await measureInstructions({ benchmarks: [LINEAR], runs: 3, parallel: 2, version: HERE, counter });
    assert.equal(most, 2, 'two at once, never more');
    assert.deepEqual(r.details.instructions.benchmarks[0].cases, { whole: 400, quarters: 200 });
    assert.equal(typeof r.details.instructions.machine.cpu, 'string');
    assert.ok(r.details.instructions.machine.cpu.length > 0);
  });

  test('a process Cachegrind cannot count fails the run, and the counter is still put away', async () => {
    const asked = [];
    const counter = async () => ({
      count: () => {
        throw new Error('linear setup failed under Cachegrind');
      },
      done: () => asked.push('done'),
    });
    const counting = measureInstructions({ benchmarks: [LINEAR], version: HERE, counter });
    await assert.rejects(counting, /failed under Cachegrind/);
    assert.deepEqual(asked, ['done']);
  });

  test('each process runs under Cachegrind counting instructions alone, with Node’s flags pinned for the same count each run', () => {
    const valgrind = ['--tool=cachegrind', '--cache-sim=no', '--smc-check=all'];
    for (const flag of valgrind) assert.ok(VALGRIND_FLAGS.includes(flag), flag);
    const pinned = [
      '--single-threaded',
      '--predictable',
      '--predictable-gc-schedule',
      '--random-seed=1',
      '--disable-wasm-trap-handler',
    ];
    for (const flag of pinned) assert.ok(NODE_FLAGS.includes(flag), flag);
    const random = () =>
      spawnSync(process.execPath, [...NODE_FLAGS, '-e', 'process.stdout.write(String(Math.random()))'], {
        encoding: 'utf8',
      });
    const [once, again] = [random(), random()];
    assert.equal(once.status, 0, once.stderr);
    assert.equal(once.stdout, again.stdout, 'Node takes every flag, and its random numbers start from the one seed');
  });

  test(
    'the command says in one line that nothing was counted here, and gives no number',
    { skip: valgrindVersion() ? 'Valgrind is installed here, so it would count' : false },
    () => {
      const r = spawnSync(process.execPath, ['scripts/instruction-counts.mjs', '--only', 'naming'], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr.trim().split('\n').length, 1);
      assert.match(r.stderr, /^instruction counts: not measured: valgrind is not installed here/);
      assert.deepEqual(JSON.parse(r.stdout).metrics, { instructions_naming: null, [CLAIMS_METRIC]: null });
    },
  );
});

/**
 * What is wrong with the age a Dockerfile records for its pinned base, or null: the creation of the digest's own
 * images, as `docker buildx imagetools inspect` gives it, at least 7 days before the day it was pinned.
 */
function ageProblem(text) {
  const created = /were created by\s*\n?#?\s*(\d{4}-\d\d-\d\dT[\d:]+Z)/.exec(text)?.[1];
  const pinned = /pinned by its digest on (\d{4}-\d\d-\d\d)/.exec(text)?.[1];
  if (!created || !pinned) return 'the image must record its digest’s creation and the day it was pinned';
  const days = (Date.parse(`${pinned}T00:00:00Z`) - Date.parse(created)) / 86_400_000;
  return days >= 7 ? null : `the digest was created ${days.toFixed(1)} days before it was pinned, under 7`;
}

describe('counting on one’s own machine, in a container', () => {
  const dockerfile = () => read(DOCKERFILE);

  test('the image’s base is pinned by its digest, published over 7 days before it was pinned, and nothing is copied in', () => {
    const from = dockerfile()
      .split('\n')
      .filter((l) => /^FROM\s/.test(l));
    assert.equal(from.length, 1);
    assert.match(from[0], /^FROM node:24\.[\d.]+-[a-z]+-slim@sha256:[0-9a-f]{64}$/);
    assert.ok(ageProblem(dockerfile()) === null, ageProblem(dockerfile()));
    assert.doesNotMatch(dockerfile(), /^(COPY|ADD)\s/m, 'the repository is mounted, never copied');
  });

  test('the age held is the pinned digest’s own images’ creation, never a tag’s release date', () => {
    const at = (created, pinned) =>
      `# node:24.20.0-trixie-slim, pinned by its digest on ${pinned}. The digest's own images were created by\n# ${created} (the latest of its platforms)`;
    assert.equal(ageProblem(at('2026-08-27T17:10:35Z', '2026-10-12')), null);
    assert.match(ageProblem(at('2026-10-06T05:40:00Z', '2026-10-12')), /5\.\d+ days/, 'a digest younger than 7 days');
    const tagOnly = '# node:24.20.0-trixie-slim, published 27 Aug 2026, pinned by its digest on 12 Oct 2026';
    assert.match(ageProblem(tagOnly), /creation/, 'a tag’s release date is not the digest’s age');
  });

  test('npm run bench:local builds it when needed and counts in it, the repository mounted and node_modules its own', () => {
    assert.equal(readJSON('package.json').scripts['bench:local'], 'node scripts/bench-local.mjs');
    assert.match(imageTag(), /^thoughtknot-benchmarks:[0-9a-f]{12}$/);
    const args = runArgs('thoughtknot-benchmarks:x', ['--only', 'naming'], '/here');
    assert.ok(args.includes('type=bind,source=/here,target=/repo'));
    const volume = `type=volume,source=${modulesVolume('/here')},target=/repo/node_modules`;
    assert.ok(args.includes(volume), 'not the host’s');
    assert.deepEqual(args.slice(-2), ['--only', 'naming'], 'the counts’ own arguments, passed through');
    assert.match(args.join(' '), /npm ci .*node scripts\/instruction-counts\.mjs "\$@"/);
  });

  test('each checkout keeps its node_modules in a volume of its own, so worktrees never install over each other', () => {
    assert.match(modulesVolume('/a/thoughtknot'), /^thoughtknot-benchmarks-node-modules-[0-9a-f]{12}$/);
    assert.equal(
      modulesVolume('/a/thoughtknot'),
      modulesVolume('/a/thoughtknot'),
      'the same checkout, the same volume',
    );
    assert.notEqual(modulesVolume('/a/thoughtknot'), modulesVolume('/a/thoughtknot/.claude/worktrees/b'));
    const mounted = (root) => runArgs('t', [], root).find((a) => a.startsWith('type=volume'));
    assert.notEqual(mounted('/a/thoughtknot'), mounted('/a/other'));
  });

  test('without Docker, it says so in one line, and counts nothing', () => {
    const r = spawnSync(process.execPath, ['scripts/bench-local.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, DOCKER: join(tmpdir(), 'no-such-docker') },
    });
    assert.equal(r.status, 1);
    assert.equal(r.stderr.trim().split('\n').length, 1);
    assert.match(r.stderr, /^bench:local: Docker is not running here/);
  });
});

describe('the benchmarks', () => {
  test('are the set the ratchet declares, each saying what it proves, counting only its own cases, with a claim', () => {
    assert.deepEqual(
      BENCHMARKS.map((b) => b.name),
      BENCHMARK_NAMES,
    );
    for (const b of BENCHMARKS) {
      assert.ok(b.proves && b.spec, b.name);
      assert.ok(b.counted.length && b.counted.every((c) => c in b.cases), `${b.name} counts its own cases`);
      assert.ok(b.claims.length >= 1, `${b.name} claims something`);
      assert.ok(!('setup' in b.cases), `${b.name}: setup is the name of the setup alone`);
    }
  });

  test('every case of every benchmark does its work, checked by the case itself, so a release never counts a broken one', async () => {
    for (const b of BENCHMARKS) {
      const inputs = await b.setup();
      try {
        for (const [name, run] of Object.entries(b.cases))
          await assert.doesNotReject(async () => run(inputs), `${b.name} ${name}`);
      } finally {
        inputs?.close?.();
      }
    }
  });

  test('a case runs as bundled for Cachegrind, the engine in it: the draw through the runner and the cheapest naming', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'benchmarks-'));
    try {
      const { files } = await bundleBenchmarks(dir, BENCHMARKS);
      for (const [name, which] of [
        ['draw_fifty', 'through-runner'],
        ['naming', 'book-quarters'],
      ]) {
        const r = spawnSync(process.execPath, [...NODE_FLAGS, files[name], which], { encoding: 'utf8' });
        assert.equal(r.status, 0, `${name} ${which}: ${r.stderr}`);
        assert.equal(r.stdout, '', 'a case prints nothing');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a case that goes wrong fails its process, so no count is kept', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'benchmarks-'));
    try {
      const { files } = await bundleBenchmarks(dir, BENCHMARKS);
      const r = spawnSync(process.execPath, [files.naming, 'no-such-case'], { encoding: 'utf8' });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /naming has no case no-such-case/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// A baseline is measured again whenever a benchmark changes; one whose code has not changed would count the same, so
// its count is kept (spec §12, quality_ratchet). The fingerprint is the benchmark's own bundle, with the machine, Node,
// Valgrind and the flags: change any of them and it is counted again. Every release counts every benchmark.
describe('keeping the count of a benchmark that has not changed', () => {
  const OTHER = { ...LINEAR, name: 'other' };
  const counts = { ...LINEAR_COUNTS };
  const before = async (fingerprints = { linear: 'a', other: 'b' }) =>
    (
      await measureInstructions({
        benchmarks: [LINEAR, OTHER],
        version: HERE,
        counter: fakeCounter(counts, fingerprints).counter,
      })
    ).details.instructions;

  test('each benchmark counted says its fingerprint, the same for the same bundle on the same machine', async () => {
    const [once, again] = [await before(), await before()];
    const prints = once.benchmarks.map((b) => b.fingerprint);
    assert.ok(
      prints.every((p) => /^[0-9a-f]{64}$/.test(p)),
      prints.join(),
    );
    assert.deepEqual(
      again.benchmarks.map((b) => b.fingerprint),
      prints,
    );
    assert.notEqual(prints[0], prints[1], 'each bundle its own');
  });

  test('a benchmark whose fingerprint matches keeps its count, uncounted; one that changed is counted again', async () => {
    const reuse = await before();
    const fake = fakeCounter({ setup: 2000, whole: 2500, quarters: 2200 }, { linear: 'a', other: 'changed' });
    const r = await measureInstructions({ benchmarks: [LINEAR, OTHER], version: HERE, counter: fake.counter, reuse });
    assert.deepEqual(fake.asked, ['other setup', 'other whole', 'other quarters', 'done']);
    const [kept, counted] = r.details.instructions.benchmarks;
    assert.deepEqual([kept.cases, kept.setup, kept.kept], [{ whole: 400, quarters: 200 }, 1000, true]);
    assert.deepEqual([counted.cases, counted.setup, counted.kept], [{ whole: 500, quarters: 200 }, 2000, undefined]);
    assert.deepEqual(r.metrics, { instructions_linear: 400, instructions_other: 500, [CLAIMS_METRIC]: 0 });
    assert.equal(r.details.instructions.claims.length, 2, 'a kept count is still held to its claims');
  });

  test('another Valgrind, Node or machine counts everything again, whatever the bundles', async () => {
    const reuse = await before();
    for (const changed of [
      { version: () => 'valgrind-3.23.0' },
      { reuse: { ...reuse, machine: { ...reuse.machine, node: 'v24.0.0' } } },
      { reuse: { ...reuse, machine: { ...reuse.machine, cpu: 'another' } } },
    ]) {
      const fake = fakeCounter(counts, { linear: 'a', other: 'b' });
      await measureInstructions({
        benchmarks: [LINEAR, OTHER],
        version: HERE,
        counter: fake.counter,
        reuse,
        ...changed,
      });
      assert.equal(fake.asked.length, 7, JSON.stringify(changed));
    }
  });

  test('counted several times over, for the spread, nothing is kept; nor where the bundles have no fingerprint', async () => {
    const reuse = await before();
    const thrice = fakeCounter(counts, { linear: 'a', other: 'b' });
    await measureInstructions({ benchmarks: [LINEAR], runs: 3, version: HERE, counter: thrice.counter, reuse });
    assert.equal(thrice.asked.length, 10);
    const unprinted = fakeCounter(counts);
    await measureInstructions({ benchmarks: [LINEAR], version: HERE, counter: unprinted.counter, reuse });
    assert.equal(unprinted.asked.length, 4);
  });

  test('each benchmark is bundled on its own, so a change to one leaves the others’ fingerprints as they were', async () => {
    const dirs = [0, 1].map(() => mkdtempSync(join(tmpdir(), 'benchmarks-')));
    try {
      const [once, again] = await Promise.all(dirs.map((d) => bundleBenchmarks(d, BENCHMARKS)));
      assert.deepEqual(Object.keys(once.files).sort(), BENCHMARKS.map((b) => b.name).sort());
      assert.deepEqual(again.fingerprints, once.fingerprints, 'the same code bundles the same, wherever it is put');
      assert.equal(new Set(Object.values(once.fingerprints)).size, BENCHMARKS.length);
    } finally {
      for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
  });

  test('the command and the quality metrics take an earlier run to keep counts from', () => {
    assert.match(read('scripts/instruction-counts.mjs'), /--reuse <file>/);
    assert.match(read('scripts/quality-metrics.mjs'), /--reuse <file>/);
  });
});
