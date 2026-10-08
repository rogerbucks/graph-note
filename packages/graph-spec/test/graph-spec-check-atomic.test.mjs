// A block is applied whole or not at all (decided with Roger, 8 Oct 2026, with drawing in part): checking and loading
// stay all-or-nothing, so a block that cannot be read leaves the store as it was, however far its reading got. The
// Python reader answers the same: python/graph_spec/tests/test_gql_profile_drawn.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const gs = createRequire(import.meta.url)('../src/graph-spec-check.js');

test('a block refused late leaves the store as it was: no thing, link, comma or bare type of it kept', () => {
  const store = new gs.Store();
  store.apply("// graph: trip\n(home:Place {name: 'Home'}),\n(walk:Leg {name: 'Walk'}),\n(walk)-[:STARTS_AT]->(home)");
  const before = JSON.stringify([...store.graph('trip').nodes.entries()]) + JSON.stringify(store.graph('trip').edges);
  const late = "// graph: trip\n(bus:Leg {name: 'Bus'})\n(bus)-[starts_at]->(home),\n(bus)-[:GOES]->(nowhere)";
  assert.throws(() => store.apply(late), gs.ProfileError);
  const after = JSON.stringify([...store.graph('trip').nodes.entries()]) + JSON.stringify(store.graph('trip').edges);
  assert.equal(after, before);
  assert.deepEqual([store.commas, store.bares], [[], []]);
  store.apply("// graph: trip\n(bus:Leg {name: 'Bus'})");
  assert.equal(store.graph('trip').nodes.size, 3, 'and the store reads on as before');
});
