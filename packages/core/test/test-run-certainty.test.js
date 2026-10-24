// A test run leaves certainty as it is (editor spec §35, test_runs_leave_certainty). A run may opt in, as it starts, to
// changing a claim's certainty, and then it records that it did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestRun } from '../src/test-runs.ts';
import { graphOf, REFUND } from './test-runs-fixtures.js';

const likelihoods = (g) => Object.fromEntries([...g.nodes].map(([id, [, p]]) => [id, p.likelihood ?? null]));

test('a default test run leaves every certainty unchanged, and an opted-in run records the opt-in', () => {
  const g = graphOf(REFUND);
  const before = likelihoods(g);
  const plain = new TestRun(() => g, { inputs: { amount: 50 } });
  plain.step();
  const paid = plain.step();
  assert.deepEqual(paid.certainty, [{ thing: 'owed', from: 'even-chance', to: 'very-likely', applied: false }]);
  assert.deepEqual(likelihoods(plain.graph()), before);
  assert.deepEqual(likelihoods(g), before);
  assert.equal(plain.record().p('test-run').certainty, undefined);
  assert.equal(plain.record().out('test-run', 'CHANGED_CERTAINTY').length, 0);

  const opted = new TestRun(() => g, { certainty: true, inputs: { amount: 50 } });
  opted.step();
  assert.equal(opted.step().certainty[0].applied, true);
  assert.equal(opted.graph().p('owed').likelihood, 'very-likely');
  const kept = opted.record();
  assert.equal(kept.p('test-run').certainty, 'opted-in');
  assert.deepEqual(kept.out('test-run', 'CHANGED_CERTAINTY'), [
    ['test-run', 'CHANGED_CERTAINTY', 'owed', { from: 'even-chance', to: 'very-likely' }],
  ]);
  assert.deepEqual(likelihoods(g), before, 'the graph run on is never written');
});

test('a step back undoes the certainty that step applied', () => {
  const g = graphOf(REFUND);
  const run = new TestRun(() => g, { certainty: true, inputs: { amount: 50 } });
  run.step();
  run.step();
  run.back();
  assert.equal(run.graph().p('owed').likelihood, 'even-chance');
});
