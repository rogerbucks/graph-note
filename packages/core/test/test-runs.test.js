// A test run is a run of its own, flagged as a test (editor spec §35, test_runs_flagged). It has its own Run thing and
// its own log, and real history leaves it out unless a lens asks for test runs too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { TestRun, historyOf } from '../src/test-runs.ts';
import { graphOf, REFUND, refundWith } from './test-runs-fixtures.js';

test('a test run is absent from real history unless the lens includes tests', () => {
  const real = refundWith(
    "(monday:Run {process: 'refund'})",
    "(monday_1:Entry {run: 'monday', seq: 1, did: 'entered', state: 'asked'})",
  );
  const run = new TestRun(() => real, { inputs: { amount: 50 } });
  run.step();
  const kept = run.record();
  assert.deepEqual(historyOf(kept), { runs: ['monday'], entries: ['monday_1'] });
  const all = historyOf(kept, { tests: true });
  assert.deepEqual(all.runs, ['monday', 'test-run']);
  assert.deepEqual(all.entries, ['monday_1', 'test-run:1', 'test-run:2', 'test-run:3']);
});

test('a test run is its own Run thing, flagged as a test, with a log of its own', () => {
  const g = graphOf(REFUND);
  const run = new TestRun(() => g, { id: 'try', inputs: { amount: 50 } });
  run.step();
  const kept = run.record();
  assert.deepEqual([...kept.nodes.get('try')[0]], ['Run']);
  assert.equal(kept.p('try').test, true);
  assert.deepEqual(
    gs.runLog(kept, 'try').map((e) => `${e.did} ${e.state}`),
    ['entered asked', 'left asked', 'entered checked'],
  );
  assert.deepEqual(gs.currentOf(kept, 'try'), ['checked']);
  assert.ok(!g.nodes.has('try'), 'the graph run on is left as it was');
});

test('a process to run must be named when the graph has more than one', () => {
  const two = refundWith("(other:Process {name: 'Other'})");
  assert.throws(() => new TestRun(() => two), /name the process/);
  assert.equal(new TestRun(() => two, { process: 'refund' }).process, 'refund');
});
