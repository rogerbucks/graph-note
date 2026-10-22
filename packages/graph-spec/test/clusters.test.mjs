// The clusters of a graph (editor spec §31, wiki/Clusters-design.md step 3). Each membership says whether a person
// wrote it or Louvain found it, and a thing in N clusters counts 1/N in each. Python's twin must give the same answers
// on the shared cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { clustersOf, Graph } = require('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./cluster-cases.json', import.meta.url), 'utf8'));

/** The plain graph of a shared case. */
const graphOf = (c) =>
  new Graph(
    new Map(c.nodes.map(([id, labels]) => [id, [new Set(labels), { id }]])),
    c.edges.map(([s, t, d]) => [s, t, d, {}]),
  );
const byName = (name) => graphOf(cases.find((c) => c.name === name));

for (const c of cases)
  test(`the shared case "${c.name}" gives its recorded clusters`, () => {
    const g = graphOf(c);
    assert.deepEqual(clustersOf(g), c.expected.all);
    assert.deepEqual(clustersOf(g, 'asserted'), c.expected.asserted);
    assert.deepEqual(clustersOf(g, 'found'), c.expected.found);
  });

test('found and written memberships record their kind, and a filter by kind shows only that kind', () => {
  const g = byName('written and found together');
  const kinds = new Set(clustersOf(g).memberships.map((m) => m.kind));
  assert.deepEqual([...kinds], ['asserted', 'found']);
  for (const kind of ['asserted', 'found']) {
    const shown = clustersOf(g, kind);
    assert.ok(shown.clusters.length > 0);
    assert.ok(shown.clusters.every((c) => c.kind === kind));
    assert.ok(shown.memberships.every((m) => m.kind === kind));
  }
  assert.throws(() => clustersOf(g, 'guessed'), /one of asserted, found/);
});

test('a found cluster carries the share of its links that stay inside, and a written one carries none', () => {
  const { clusters } = clustersOf(byName('two triangles joined by one link'));
  assert.deepEqual(
    clusters.map((c) => c.confidence),
    [0.75, 0.75],
  );
  assert.equal(clustersOf(byName('a written cluster of atoms'), 'asserted').clusters[0].confidence, null);
});

test('a thing in four clusters counts a quarter in each', () => {
  const { memberships } = clustersOf(byName('a thing in four clusters'));
  const x = memberships.filter((m) => m.thing === 'x');
  assert.deepEqual(
    x.map((m) => [m.cluster, m.weight]),
    [
      ['a', 0.25],
      ['b', 0.25],
      ['c', 0.25],
      ['d', 0.25],
    ],
  );
});
