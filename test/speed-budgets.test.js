// The speed budgets (editor spec §41, speed_budgets): each host is held, in CPU instructions and never in time, to a
// budget for drawing 50 things and 500, a query over a 10 000-thing mesh, and a cold start. Each budget is a benchmark's
// claim in the quality ratchet (scripts/benchmarks/), counted by Cachegrind in the release's quality job, where a claim
// that does not hold fails whatever the baseline says. Here: every budget has its benchmark and its claim, each case does
// its work, and a count over its budget breaks the claim. Until slice 6 builds the mesh, 100 notes of 100 things stand in.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BENCHMARKS } from '../scripts/benchmarks/index.mjs';
import { SPEED_BUDGETS } from '../scripts/benchmarks/budgets.mjs';
import { BENCHMARK_NAMES } from '../scripts/quality-spec.mjs';

const byName = (name) => BENCHMARKS.find((b) => b.name === name);
/** The claim of `benchmark` held to `budget`, found by the budget it is held to. */
const claimOf = (benchmark, budget) => byName(benchmark).claims.find((c) => c.budget === budget);

/** Each budget the requirement names: the benchmark that counts it, and the case its claim reads. */
const BUDGETED = [
  { budget: 'draw_fifty', benchmark: 'draw_fifty', cases: ['draw', 'through-runner'] },
  { budget: 'draw_five_hundred', benchmark: 'draw_five_hundred', cases: ['draw', 'through-runner'] },
  { budget: 'mesh_query', benchmark: 'mesh_query', cases: ['by-name', 'by-property'] },
  { budget: 'cold_start_obsidian', benchmark: 'cold_start', cases: ['obsidian'] },
  { budget: 'cold_start_claude_code', benchmark: 'cold_start', cases: ['claude-code'] },
];

describe('the budgets', () => {
  test('each one the requirement names is set: 50 and 500 things, the 10 000-thing query, and each host’s cold start', () => {
    assert.deepEqual(Object.keys(SPEED_BUDGETS).sort(), BUDGETED.map((b) => b.budget).sort());
    for (const [name, b] of Object.entries(SPEED_BUDGETS)) {
      assert.ok(Number.isInteger(b.most) && b.most > 0, `${name}: a whole number of instructions`);
      assert.ok(typeof b.why === 'string' && b.why.trim().length > 20, `${name}: says where its number comes from`);
    }
  });

  test('drawing 500 things may cost more than 50, and no more than ten times as much', () => {
    const fifty = SPEED_BUDGETS.draw_fifty.most,
      five = SPEED_BUDGETS.draw_five_hundred.most;
    assert.ok(five > fifty && five <= 10 * fifty, `${five} against ${fifty}`);
  });

  test('each is a benchmark in the quality ratchet, with a claim held to it for every case it counts', () => {
    for (const { budget, benchmark, cases } of BUDGETED) {
      assert.ok(BENCHMARK_NAMES.includes(benchmark), `${benchmark} is in the ratchet`);
      const b = byName(benchmark);
      for (const c of cases) assert.ok(b.counted.includes(c), `${benchmark} counts ${c}`);
      const held = b.claims.filter((c) => c.budget === budget);
      assert.equal(held.length, cases.length, `${budget}: one claim for each case`);
      for (const c of held) assert.match(c.says, /\S/);
    }
  });

  test('each host’s cold start is a claim of its own, so one host cannot hide behind the other', () => {
    const cold = byName('cold_start');
    assert.deepEqual(Object.keys(cold.cases).sort(), ['claude-code', 'obsidian']);
    assert.notEqual(claimOf('cold_start', 'cold_start_obsidian'), claimOf('cold_start', 'cold_start_claude_code'));
  });

  test('a count within its budget holds; one over it breaks the claim, with what was counted and what is allowed', () => {
    for (const { budget, benchmark, cases } of BUDGETED) {
      const most = SPEED_BUDGETS[budget].most;
      for (const claim of byName(benchmark).claims.filter((c) => c.budget === budget)) {
        const within = Object.fromEntries(cases.map((c) => [c, most - 1]));
        const over = Object.fromEntries(cases.map((c) => [c, most + 1]));
        const [counted, allowed] = claim.of(within);
        assert.ok(counted < allowed, `${budget} holds within it`);
        assert.equal(allowed, most);
        const [counted2, allowed2] = claim.of(over);
        assert.ok(!(counted2 < allowed2), `${budget} breaks over it`);
      }
    }
  });
});

describe('the work counted', () => {
  test('each case of each budgeted benchmark does its work, checked by the case itself', async () => {
    for (const name of new Set(BUDGETED.map((b) => b.benchmark))) {
      const b = byName(name);
      const inputs = await b.setup();
      try {
        for (const [which, run] of Object.entries(b.cases))
          await assert.doesNotReject(async () => run(inputs), `${name} ${which}`);
      } finally {
        inputs?.close?.();
      }
    }
  });

  test('500 things are drawn, every one of them', async () => {
    const b = byName('draw_five_hundred');
    const inputs = await b.setup();
    try {
      const svg = b.cases.draw(inputs).svg;
      assert.equal((svg.match(/class="node"/g) ?? []).length, 500);
    } finally {
      inputs?.close?.();
    }
  });

  test('the query finds the one thing asked for among 10 000, across the notes of the mesh', async () => {
    const b = byName('mesh_query');
    const inputs = await b.setup();
    assert.equal(inputs.notes.length, 100);
    assert.equal(
      inputs.notes.reduce((n, r, k) => n + r.graphs.get(`note${k}`).boxes.length, 0),
      10_000,
    );
    const found = b.cases['by-name'](inputs);
    assert.deepEqual(
      found.map((f) => f.text),
      ['Thing 9999'],
    );
  });

  test('each host starts cold and draws: the Obsidian plugin’s route through its layout runner, and the pane’s', async () => {
    const b = byName('cold_start');
    const inputs = await b.setup();
    try {
      const obsidian = await b.cases.obsidian(inputs);
      assert.ok(obsidian.svg.startsWith('<svg'));
      const pane = await b.cases['claude-code'](inputs);
      assert.ok(pane.svg?.startsWith('<svg'), pane.why);
    } finally {
      inputs?.close?.();
    }
  });
});
