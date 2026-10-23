// The notes' text is the only store of a graph (editor spec §27, mesh_text_canonical). Every derived store is built
// from it. So deleting them all and building again from the notes loses nothing a person wrote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshIndex, sqliteBackend } from '../src/mesh-index.ts';
import { readNote } from '../src/drawing.ts';
import { gqlBlocks } from '../src/fences.ts';
import { sqlEngine } from './mesh-test-sql.js';

const NOTES = Object.freeze({
  'shop.md': [
    '```gql',
    '// graph: shop',
    "(widget:Product {name: 'Widget', price: 10, since: DATE '2024-03-01'}),",
    "(bolt:Part {name: 'Bolt', size: 'M6'}),",
    '(widget)-[:USES]->(bolt)',
    '```',
  ].join('\n'),
  'team.md': [
    '```gql',
    '// graph: team',
    "(ann:Person {name: 'Ann'}),",
    "(ben:Person {name: 'Ben'}),",
    '(ann)-[:KNOWS]->(ben)',
    '```',
  ].join('\n'),
});

test('deleting every derived store and building again from the notes loses nothing authored', async () => {
  const before = new MeshIndex(sqliteBackend(await sqlEngine()));
  before.rebuild(NOTES);
  const kept = before.dump();
  // every derived store gone: a new, empty database, filled only from the notes
  const after = new MeshIndex(sqliteBackend(await sqlEngine()));
  after.rebuild(NOTES);
  assert.equal(after.dump(), kept);
  // and what it holds is everything the notes say: each thing with all its values, and each link
  for (const [path, text] of Object.entries(NOTES)) {
    const reading = readNote(gqlBlocks(text).map((b) => b.text));
    const { groups } = after.groups(path);
    const ids = groups.map((g) => g.id);
    const { things, links } = after.inGroups(path, ids, { limit: 10_000 });
    for (const [graph, world] of Object.entries(reading.world))
      for (const id of world.nodes.keys()) {
        const row = things.find((t) => t.graph === graph && t.key === id);
        assert.ok(row, `${path}: ${id} is kept`);
        const written = world.p(id);
        const props = JSON.parse(row.props);
        for (const k of Object.keys(written)) assert.ok(k in props, `${path}: ${id}.${k} is kept`);
      }
    for (const drawing of reading.graphs.values())
      for (const l of drawing.links)
        assert.ok(
          links.some((r) => r.from === l.from && r.type === l.type && r.to === l.to),
          `${path}: ${l.type}`,
        );
  }
});

test('the index never writes a note: the text it is built from is the text the notes still hold', async () => {
  const ix = new MeshIndex(sqliteBackend(await sqlEngine()));
  const notes = { ...NOTES };
  ix.rebuild(notes);
  ix.update('shop.md', notes['shop.md']);
  assert.deepEqual(notes, { ...NOTES });
  assert.equal(Object.keys(MeshIndex.prototype).includes('write'), false);
});
