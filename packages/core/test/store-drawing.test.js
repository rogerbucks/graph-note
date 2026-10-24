// A note too big to read at once, opened from the local store (editor spec §53, scale_in_parts; way E, step 7):
// store-drawing.ts. The store gives each graph back as the overview draws it, the same as a whole reading gives. A
// huge note is read a part at a time with the page's turn between parts. Rows built from other text are never drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { MeshIndex, memoryBackend, sqliteBackend } from '../src/mesh-index.ts';
import { storedGraphs, storedStyle } from '../src/store-drawing.ts';
import { savedFilterFor } from '../src/filter-saved.ts';
import { emptyStyle } from '../src/style-graph.ts';
import { sqlEngine } from './mesh-test-sql.js';

const now = () => Promise.resolve();
const SHOP = [
  '```gql',
  '// schema: shop',
  "(:Product {name: STRING})-[:USES {reading: 'is made with'}]->(:Part {name: STRING})",
  '```',
  '',
  '```gql',
  '// graph: shop · schema shop',
  "(widget:Product {name: 'Widget', price: 10}),",
  "(bolt:Part {name: 'Bolt'}),",
  '(widget)-[:USES]->(bolt)',
  '```',
  '',
].join('\n');

/** A drawing's things and links, as plain data to compare. */
const plain = (d) => ({
  boxes: d.boxes.map((b) => [b.key, b.kind, b.text]),
  links: d.links.map((l) => [l.from, l.type, l.reading, l.to]),
});

test('a graph from the store is drawn as a whole reading draws it, from either backend', async () => {
  const blocks = SHOP.split('```')
    .filter((_, i) => i % 2 === 1)
    .map((b) => b.replace(/^gql\n/, ''));
  const whole = readNote(blocks).graphs.get('shop');
  for (const backend of [memoryBackend(), sqliteBackend(await sqlEngine())]) {
    const shop = (await storedGraphs(new MeshIndex(backend), 'shop.md', SHOP, now)).get('shop');
    assert.deepEqual(plain(shop.drawing), plain(whole), backend.kind);
    assert.deepEqual(shop.props('widget'), { id: 'widget', name: 'Widget', price: 10 });
  }
});

test('a huge note is read a part at a time, with the page’s turn between parts', async () => {
  const lines = ['// graph: big'];
  for (let i = 0; i < 12_000; i++) lines.push(`(n${i}:Thing {name: 'Item ${i}'}),`);
  for (let i = 1; i < 12_000; i++) lines.push(`(n${i})-[:NEAR]->(n${i - 1})${i < 11_999 ? ',' : ''}`);
  const text = ['```gql', ...lines, '```', ''].join('\n');
  let turns = 0;
  const big = (await storedGraphs(new MeshIndex(memoryBackend()), 'big.md', text, async () => void turns++)).get('big');
  assert.ok(turns >= 3, `${turns} turns`);
  assert.equal(big.drawing.boxes.length, 12_000);
  assert.equal(big.drawing.links.length, 11_999);
});

test('rows built from other text than the note has now are never drawn', async () => {
  const ix = new MeshIndex(memoryBackend());
  await storedGraphs(ix, 'shop.md', SHOP, now);
  const changed = SHOP.replace("'Bolt'", "'Bolt and nut'");
  ix.backend.put = () => {}; // the store keeps its old rows, as when the note changed while it was read
  assert.equal((await storedGraphs(ix, 'shop.md', changed, now)).size, 0);
});

test('the same text is not read again: the store keeps a note until its text changes', async () => {
  const ix = new MeshIndex(memoryBackend());
  await storedGraphs(ix, 'shop.md', SHOP, now);
  let put = 0;
  const real = ix.backend.put.bind(ix.backend);
  ix.backend.put = (rows) => {
    put++;
    real(rows);
  };
  assert.equal((await storedGraphs(ix, 'shop.md', SHOP, now)).size, 1);
  assert.equal(put, 0, 'not read again');
  await storedGraphs(ix, 'shop.md', SHOP.replace("'Bolt'", "'Bolt and nut'"), now);
  assert.equal(put, 1, 'read again once changed');
});

test('a huge note’s saved filter is read from its style block, checked against the graph in the store', async () => {
  const style = [
    '```gql',
    '// graph: shop_style · STYLE shop',
    "(f1:Filter {keep: 'Kind: Part, Prt'})",
    '```',
    '',
  ].join('\n');
  const text = SHOP + style;
  const shop = (await storedGraphs(new MeshIndex(memoryBackend()), 'shop.md', text, now)).get('shop');
  const read = storedStyle(text, shop);
  assert.deepEqual(savedFilterFor(read.style.filters), { Kind: ['Part'] });
  assert.deepEqual(
    read.problems.map((p) => p.message),
    ['Prt is not a kind in graph shop'],
    'a kind the graph lacks, found from the store',
  );
});

test('a huge note with no style block for its graph never builds the graph for the style checks', async () => {
  const shop = (await storedGraphs(new MeshIndex(memoryBackend()), 'shop.md', SHOP, now)).get('shop');
  const read = storedStyle(SHOP, {
    ...shop,
    world: () => assert.fail('the graph was built, with no style to check'),
  });
  assert.deepEqual(read, { style: emptyStyle(), problems: [] });
});
