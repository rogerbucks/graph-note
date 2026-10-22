// Clusters inside each other in a cycle (editor spec §31, wiki/Clusters-design.md step 5). A cycle is written with no
// refusal, at any depth. It is flagged, and a view hides or highlights it. Python's twin must give the same answers on
// the shared cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const gs = require('../src/graph-spec-check.js');
const { clusterCycles, cycleView, Graph } = gs;
const { cases } = JSON.parse(readFileSync(new URL('./cycle-cases.json', import.meta.url), 'utf8'));

/** The plain graph of a shared case. */
const graphOf = (c) =>
  new Graph(
    new Map(c.nodes.map(([id, labels]) => [id, [new Set(labels), { id }]])),
    c.edges.map(([a, t, b]) => [a, t, b, {}]),
  );

for (const c of cases)
  test(`the shared case "${c.name}" gives its recorded cycles`, () => {
    const g = graphOf(c);
    assert.deepEqual(clusterCycles(g), c.expected.cycles);
    assert.deepEqual(cycleView(g, 'hide'), c.expected.hide);
    assert.deepEqual(cycleView(g, 'highlight'), c.expected.highlight);
  });

test('a block that writes a cycle is read with no refusal, and the cycle is flagged', () => {
  const block = [
    '// graph: g',
    "(a:Cluster {name: 'A'}),",
    "(b:Cluster {name: 'B'}),",
    "(x:Thing {name: 'X'}),",
    '(a)-[:MEMBER_OF]->(b),',
    '(b)-[:MEMBER_OF]->(a),',
    '(x)-[:MEMBER_OF]->(a)',
  ].join('\n');
  const g = gs.worldFromStore(gs.read([block])).g;
  assert.deepEqual(clusterCycles(g), [['a', 'b']]);
  assert.deepEqual(cycleView(g, 'hide').shown, ['x']);
  assert.deepEqual(cycleView(g, 'highlight').highlighted, ['a', 'b']);
});

test('a view shows cycles only by hiding or highlighting them', () => {
  assert.throws(() => cycleView(graphOf(cases[0]), 'refuse'), /hide, highlight/);
});
