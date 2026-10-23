// The local store of the graph mesh (editor spec §27, mesh_index_rebuilds; Q-05): mesh-index.ts. The notes are read
// into an index kept in memory or in SQLite (sql.js, in the process). Both answer each read alike. An index built
// again from scratch answers as the one it replaces, and a changed note is read again on its own. The reads are the
// ones a huge graph is drawn from in parts (scale_in_parts): groups, things in groups, source lines, version and find.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MeshIndex, memoryBackend, sqliteBackend, noteRows } from '../src/mesh-index.ts';
import { sha256 } from '../src/ai-digest.ts';
import { sqlEngine } from './mesh-test-sql.js';

const note = (body) => ['# Parts', '', '```gql', ...body, '```', ''].join('\n');
const SHOP = note([
  '// graph: shop',
  "(widget:Product {name: 'Widget', price: 10}),",
  "(bolt:Part {name: 'Bolt'}),",
  "(nut:Part {name: 'Nut'}),",
  "(acme:Maker {name: 'Acme'}),",
  '(widget)-[:USES]->(bolt),',
  '(widget)-[:USES]->(nut),',
  '(widget)-[:MADE_BY]->(acme)',
]);
const OTHER = note(['// graph: other', "(a:Thing {name: 'A'}),", "(b:Thing {name: 'B'}),", '(a)-[:LINKS]->(b)']);

/** Both backends, each holding the same two notes. */
async function both() {
  const sqlite = new MeshIndex(sqliteBackend(await sqlEngine())),
    memory = new MeshIndex(memoryBackend());
  for (const ix of [sqlite, memory]) {
    ix.update('shop.md', SHOP);
    ix.update('other.md', OTHER);
  }
  return { sqlite, memory };
}

describe('mesh_index_rebuilds', () => {
  test('SQLite and memory answer every read alike', async () => {
    const { sqlite, memory } = await both();
    assert.equal(sqlite.dump(), memory.dump());
    const groups = sqlite.groups('shop.md');
    assert.deepEqual(groups, memory.groups('shop.md'));
    const ids = groups.groups.map((g) => g.id);
    assert.deepEqual(sqlite.inGroups('shop.md', ids), memory.inGroups('shop.md', ids));
    assert.deepEqual(sqlite.find('shop.md', { name: 'Bolt' }), memory.find('shop.md', { name: 'Bolt' }));
  });

  test('an index built again from scratch answers as the one it replaces, on either backend', async () => {
    const { sqlite, memory } = await both();
    for (const ix of [sqlite, memory]) {
      const before = ix.dump();
      ix.rebuild({ 'shop.md': SHOP, 'other.md': OTHER });
      assert.equal(ix.dump(), before, ix.backend.kind);
    }
  });

  test('moving to another backend is a rebuild from the text', async () => {
    const { memory } = await both();
    const moved = new MeshIndex(sqliteBackend(await sqlEngine()));
    moved.rebuild({ 'shop.md': SHOP, 'other.md': OTHER });
    assert.equal(moved.dump(), memory.dump());
  });

  test('a changed note is read again on its own, and gives what a rebuild gives', async () => {
    const { sqlite } = await both();
    const changed = SHOP.replace("(nut:Part {name: 'Nut'}),", "(nut:Part {name: 'Nut', size: 'M6'}),");
    sqlite.update('shop.md', changed);
    assert.equal(sqlite.version('shop.md'), sha256(changed));
    assert.equal(sqlite.version('other.md'), sha256(OTHER));
    const fresh = new MeshIndex(memoryBackend());
    fresh.rebuild({ 'shop.md': changed, 'other.md': OTHER });
    assert.equal(sqlite.dump(), fresh.dump());
    sqlite.remove('other.md');
    assert.equal(sqlite.version('other.md'), null);
  });
});

describe('the reads a huge graph is drawn in parts from (scale_in_parts)', () => {
  test('groups count their things and links, and the links between them', async () => {
    const { sqlite } = await both();
    const { groups, between } = sqlite.groups('shop.md');
    assert.equal(
      groups.reduce((n, g) => n + g.things, 0),
      4,
    );
    const inside = groups.reduce((n, g) => n + g.links, 0),
      across = between.reduce((n, b) => n + b.links, 0);
    assert.equal(inside + across, 3);
  });

  test('things in some groups come a page at a time, with the links leaving them as stubs', async () => {
    const { sqlite } = await both();
    const { groups } = sqlite.groups('shop.md');
    const first = groups[0];
    const part = sqlite.inGroups('shop.md', [first.id]);
    assert.ok(part.things.every((t) => t.group === first.id));
    for (const s of part.stubs) assert.notEqual(s.toGroup, first.id);
    const all = sqlite.inGroups(
      'shop.md',
      groups.map((g) => g.id),
      { limit: 2 },
    );
    assert.equal(all.things.length, 2);
    const next = sqlite.inGroups(
      'shop.md',
      groups.map((g) => g.id),
      { limit: 2, after: all.things[1].key },
    );
    assert.deepEqual([...all.things, ...next.things].map((t) => t.key).sort(), ['acme', 'bolt', 'nut', 'widget']);
  });

  test('a thing and a link give the note lines they were read from', async () => {
    const { sqlite } = await both();
    // the note's lines: 1 '# Parts', 2 '', 3 the fence, 4 the graph line, 5 widget … 9 the first USES
    assert.deepEqual(sqlite.sourceSpan('shop.md', 'shop', 'widget'), { line: 5, end: 5 });
    assert.deepEqual(sqlite.sourceSpan('shop.md', 'shop', 'nut'), { line: 7, end: 7 });
    assert.deepEqual(sqlite.sourceSpan('shop.md', 'shop', 1), { line: 10, end: 10 });
  });

  test('find gives things by name or by a value, each with its group', async () => {
    const { sqlite } = await both();
    const [bolt] = sqlite.find('shop.md', { name: 'Bolt' });
    assert.equal(bolt.key, 'bolt');
    assert.ok(bolt.group);
    assert.deepEqual(
      sqlite.find('shop.md', { property: 'price', value: 10 }).map((f) => f.key),
      ['widget'],
    );
  });

  test('a note the index has not read has no version, so a reader can tell its rows are stale', async () => {
    const { memory } = await both();
    assert.equal(memory.version('missing.md'), null);
    assert.notEqual(memory.version('shop.md'), sha256(SHOP + ' '));
  });

  test('a thing keeps every property written for it', () => {
    const rows = noteRows('shop.md', SHOP);
    assert.deepEqual(JSON.parse(rows.things.find((t) => t.key === 'widget').props), {
      id: 'widget',
      name: 'Widget',
      price: 10,
    });
  });
});
