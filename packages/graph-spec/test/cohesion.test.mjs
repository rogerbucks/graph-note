// How tightly each cluster holds together, and the certainty its centroid states (editor spec §31). A loose, disputed
// cluster states less than a tight, well-supported one, so a high view cannot hide friction. A cluster that opts in to a
// floor is never more certain than its least certain member. Python's twin must give the same answers on the cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { clusterCertainty, Graph } = require('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./cohesion-cases.json', import.meta.url), 'utf8'));

/** The plain graph of a shared case. */
const graphOf = (s) =>
  new Graph(
    new Map(s.nodes.map(([id, labels, props]) => [id, [new Set(labels), { id, ...props }]])),
    s.edges.map(([a, t, b]) => [a, t, b, {}]),
  );
const named = (name) => cases.find((c) => c.name === name);
const run = (name, options) => {
  const c = named(name);
  return clusterCertainty(graphOf(c.graph), options ?? c.options ?? {});
};
const of = (answer, cluster) => answer.clusters.find((c) => c.cluster === cluster);

for (const c of cases)
  test(`the shared case "${c.name}" gives its recorded cluster certainty`, () => {
    assert.deepEqual(clusterCertainty(graphOf(c.graph), c.options ?? {}), c.expected);
  });

test("a tight, well-supported cluster's centroid is more certain than a loose, contested one's", () => {
  const answer = run('a tight, well-supported cluster states more certainty than a loose, contested one');
  const tight = of(answer, 'tight'),
    loose = of(answer, 'loose');
  // The same words give the same plain centroid, so the plain value alone would hide the friction.
  assert.deepEqual(tight.certainty, loose.certainty);
  assert.ok(tight.stated.low > loose.stated.low);
  assert.equal(tight.cohesion.density, 1);
  assert.deepEqual(loose.cohesion.contested, ['b2']);
  assert.ok(loose.cohesion.score < tight.cohesion.score);
});

test('friction deep inside a cluster lowers the cluster above it', () => {
  const answer = run('friction deep inside a cluster shows in the cluster above it');
  assert.ok(of(answer, 'molecule').cohesion.score < 1);
  assert.ok(of(answer, 'cell').cohesion.support < 1);
  assert.ok(of(answer, 'cell').stated.low < of(answer, 'cell').certainty.low);
});

test('an opted-in parent is never more certain than its least certain member, and one not opted in is unaffected', () => {
  const answer = run('an opted-in parent is never more certain than its least certain member');
  const floored = of(answer, 'floored'),
    plain = of(answer, 'plain');
  assert.equal(floored.floor, true);
  assert.equal(floored.floored_by, 'y');
  assert.deepEqual(floored.stated, { low: 20, high: 45 });
  assert.equal(plain.floor, false);
  assert.equal(plain.floored_by, null);
  assert.deepEqual(plain.stated, plain.certainty);
});

test('a floor can be named in the options as well as written on the cluster', () => {
  const answer = run('a floor named in the options works as one written on the cluster');
  assert.deepEqual(of(answer, 'plain').stated, of(answer, 'floored').stated);
});

test('a floored parent takes a floored member cluster at its floored certainty', () => {
  const answer = run('a floor over a cluster takes the member cluster at its own floored certainty');
  assert.deepEqual(of(answer, 'inner').stated, { low: 5, high: 20 });
  assert.equal(of(answer, 'top').floored_by, 'inner');
  assert.ok(of(answer, 'top').stated.high <= of(answer, 'inner').stated.high);
});

test('floored clusters inside each other in a cycle still give an answer', () => {
  const answer = run('floored clusters inside each other in a cycle still end');
  assert.equal(answer.clusters.length, 2);
  assert.ok(answer.clusters.every((c) => c.stated !== null));
});
