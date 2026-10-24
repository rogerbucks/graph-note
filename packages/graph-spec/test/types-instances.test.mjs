// Lasting types and their instances (editor spec §27, type_instance_split and instance_inherits_type):
// types-instances.js. An instance links to its type, asked about in general or one at a time. It inherits every
// property of its type unless it sets its own, and its own value changes neither the type nor another instance. The
// cases are in types-instances-cases.json, and python/graph_spec/tests/test_types_instances.py holds the Python
// library to the same answers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const T = JSON.parse(readFileSync(new URL('./types-instances-cases.json', import.meta.url), 'utf8'));

/** The world the blocks make, read into one store; `edit` changes a block's lines first. */
function worldOf(edit = (lines) => lines) {
  const store = new C.Store();
  for (const lines of T.blocks) store.apply(edit(lines).join('\n'));
  return C.worldFromStore(store);
}

describe('type_instance_split and instance_inherits_type', () => {
  const world = worldOf();
  for (const c of T.cases)
    test(c.name, () => {
      assert.deepEqual(C[c.ask](world, c.graph, c.key), c.answer);
    });

  test('an instance replaced leaves its type, and the other instances, as they were', () => {
    const replaced = worldOf((lines) =>
      lines.map((l) =>
        l.replace(
          "(bens_reader:Item {serial: 'B2', weight: 180, power: 'battery'})",
          "(bens_reader:Item {serial: 'B9', weight: 150})",
        ),
      ),
    );
    assert.deepEqual(C.inherited(replaced, 'models', 'e_reader'), C.inherited(world, 'models', 'e_reader'));
    assert.deepEqual(C.inherited(replaced, 'desks', 'anns_reader'), C.inherited(world, 'desks', 'anns_reader'));
    assert.equal(C.inherited(replaced, 'desks', 'bens_reader').props.weight, 150);
  });

  test('a type that is, in the end, its own type is read once, never round and round', () => {
    const store = new C.Store();
    store.apply(
      [
        '// graph: loop',
        '(a:Kind {x: 1}),',
        '(b:Kind {y: 2}),',
        '(a)-[:INSTANCE_OF]->(b),',
        '(b)-[:INSTANCE_OF]->(a)',
      ].join('\n'),
    );
    assert.deepEqual(C.inherited(C.worldFromStore(store), 'loop', 'a').props, { id: 'a', x: 1, y: 2 });
  });
});
