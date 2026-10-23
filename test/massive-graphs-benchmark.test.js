// The scale benchmark (editor spec §53, scale_benchmark): scripts/scale-benchmark.mjs. It makes graphs of growing size
// from the V-10 huge graph. It records the time and memory of each step, and fails when a step goes past its budget.
// Only the smallest size is run for real here; CI's lint job runs every size.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readNote } from '../packages/core/src/drawing.ts';
import { SCALE_BUDGETS } from '../scripts/benchmarks/scale-budgets.mjs';
import { SIZES, STEPS, grown, hugeBlock, measure, overBudget, table } from '../scripts/scale-benchmark.mjs';
import { path, read } from './repository/repo.js';

/** A small graph of three things and two links, in the shape of the V-10 block. */
const SMALL =
  "// graph: huge\n(a:Thing {name: 'A (one)'}),\n(b:Thing {name: 'B'}),\n(c:Thing),\n(a)-[:LINKS]->(b),\n(b)-[:LINKS]->(c)";

test('the sizes go from the V-10 graph up to one hundred times larger', () => {
  assert.equal(SIZES[0], 1);
  assert.equal(SIZES.at(-1), 100);
  assert.ok(SIZES.every((s, i) => i === 0 || s > SIZES[i - 1]));
});

test('a grown graph holds every copy, with no key shared, linked in one piece', () => {
  const drawing = readNote([grown(SMALL, 4)]).graphs.get('huge');
  assert.equal(drawing.boxes.length, 12);
  assert.equal(new Set(drawing.boxes.map((b) => b.key)).size, 12);
  // two links a copy, and one joining each copy to the one before it
  assert.equal(drawing.links.length, 4 * 2 + 3);
  assert.equal(grown(SMALL, 1), SMALL);
});

test('the V-10 graph grown ten times is ten times its things', () => {
  const block = hugeBlock();
  const once = readNote([block]).graphs.get('huge').boxes.length;
  const lines = (text) => text.split('\n').length;
  assert.ok(once > 2000, 'the V-10 graph is past the drawing limit');
  // ten copies, less the one heading, and one joining link for each copy after the first
  assert.equal(lines(grown(block, 10)), 10 * (lines(block) - 1) + 1 + 9);
});

test('each step records its outcome, its time and the memory it kept; a step not built records no numbers', async () => {
  let now = 0;
  const steps = {
    open: () => ((now += 5), { outcome: 'done', things: 3, links: 2 }),
    draw: () => ((now += 2), { outcome: 'refused: over the drawing limit on things, shown as text' }),
    pan: () => ({ outcome: 'not built: the overview (way E, step 4)' }),
  };
  const r = await measure(SMALL, 2, steps, () => now);
  assert.equal(r.times, 2);
  assert.equal(r.things, 3);
  assert.ok(r.bytes > SMALL.length && r.lines > SMALL.split('\n').length);
  assert.deepEqual(Object.keys(r.steps), ['open', 'draw', 'pan']);
  assert.equal(r.steps.open.ms, 5);
  assert.equal(r.steps.draw.ms, 2);
  assert.equal(typeof r.steps.open.mb, 'number');
  assert.deepEqual(r.steps.pan, { outcome: 'not built: the overview (way E, step 4)', ms: null, mb: null });
  assert.match(table([r]), /\| 2× V-10 .* \| draw \| refused: over the drawing limit/);
});

test('the real steps on the V-10 graph: read, refused as a drawing, grouped, panned and filtered as an overview, and edited', async () => {
  const r = await measure(hugeBlock(), 1);
  assert.equal(r.steps.open.outcome, 'done');
  assert.match(r.steps.draw.outcome, /^refused: over the drawing limit on things/);
  assert.match(r.steps.overview.outcome, /^done: \d+ marks/);
  assert.match(r.steps.pan.outcome, /^done: at most \d+ marks a frame/);
  assert.match(r.steps.filter.outcome, /^done: \d+ things kept/);
  assert.equal(r.steps.edit.outcome, 'done');
  assert.ok(r.things > 2000);
  assert.deepEqual(Object.keys(r.steps), Object.keys(STEPS));
});

test('a step over its budget in time or in memory is named, with what was measured and what is allowed', () => {
  const records = [
    {
      times: 10,
      steps: { open: { outcome: 'done', ms: 900, mb: 5 }, pan: { outcome: 'not built', ms: null, mb: null } },
    },
    { times: 1, steps: { open: { outcome: 'done', ms: 10, mb: 80 } } },
  ];
  const budgets = { open: { 1: { ms: 100, mb: 50 }, 10: { ms: 500, mb: 50 } }, pan: { 10: { ms: 1, mb: 1 } } };
  assert.deepEqual(overBudget(records, budgets), [
    '10× V-10, open: 900 ms, where under 500 ms are allowed',
    '1× V-10, open: 80 MB kept, where under 50 MB are allowed',
  ]);
  assert.deepEqual(overBudget([{ times: 1, steps: { open: { outcome: 'done', ms: 10, mb: 1 } } }], budgets), []);
});

test('every size has a budget for each step that is built', () => {
  for (const name of ['open', 'group', 'overview', 'pan', 'filter', 'edit'])
    for (const s of SIZES) assert.ok(SCALE_BUDGETS[name][s], `${name} at ${s}×`);
  assert.ok(SCALE_BUDGETS.draw[1]);
});

test('the command prints the records as JSON, and CI runs every size', () => {
  const run = (sizes) => {
    try {
      return {
        code: 0,
        out: execFileSync('node', [path('scripts/scale-benchmark.mjs'), '--sizes', sizes, '--json'], {
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      };
    } catch (e) {
      return { code: e.status, err: e.stderr };
    }
  };
  // a size with no budget passes; its records are printed as JSON
  const ok = run('2');
  assert.equal(ok.code, 0);
  assert.equal(JSON.parse(ok.out)[0].times, 2);
  assert.match(read('package.json'), /"bench:scale": "node --expose-gc scripts\/scale-benchmark\.mjs"/);
  assert.match(read('.github/workflows/ci.yml'), /run: npm run bench:scale/);
});
