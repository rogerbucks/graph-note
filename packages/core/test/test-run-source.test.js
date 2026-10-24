// Where a test run reads from (editor spec §35, test_run_source). It reads the live graph, unless a snapshot or an
// editable copy is chosen as it starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestRun } from '../src/test-runs.ts';
import { REFUND, graphOf, liveGraph } from './test-runs-fixtures.js';

// the same process, with the guard on paying raised so 50 is refused
const STRICT = REFUND.replace("'amount <= 100'", "'amount <= 10'").replace("'amount > 100'", "'amount > 10'");

test('a run started with no choice reads live, and one started on a snapshot reads the pinned snapshot', () => {
  const note = liveGraph();
  const live = new TestRun(note.read, { inputs: { amount: 50 } });
  const pinned = new TestRun(note.read, { source: 'snapshot', inputs: { amount: 50 } });
  assert.equal(live.source, 'live');
  note.set(STRICT);
  assert.equal(live.graph(), note.read(), 'live reads the note as it is now');
  assert.notEqual(pinned.graph(), note.read(), 'the snapshot was pinned as it started');
  live.step();
  pinned.step();
  assert.equal(live.step().transition, 'deny', 'the live run sees the edit');
  assert.equal(pinned.step().transition, 'pay', 'the snapshot does not');
});

test('a run on an editable copy takes edits of its own, and the note is left as it was', () => {
  const note = liveGraph();
  const copy = new TestRun(note.read, { source: 'copy', inputs: { amount: 50 } });
  copy.edit(graphOf(STRICT));
  copy.step();
  assert.equal(copy.step().transition, 'deny');
  assert.match(note.read().p('small').expression, /100/);
});

test('only a copy can be edited, and a source must be one of the three', () => {
  const note = liveGraph();
  for (const source of ['live', 'snapshot'])
    assert.throws(() => new TestRun(note.read, { source }).edit(note.read()), /only a run on an editable copy/);
  assert.throws(() => new TestRun(note.read, { source: 'branch' }), /live, a snapshot or a copy/);
});
