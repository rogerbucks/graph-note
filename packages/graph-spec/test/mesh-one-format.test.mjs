// One graph format for data, queries and structure (editor spec §27, mesh_one_format). A block holding a graph's
// schema and its inserts is read once. One query engine, the lens rules, answers about its things and its schema
// alike. The cases are in mesh-one-format-cases.json, and python/graph_spec/tests/test_mesh_one_format.py holds the
// Python library to the same answers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const T = JSON.parse(readFileSync(new URL('./mesh-one-format-cases.json', import.meta.url), 'utf8'));

describe('mesh_one_format', () => {
  const store = new C.Store();
  const read = store.apply(T.block.join('\n'));
  const graph = C.worldFromStore(store)[T.graph];

  test('the block is read once, into one graph holding its schema and its data', () => {
    assert.equal(read, T.graph);
    assert.equal(graph.labelled('ElementType').length, 3);
    assert.deepEqual(graph.labelled('Product'), ['widget', 'gadget']);
  });

  for (const c of T.cases)
    test(c.name, () => {
      assert.deepEqual(C.lensBuckets(graph, c.lens), c.buckets);
    });
});
