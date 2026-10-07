// A type is declared only when the graph's GraphMeta DECLARES it (graph spec model §5: "One ElementType node per node
// label, edge type and cached property, linked from the GraphMeta by DECLARES"). An ElementType nothing declares types
// nothing, so a schema written without its DECLARES links does not pass §5. The Python library answers the same: see
// python/graph_spec/tests/test_graph_rules_declares.py and the shared case in cases.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const gs = createRequire(import.meta.url)('../src/graph-spec-check.js');
const lines = (...xs) => xs.join('\n');

const DATA = lines('// graph: g', "(a:Book {title: 'A'}),", "(p:Person {name: 'P'}),", '(p)-[:WROTE]->(a)');
const schema = (declares) =>
  lines(
    '// graph: g',
    "(g_schema:GraphMeta {graph: 'g', schema: 'g@1'}),",
    "(kind_book:Meta:ElementType {name: 'Book', kind: 'node', origin: 'source'}),",
    "(kind_person:Meta:ElementType {name: 'Person', kind: 'node', origin: 'source'}),",
    "(link_wrote:Meta:ElementType {name: 'WROTE', kind: 'edge', origin: 'source', reading: 'wrote', reverse_name: 'was written by'})",
    ...declares.map((d) => `, (g_schema)-[:DECLARES]->(${d})`),
  );
const section5 = (blocks) => {
  const w = gs.worldFromStore(gs.read(blocks));
  return gs.check(w, 'g').find(([label]) => label.startsWith('§5'))[1];
};
const untyped = (blocks) => gs.untyped(gs.worldFromStore(gs.read(blocks)).g);

test('a schema whose GraphMeta declares each type passes §5', () => {
  assert.equal(section5([DATA, schema(['kind_book', 'kind_person', 'link_wrote'])]), true);
});

test('a schema written without its DECLARES links does not: nothing is declared', () => {
  assert.equal(section5([DATA, schema([])]), false);
  assert.deepEqual(untyped([DATA, schema([])]).slice(0, 2), [['Book', 'Person'], ['WROTE']]);
});

test('a type the GraphMeta does not declare is undeclared, and only that one', () => {
  assert.equal(section5([DATA, schema(['kind_book', 'link_wrote'])]), false);
  assert.deepEqual(untyped([DATA, schema(['kind_book', 'link_wrote'])]).slice(0, 2), [['Person'], []]);
});

test('a DECLARES link from anything but a GraphMeta declares nothing', () => {
  const stray = schema(['kind_book', 'link_wrote']) + ',\n(p)-[:DECLARES]->(kind_person)';
  assert.deepEqual(untyped([DATA, stray]).slice(0, 2), [['Person'], []]);
});
