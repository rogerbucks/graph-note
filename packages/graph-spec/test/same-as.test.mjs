// Which things in different graphs are one (editor spec §27, same_as_across_graphs; risk ARCH-6): same-as.js. Inside
// a graph the name is the id. Across graphs, only a written SAME_AS link joins two things, and the same name with no
// link stays a guess. The cases are in same-as-cases.json, and python/graph_spec/tests/test_same_as.py holds the
// Python library to the same answers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./same-as-cases.json', import.meta.url), 'utf8'));

/** The world the blocks make, read into one store. */
function worldOf(blocks) {
  const store = new C.Store();
  for (const lines of blocks) store.apply(lines.join('\n'));
  return C.worldFromStore(store);
}

describe('same_as_across_graphs', () => {
  for (const c of cases)
    test(c.name, () => {
      assert.deepEqual(C.sameAs(worldOf(c.blocks)), c.answer);
    });

  test('a link changes neither graph: each keeps its own things under its own names', () => {
    const world = worldOf(cases[0].blocks);
    C.sameAs(world);
    assert.deepEqual([...world.catalog.nodes.keys()], ['widget_12']);
    assert.deepEqual([...world.shop.nodes.keys()], ['widget', 'catalog_widget']);
  });
});
