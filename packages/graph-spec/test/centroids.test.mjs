// The centroids of a graph's clusters (editor spec §31, wiki/Clusters-design.md step 4). Centroids nest and keep their
// ids after a rebuild. They are worked out again only when their members change. They are never returned as settled
// while they still move. Python's twin must give the same answers on the shared cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { centroidsOf, centroidId, Graph } = require('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./centroid-cases.json', import.meta.url), 'utf8'));

/** The plain graph of one step of a shared case. */
const graphOf = (s) =>
  new Graph(
    new Map(s.nodes.map(([id, labels, props]) => [id, [new Set(labels), { id, ...props }]])),
    s.edges.map(([a, t, b]) => [a, t, b, {}]),
  );
/** The answer to each step of a shared case, each step given the answer before. */
function run(c, options = c.options ?? {}) {
  let previous;
  return c.steps.map((s) => (previous = centroidsOf(graphOf(s), { ...options, previous })));
}
const named = (name) => cases.find((c) => c.name === name);
const of = (answer, cluster) => answer.centroids.find((c) => c.cluster === cluster);

for (const c of cases)
  test(`the shared case "${c.name}" gives its recorded centroids`, () => {
    assert.deepEqual(run(c), c.expected);
  });

test("the atoms' centroid is a member of the molecule, and the molecule's of the cell", () => {
  const [answer] = run(named('atoms sum up into a molecule, and the molecule into a cell'));
  assert.deepEqual(
    of(answer, 'molecule').basis.map((b) => b[0]),
    ['atoms'],
  );
  assert.deepEqual(of(answer, 'cell').kinds, { Centroid: 1, Part: 1 });
  assert.deepEqual(of(answer, 'molecule').certainty, of(answer, 'atoms').certainty);
});

test('a centroid keeps its id after a rebuild, made from its cluster id', () => {
  const c = named('atoms sum up into a molecule, and the molecule into a cell');
  const [first] = run(c);
  const [again] = run(c);
  assert.deepEqual(
    first.centroids.map((x) => x.id),
    again.centroids.map((x) => x.id),
  );
  assert.equal(of(first, 'atoms').id, centroidId('atoms'));
  assert.match(centroidId('atoms'), /^sha-256:[0-9a-f]{64}$/);
});

test('an unrelated edit works out no centroid again, and a member leaving works out all of its clusters', () => {
  assert.deepEqual(run(named('an unrelated edit works out no centroid again')).at(-1).recomputed, []);
  assert.deepEqual(run(named('a member leaving works out every cluster it was in again')).at(-1).recomputed, [
    'a',
    'b',
    'c',
  ]);
});

test('two centroids that swap stop at the most passes, and their clusters are flagged unsettled', () => {
  const last = run(named('two centroids that swap stop at the most passes, unsettled')).at(-1);
  assert.equal(last.passes, 50);
  assert.equal(last.settled, false);
  assert.deepEqual(
    last.centroids.map((c) => c.settled),
    [false, false],
  );
});

test('a run that runs out of time is never returned as settled', () => {
  let now = 0;
  const clock = () => (now += 10);
  const c = named('a cycle of two clusters settles');
  const [answer] = run(c, { budget: 5, clock });
  assert.equal(answer.passes, 1);
  assert.equal(answer.settled, false);
  assert.ok(answer.centroids.every((x) => !x.settled));
  const [full] = run(c, { budget: Infinity, clock });
  assert.equal(full.settled, true);
});
