// Filters with counts on a massive graph (editor spec §53, scale_facet_counts): facet-counts.ts.
// - Each filter value shows how many things it holds.
// - Choosing a value in one filter updates the counts of the others, never its own.
// - A value with no things left shows zero, and the list keeps its order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACET_VALUES_MOST, FacetIndex, facetsOf, keptGrouping } from '../src/facet-counts.ts';

/** Six things: three people and three places, each with a status where it has one. */
const KEYS = ['ada', 'bob', 'cy', 'oslo', 'rome', 'lima'];
const FACETS = [
  { name: 'Kind', values: ['Person', 'Person', 'Person', 'Place', 'Place', 'Place'] },
  { name: 'status', values: ['done', 'open', 'open', 'done', undefined, 'open'] },
];
const index = () => new FacetIndex(KEYS, FACETS);
const table = (counts, name) => Object.fromEntries(counts.get(name).map((c) => [c.value, c.count]));

test('with nothing chosen, each value shows how many things hold it, most first', () => {
  const counts = index().counts({});
  assert.deepEqual(table(counts, 'Kind'), { Person: 3, Place: 3 });
  assert.deepEqual(
    counts.get('status').map((c) => c.value),
    ['open', 'done'],
  );
  assert.deepEqual(table(counts, 'status'), { open: 3, done: 2 });
  assert.deepEqual(index().kept({}), KEYS);
});

test('choosing a value updates the counts of the other filters, never its own', () => {
  const chosen = { Kind: new Set(['Place']) };
  const counts = index().counts(chosen);
  assert.deepEqual(table(counts, 'Kind'), { Person: 3, Place: 3 }, 'its own counts show what choosing more would add');
  assert.deepEqual(table(counts, 'status'), { open: 1, done: 1 }, 'rome has no status');
  assert.deepEqual(index().kept(chosen), ['oslo', 'rome', 'lima']);
});

test('filters combine: a thing is kept when every filter with a choice keeps it', () => {
  const chosen = { Kind: new Set(['Person']), status: new Set(['open']) };
  assert.deepEqual(index().kept(chosen), ['bob', 'cy']);
  const counts = index().counts(chosen);
  assert.deepEqual(table(counts, 'Kind'), { Person: 2, Place: 1 });
  assert.deepEqual(table(counts, 'status'), { open: 2, done: 1 }, 'among the people only: bob and cy, and ada');
});

test('a value with no things left shows zero, and the list keeps its order', () => {
  const counts = index().counts({ status: new Set(['done']), Kind: new Set(['Person']) });
  assert.deepEqual(
    counts.get('status').map((c) => [c.value, c.count]),
    [
      ['open', 2],
      ['done', 1],
    ],
  );
  const none = index().counts({ status: new Set(['missing']) });
  assert.deepEqual(table(none, 'Kind'), { Person: 0, Place: 0 });
  assert.deepEqual(index().kept({ status: new Set(['missing']) }), []);
});

test("a graph's facets are its kinds, then each property that sorts its things", () => {
  const things = [
    { key: 'a', kind: 'Task' },
    { key: 'b', kind: 'Task' },
    { key: 'c', kind: 'Note' },
  ];
  const props = {
    a: { id: 'a', status: 'open', title: 'One', tags: ['x'] },
    b: { status: 'done', title: 'Two', due: { s: '2026-10-23' } },
    c: { status: 'open', title: 'Three' },
  };
  const facets = facetsOf(things, (k) => props[k]);
  assert.deepEqual(
    facets.map((f) => f.name),
    ['Kind', 'status', 'title'],
    'id is the name, a list sorts nothing, and a property only one thing has is no filter',
  );
  assert.deepEqual(facets[0].values, ['Task', 'Task', 'Note']);
  assert.deepEqual(facets[1].values, ['open', 'done', 'open']);
  // a property with a value for nearly every thing names things rather than sorting them
  const many = Array.from({ length: FACET_VALUES_MOST + 1 }, (_, i) => ({ key: `t${i}`, kind: 'T' }));
  assert.deepEqual(
    facetsOf(many, (k) => ({ title: k })).map((f) => f.name),
    ['Kind'],
  );
});

test('the overview filtered keeps only the kept things, drops a group left empty, and keeps the order', () => {
  const grouping = {
    by: 'kind',
    groups: [
      { id: 'group:a', label: 'A', by: 'kind', keys: ['a1', 'a2'] },
      { id: 'group:b', label: 'B', by: 'kind', keys: ['b1'] },
      { id: 'group:c', label: 'C', by: 'kind', keys: ['c1', 'c2'] },
    ],
    between: [
      { from: 0, to: 1, links: 2 },
      { from: 0, to: 2, links: 5 },
    ],
  };
  const kept = keptGrouping(grouping, new Set(['a2', 'c1', 'c2']));
  assert.deepEqual(
    kept.groups.map((g) => [g.id, g.keys]),
    [
      ['group:a', ['a2']],
      ['group:c', ['c1', 'c2']],
    ],
  );
  assert.deepEqual(kept.between, [{ from: 0, to: 1, links: 5 }], 'a link to a group taken away goes with it');
  assert.equal(grouping.groups[0].keys.length, 2, 'the grouping given is never changed');
});
