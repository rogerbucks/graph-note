// An accepted AI write is a labelled bundle (editor spec §37, auto_writes_roll_back). It rolls back in one step and
// shows in the review lens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptWrite, acceptedLens, rollBack, scoreWrite } from '../src/ai-write-scoring.ts';
import { GRAPH, graphOf, proposal } from './ai-write-fixtures.js';

const TWO = proposal('two', [
  { op: 'add', gql: "(tablet:Option {name: 'Tablet', price: 2})" },
  { op: 'set', thing: 'large_reader', key: 'price', value: '4' },
]);

test('rolling back an applied bundle reverts all its changes in one step, and the bundle shows in the review lens', () => {
  const queued = scoreWrite({ proposal: TWO, source: { kind: 'ai', name: 'ada' } }, graphOf(GRAPH));
  const accepted = acceptWrite(queued, [GRAPH], 'roger', '2026-10-24T09:00:00Z');
  assert.equal(accepted.ok, true);
  const { bundle } = accepted;
  const after = graphOf(bundle.after[0]);
  assert.equal(after.nodes.has('tablet'), true);
  assert.equal(after.p('large_reader').price, 4);
  assert.equal(bundle.label, 'ai-write:ada/two');
  assert.deepEqual(rollBack(bundle, bundle.after), { ok: true, texts: [GRAPH] });
  assert.deepEqual(acceptedLens([bundle]), [
    { label: 'ai-write:ada/two', acceptedBy: 'roger', at: '2026-10-24T09:00:00Z', changes: 2 },
  ]);
});

test('a bundle needs a person to accept it, and does not roll back over a later edit', () => {
  const queued = scoreWrite({ proposal: TWO, source: { kind: 'ai', name: 'ada' } }, graphOf(GRAPH));
  assert.deepEqual(acceptWrite(queued, [GRAPH], ' ', '2026-10-24T09:00:00Z'), {
    ok: false,
    reason: 'person-must-accept',
  });
  const { bundle } = acceptWrite(queued, [GRAPH], 'roger', '2026-10-24T09:00:00Z');
  assert.deepEqual(rollBack(bundle, [`${bundle.after[0]},\n(extra:Option {name: 'Extra'})`]), {
    ok: false,
    reason: 'moved-since',
  });
});
