// The graph mesh's history (editor spec §29, history_before_join): mesh-history.ts. Each note's text is kept as it
// was after each change. Say a join brings in a contradiction. Then the mesh as it was before the join can be seen,
// and so can the time the claim became contested.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshHistory } from '../src/mesh-history.ts';

const note = (doc, price) =>
  [
    '```gql',
    `// graph: shop · document ${doc} · schema s1 · as of 2026-10-01`,
    `(widget:Product {name: 'Widget', price: ${price}})`,
    '```',
  ].join('\n');

/** A clock that reads each of `times` in turn. */
const clock = (times) => {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)];
};

test('after a join that brought in a contradiction, history gives the mesh before it and when the claim was contested', () => {
  const h = new MeshHistory(
    clock(['2026-10-01T09:00', '2026-10-01T09:01', '2026-10-01T09:02', '2026-10-01T10:00', '2026-10-01T11:00']),
  );
  h.change('a.md', note('doc:a', 10), 'Ann');
  h.change('b.md', note('doc:b', 10), 'Ben');
  const first = h.join(['a.md', 'b.md'], 'sync');
  assert.deepEqual(first.conflicts, []);
  h.change('b.md', note('doc:b', 12), 'Ben');
  const second = h.join(['a.md', 'b.md'], 'sync');
  assert.equal(second.conflicts.length, 1);
  const claim = 'claim:join/widget/price=12@b';
  assert.equal(h.contestedSince(claim), '2026-10-01T11:00');
  // the mesh as it was before that join: one price, asserted, nothing contested
  const before = h.joinAt(['a.md', 'b.md'], h.lastJoinBefore('2026-10-01T11:00'));
  assert.deepEqual(before.conflicts, []);
  assert.equal(before.nodes.widget.price, 10);
  assert.equal(h.contestedSince('claim:join/widget/price=99@b'), null);
});

test('a deleted note is gone from the mesh from then on, and there before', () => {
  const h = new MeshHistory(clock(['t1', 't2']));
  h.change('a.md', note('doc:a', 10), 'Ann');
  h.change('a.md', null, 'Ann');
  assert.deepEqual(Object.keys(h.textsAt('t1')), ['a.md']);
  assert.deepEqual(Object.keys(h.textsAt('t2')), []);
});
