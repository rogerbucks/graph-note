// A graph too big to read at once, opened and edited in parts (editor spec §53, scale_in_parts; way E, step 7):
// store-drawing.ts. An edit goes to the note's text first, only on the lines that wrote the thing. The store then reads
// the changed note again. A store read from other text refuses the edit, so it never lands on the wrong lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setProperty } from '../src/inspector.ts';
import { MeshIndex, memoryBackend } from '../src/mesh-index.ts';
import { editInParts, storedGraphs } from '../src/store-drawing.ts';
import { READ_LIMITS } from '../src/layout-limits.ts';

const now = () => Promise.resolve();

/** A note of 12,000 things and their links: 24,000 lines, past the read limit. */
function huge() {
  const lines = ['# Big', '', '```gql', '// graph: big'];
  for (let i = 0; i < 12_000; i++) lines.push(`(n${i}:Thing {name: 'Item ${i}'}),`);
  for (let i = 1; i < 12_000; i++) lines.push(`(n${i})-[:NEAR]->(n${i - 1})${i < 11_999 ? ',' : ''}`);
  return [...lines, '```', ''].join('\n');
}

const price = (gql) => (lines) => setProperty(lines, 'big', { thing: 'n7000' }, 'price', gql);

test('a graph past the read limits opens, is edited in its text first, and is read again from that text', async () => {
  const text = huge();
  assert.ok(text.split('\n').length > READ_LIMITS.lines);
  const ix = new MeshIndex(memoryBackend());
  await storedGraphs(ix, 'big.md', text, now);
  const edit = editInParts(ix, 'big.md', text, 'big', 'n7000', price('12'));
  assert.ok(edit.ok, edit.reason);
  const was = text.split('\n'),
    edited = edit.text.split('\n');
  assert.equal(edited.length, was.length);
  assert.deepEqual(
    edited.flatMap((l, i) => (l === was[i] ? [] : [l])),
    ["(n7000:Thing {name: 'Item 7000', price: 12}),"],
    'only the line that wrote the thing',
  );
  const before = (await storedGraphs(ix, 'big.md', text, now)).get('big');
  assert.equal(before.props('n7000').price, undefined, 'the store is not written to before the text');
  const after = (await storedGraphs(ix, 'big.md', edit.text, now)).get('big');
  assert.equal(after.props('n7000').price, 12, 'read again from the new text');
  assert.equal(after.drawing.boxes.length, 12_000);
});

test('a store read from other text refuses the edit, so it never lands on the wrong lines', async () => {
  const text = huge();
  const ix = new MeshIndex(memoryBackend());
  await storedGraphs(ix, 'big.md', text, now);
  const moved = text.replace('# Big', '# Big\n\nA line more.');
  assert.match(editInParts(ix, 'big.md', moved, 'big', 'n7000', price('12')).reason, /changed since/);
  assert.match(editInParts(ix, 'big.md', text, 'big', 'nobody', price('12')).reason, /nobody is not in graph big/);
});
