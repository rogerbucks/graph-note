// A note too big to read at once, read in parts (editor spec §53, scale_in_parts; way E, step 7): note-parts.ts.
// Each part is within its share of the read limits, so no reading holds the whole graph. Read in parts, a note gives
// the same graphs as read whole. The local store takes in a note past the read limits this way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gqlBlocks } from '../src/fences.ts';
import { textTooLarge, READ_LIMITS } from '../src/layout-limits.ts';
import { MeshIndex, memoryBackend } from '../src/mesh-index.ts';
import { noteParts, readInParts, readWhole } from '../src/note-parts.ts';
import { readNote } from '../src/drawing.ts';

const SMALL = { bytes: 2000, lines: 40 };

/** 60 people and a team, each linked back. Some have no kind or two kinds. The block's one SET gives some a score. */
function people() {
  const items = [];
  for (let i = 0; i < 60; i++)
    items.push(
      i % 7 === 0
        ? `(t${i} {name: 'Bare ${i}'})`
        : i % 5 === 0
          ? `(t${i}:Person:Admin {name: 'P ${i}', age: ${i}})`
          : `(t${i}:Person {name: 'P ${i}'})`,
    );
  for (let i = 1; i < 60; i++) items.push(`(t${i})-[:KNOWS]->(t${i - 1})`);
  items.push("(c1:Cluster {name: 'Team'})");
  for (let i = 0; i < 10; i++) items.push(`(t${i})-[:MEMBER_OF]->(c1)`);
  items.push("(t3)-[:LIKES {since: 2020}]->(t60:Person {name: 'Fresh'})", '(t59)-[:KNOWS]->(t0)');
  const body = `${items.join(',\n')}\nSET ${[0, 9, 18, 27, 36, 45, 54].map((i) => `t${i}.score = ${i}`).join(', ')}`;
  return [
    '```gql',
    '// graph: people',
    body,
    '```',
    '',
    '```gql',
    '// graph: other',
    "(x:Thing {name: 'X'}),",
    "(y:Thing {name: 'Y'}),",
    '(x)-[:R]->(y)',
    '```',
    '',
  ].join('\n');
}

/** What a reading gives, graph by graph, as plain data to compare. */
const summary = (graphs) =>
  [...graphs].map(([graph, r]) => ({
    graph,
    things: r.drawing.boxes.map((b) => [b.key, b.kind, b.text]),
    links: r.drawing.links.map((l) => [l.from, l.type, l.to]),
    props: [...r.props].sort(([a], [b]) => (a < b ? -1 : 1)),
    lines: r.items.map((i) => [i.line, i.end]),
  }));

test('a note read in parts gives the same graphs as read whole', () => {
  const blocks = gqlBlocks(people());
  assert.deepEqual(readNote(blocks.map((b) => b.text)).problems, [], 'the note reads with no problem');
  assert.ok(noteParts(blocks, SMALL).parts.length > 5, 'it is cut into many parts');
  const parts = readInParts(blocks, SMALL);
  assert.equal(parts.skipped, 0);
  assert.deepEqual(summary(parts.graphs), summary(readWhole(blocks)));
});

test('the huge graph of device check V-10 read in parts is the same as read whole', () => {
  const note = readFileSync(
    new URL('../../../test-vault/Device checks/01 Viewing/V-10 Huge graph shows text.md', import.meta.url),
    'utf8',
  );
  const blocks = gqlBlocks(note);
  const limits = { bytes: 40_000, lines: 800 };
  assert.ok(noteParts(blocks, limits).parts.length > 3);
  assert.deepEqual(summary(readInParts(blocks, limits).graphs), summary(readWhole(blocks)));
});

test('each part, with the blocks every part carries, is within half the read limits', () => {
  const blocks = gqlBlocks(people());
  const cut = noteParts(blocks, SMALL);
  for (const part of cut.parts)
    assert.equal(
      textTooLarge([...cut.context, ...part.map((p) => p.text)], { bytes: SMALL.bytes / 2, lines: SMALL.lines / 2 }),
      null,
    );
});

test('an item too big for any part is left out and counted, and the rest is read', () => {
  const long = `(big:Thing {name: '${'x'.repeat(800)}'})`;
  const text = [
    '```gql',
    '// graph: g',
    "(a:Thing {name: 'A'}),",
    `${long},`,
    "(b:Thing {name: 'B'}),",
    '(a)-[:R]->(b)',
    '```',
  ];
  const read = readInParts(gqlBlocks(text.join('\n')), SMALL);
  assert.equal(read.skipped, 1);
  const g = read.graphs.get('g');
  assert.deepEqual(
    g.drawing.boxes.map((b) => b.key),
    ['a', 'b'],
  );
  assert.deepEqual(
    g.drawing.links.map((l) => [l.from, l.to]),
    [['a', 'b']],
  );
});

test('a note whose schema alone is over a part’s share cannot be put in parts', () => {
  const schema = Array.from({ length: 30 }, (_, i) => `(:Kind${i} {name: STRING})`).join(',\n');
  const text = ['```gql', '// schema: s', schema, '```', '', '```gql', '// graph: g', "(a:Thing {name: 'A'})", '```'];
  assert.equal(readInParts(gqlBlocks(text.join('\n')), SMALL), null);
});

test('the store takes in a note past the read limits, in parts, and gives its groups and pages', () => {
  const lines = [];
  for (let i = 0; i < 12_000; i++) lines.push(`(n${i}:${['Person', 'Place', 'Thing'][i % 3]} {name: 'Item ${i}'})`);
  for (let i = 1; i < 12_000; i++) lines.push(`(n${i})-[:NEAR]->(n${Math.floor(i / 2)})`);
  const text = ['```gql', '// graph: big', lines.join(',\n'), '```', ''].join('\n');
  assert.ok(textTooLarge([lines.join(',\n')]), 'over the read limits');
  assert.equal(readNote([`// graph: big\n${lines.join(',\n')}`]).tooLarge?.limit, 'text-lines', 'refused read whole');
  const ix = new MeshIndex(memoryBackend());
  ix.update('big.md', text);
  const { groups, between } = ix.groups('big.md');
  assert.equal(
    groups.reduce((n, g) => n + g.things, 0),
    12_000,
    'every thing is in a group',
  );
  assert.ok(groups.every((g) => g.things <= 500) && between.length > 0);
  const page = ix.inGroups('big.md', [groups[0].id], { limit: 100 });
  assert.ok(page.things.length > 0 && page.things.length <= 100);
  assert.deepEqual(ix.sourceSpan('big.md', 'big', 'n3'), { line: 6, end: 6 });
  assert.deepEqual(ix.sourceSpan('big.md', 'big', 0), { line: 12_003, end: 12_003 });
  assert.equal(ix.find('big.md', { name: 'Item 11999' })[0]?.key, 'n11999');
  assert.ok(READ_LIMITS.lines < 24_000);
});
