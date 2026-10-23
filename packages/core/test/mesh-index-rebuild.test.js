// Every derived store rebuilds alike (editor spec §27, mesh_rebuilt_alike). The index, the groups a huge graph opens
// as, the clusters and their centroids are each dropped and built again from the notes' text. Each compares equal to
// the one it replaces, centroid ids included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { MeshIndex, memoryBackend, sqliteBackend } from '../src/mesh-index.ts';
import { readNote } from '../src/drawing.ts';
import { gqlBlocks } from '../src/fences.ts';
import { groupsOf } from '../src/scale-groups.ts';
import { sqlEngine } from './mesh-test-sql.js';

const TEXT = [
  '```gql',
  '// graph: parts',
  "(widget:Product {name: 'Widget'}),",
  "(bolt:Part {name: 'Bolt'}),",
  "(nut:Part {name: 'Nut'}),",
  "(c1:Cluster {name: 'Fixings'}),",
  '(bolt)-[:MEMBER_OF]->(c1),',
  '(nut)-[:MEMBER_OF]->(c1),',
  '(widget)-[:USES]->(bolt),',
  '(widget)-[:USES]->(nut),',
  '(bolt)-[:FITS]->(nut)',
  '```',
].join('\n');

/** Every derived store of the note, each built from its text alone. */
async function derived(text) {
  const reading = readNote(gqlBlocks(text).map((b) => b.text));
  const graph = reading.world['parts'];
  const index = new MeshIndex(sqliteBackend(await sqlEngine()));
  index.update('parts.md', text);
  const memory = new MeshIndex(memoryBackend());
  memory.update('parts.md', text);
  return {
    index: index.dump(),
    memory: memory.dump(),
    groups: JSON.stringify(groupsOf(reading.graphs.get('parts'))),
    clusters: JSON.stringify(gs.clustersOf(graph)),
    centroids: JSON.stringify(gs.centroidsOf(graph).centroids.map((c) => [c.id, c.cluster, c.members, c.weight])),
  };
}

test('each derived store, dropped and built again from the text, equals the one it replaces', async () => {
  const first = await derived(TEXT),
    again = await derived(TEXT);
  for (const store of Object.keys(first)) assert.equal(again[store], first[store], store);
  assert.equal(first.index, first.memory, 'SQLite and memory hold the same rows');
});

test('a centroid keeps its id when it is built again', async () => {
  const ids = (s) => JSON.parse(s.centroids).map(([id]) => id);
  const first = ids(await derived(TEXT));
  assert.ok(first.length > 0);
  assert.deepEqual(ids(await derived(TEXT)), first);
  assert.equal(first[0], gs.centroidId('c1'));
});
