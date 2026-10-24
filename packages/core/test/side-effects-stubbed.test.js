// Side effects are stubbed in test mode (editor spec §35, side_effects_stubbed). A promoted transition's `do` runs its
// stub, never the effect, and nothing outside is reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestRun } from '../src/test-runs.ts';
import { graphOf, REFUND } from './test-runs-fixtures.js';

test('a transition with a side effect runs a stub in test mode and nothing external happens', async (t) => {
  const reached = [];
  t.mock.method(globalThis, 'fetch', async (...args) => reached.push(args));
  const g = graphOf(REFUND);
  const stubbed = [];
  const run = new TestRun(() => g, {
    inputs: { amount: 50 },
    stubs: { send_money: (inputs) => (stubbed.push(inputs.amount), { sent: true }) },
  });
  run.step();
  const paid = run.step();
  assert.deepEqual(paid.stubbed, ['send_money']);
  assert.deepEqual(stubbed, [50], 'the stub ran, given the inputs');
  assert.equal(run.inputs.sent, true, 'what the stub gives back is read as inputs');
  assert.deepEqual(reached, [], 'nothing outside was reached');
});

test('a side effect with no stub given is stubbed with nothing', () => {
  const g = graphOf(REFUND);
  const run = new TestRun(() => g, { inputs: { amount: 50 } });
  run.step();
  assert.deepEqual(run.step().stubbed, ['send_money']);
  assert.deepEqual(run.inputs, { amount: 50 });
});

test('a step back undoes what a stub read into the inputs', () => {
  const g = graphOf(REFUND);
  const run = new TestRun(() => g, {
    inputs: { amount: 50 },
    stubs: { send_money: () => ({ amount: 500, sent: true }) },
  });
  run.step();
  const first = run.step();
  assert.deepEqual(run.inputs, { amount: 500, sent: true });
  run.back();
  assert.deepEqual(run.inputs, { amount: 50 }, 'back to the inputs before the stub ran');
  assert.deepEqual(run.step().transition, first.transition, 'so the same transition is taken again');
});
