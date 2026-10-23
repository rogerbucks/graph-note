// The limits looked at again (editor spec §53, scale_limits_revisited). Way E's step 6 raised the read limit. The
// design note names each limit with its value before and after. A hostile graph past a new limit is still refused,
// unread, with the limit it is over.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../packages/core/src/drawing.ts';
import { LAYOUT_LIMITS, READ_LIMITS } from '../packages/core/src/layout-limits.ts';
import { LIMITS } from '../packages/graph-spec/src/reader/limits.js';
import { grown, hugeBlock } from '../scripts/scale-benchmark.mjs';
import { read } from './repository/repo.js';

/** The design note's table of the limits: each row's cells, by the limit's name. */
function limitsTable() {
  const note = read('wiki/Massive-graphs-design.md');
  const at = note.indexOf('### The limits, before and after');
  assert.ok(at >= 0, 'the note has a section on the limits');
  const rows = note
    .slice(at)
    .split('\n')
    .filter((l) => l.startsWith('| ') && !l.startsWith('| Limit'));
  const cells = (l) =>
    l
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
  return Object.fromEntries(rows.map(cells).map((c) => [c[0], c]));
}

const n = (x) => x.toLocaleString('en-GB');

test('the note names each read limit and the drawing limit, with its value before and after', () => {
  const rows = limitsTable();
  assert.deepEqual(rows['Read limit, text'].slice(1, 3), ['512 kB', `${READ_LIMITS.bytes / 1_000_000} MB`]);
  assert.deepEqual(rows['Read limit, lines'].slice(1, 3), ['10,000 lines', `${n(READ_LIMITS.lines)} lines`]);
  assert.deepEqual(rows['Drawing limit, things'].slice(1, 3), ['2,000 things', `${n(LAYOUT_LIMITS.things)} things`]);
  assert.deepEqual(rows['Drawing limit, links'].slice(1, 3), ['5,000 links', `${n(LAYOUT_LIMITS.links)} links`]);
  const block = `${n(LIMITS.block_chars)} characters`;
  assert.deepEqual(rows['Library block limit'].slice(1, 3), [block, block]);
});

test('the raised read limit is still within what the library reads in one block', () => {
  assert.ok(READ_LIMITS.bytes <= LIMITS.block_chars);
});

test('two copies of the V-10 graph are read now, past the old limit', () => {
  const text = grown(hugeBlock(), 2);
  assert.ok(Buffer.byteLength(text) > 512_000, 'over the old limit');
  const r = readNote([text]);
  assert.equal(r.tooLarge, undefined);
  assert.ok([...r.graphs.values()][0].boxes.length > LAYOUT_LIMITS.things);
});

test('a hostile graph past the new limits is still refused unread, saying which limit it is over', () => {
  const line = (i) => `(n${i}:Thing {name: 'Thing number ${i} of many'},`;
  const big = `// graph: g\n${Array.from({ length: 21_000 }, (_, i) => line(i)).join('\n')}`;
  const bytes = readNote([big]);
  assert.equal(bytes.graphs.size, 0);
  assert.deepEqual(
    { reason: bytes.tooLarge.reason, limit: bytes.tooLarge.limit, most: bytes.tooLarge.most },
    { reason: 'too-large', limit: 'text-bytes', most: READ_LIMITS.bytes },
  );
  const tall = `// graph: g\n${'(a)\n'.repeat(READ_LIMITS.lines + 10)}`;
  const lines = readNote([tall]);
  assert.equal(lines.graphs.size, 0);
  assert.deepEqual(
    { reason: lines.tooLarge.reason, limit: lines.tooLarge.limit, most: lines.tooLarge.most },
    { reason: 'too-large', limit: 'text-lines', most: READ_LIMITS.lines },
  );
});
