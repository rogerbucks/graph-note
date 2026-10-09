// Reading a block as far as it can be read (spec §3) never holds the page (spec §9, layout_contained): each part that
// cannot be read is left out without re-slicing the block from its start to find its line, and once the reading has gone
// over its budget, the rest of a broken block is left out at once rather than retried part by part.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { lineAt, lineIndex } from '../src/block-items.ts';

/** A block of `n` things, each written with its colon missing, so each is a part that cannot be read. */
const broken = (n) =>
  `// graph: g\n(ok:Thing {name: 'Readable'}),\n${Array.from({ length: n }, (_, i) => `(n${i}:Thing {name 'Thing ${i}'}),`).join('\n')}`;

describe('the line of a character, from an index of the lines', () => {
  test('is the line lineAt gives, for every character, line break and end', () => {
    for (const text of ['', 'one', 'a\nb', '\n\nx\n', 'first\nsecond line\n\nfourth', 'é😀\nx']) {
      const at = lineIndex(text);
      for (let pos = 0; pos <= text.length + 1; pos++)
        assert.equal(at(pos), lineAt(text, pos), `${JSON.stringify(text)} @${pos}`);
    }
  });
});

describe('a broken block is read in time, never holding the page', () => {
  test('1,600 broken parts are read in under 2 seconds (it took nearly a minute when each re-sliced the block)', () => {
    const t = performance.now();
    const reading = readNote([broken(1600)]);
    const ms = performance.now() - t;
    assert.ok(ms < 2000, `${ms.toFixed(0)} ms`);
    assert.ok(
      reading.graphs.get('g').boxes.some((b) => b.key === 'ok'),
      'what can be read is still drawn',
    );
  });

  test('10,000 broken lines, under the size limits, are read in under 3 seconds: past the budget, the rest is left out at once', () => {
    const t = performance.now();
    const reading = readNote([broken(9_000)]);
    const ms = performance.now() - t;
    assert.ok(ms < 3000, `${ms.toFixed(0)} ms`);
    assert.ok(
      reading.graphs.get('g').boxes.some((b) => b.key === 'ok'),
      'what was read before is still drawn',
    );
    const rest = reading.problems.find((p) => /left out from this line on/.test(p.message));
    assert.ok(rest, 'one problem says the rest of the block is left out');
  });

  test('a small broken note is read part by part, as before: no part is left out wholesale', () => {
    const reading = readNote([broken(40)]);
    assert.ok(
      reading.problems.some((p) => p.severity === 'error' && p.line === 3),
      'the first part left out, alone',
    );
    assert.equal(
      reading.problems.some((p) => /left out from this line on/.test(p.message)),
      false,
    );
  });
});
