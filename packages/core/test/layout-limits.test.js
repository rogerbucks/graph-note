// How large a graph may be before it is shown as text (spec §9, layout_contained): the note's own text is measured before
// it is read, so no block, however large or broken, holds the page while it is read; and on the page's own thread, where
// a layout cannot be stopped, the limits are tighter.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { LAYOUT_LIMITS, PAGE_LIMITS, READ_LIMITS, textTooLarge, tooLarge } from '../src/layout-limits.ts';

describe('the note’s text, measured before it is read', () => {
  test('the defaults: 512 kB and 10,000 lines of graph blocks', () => {
    assert.deepEqual(READ_LIMITS, { bytes: 512_000, lines: 10_000 });
  });

  test('over the bytes, the refusal names the limit and the numbers', () => {
    assert.deepEqual(textTooLarge(['// graph: g\n', 'é'.repeat(300_000)]), {
      reason: 'too-large',
      limit: 'text-bytes',
      count: 600_012,
      most: 512_000,
    });
  });

  test('over the lines, the same, in lines', () => {
    assert.deepEqual(textTooLarge(['// graph: g\n' + '(a),\n'.repeat(10_000)]), {
      reason: 'too-large',
      limit: 'text-lines',
      count: 10_002,
      most: 10_000,
    });
  });

  test('under both, nothing is refused', () => {
    assert.equal(textTooLarge(["// graph: g\n(a:A {name: 'a'})"]), null);
  });

  test('a large broken block — 5 MB, 100,000 lines each missing its ) — is refused at once, unread, never hanging', () => {
    const block = `// graph: g\n${Array.from({ length: 100_000 }, (_, i) => `(n${i}:Thing {name: 'Thing number ${i} of many'},`).join('\n')}`;
    assert.ok(block.length > 4_000_000);
    const t = performance.now();
    const reading = readNote([block]);
    const ms = performance.now() - t;
    assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
    assert.equal(reading.tooLarge?.limit, 'text-bytes');
    assert.equal(reading.graphs.size, 0, 'nothing drawn');
    assert.deepEqual(reading.problems, []);
  });

  test('a note under the limits is read as before, with no refusal', () => {
    const reading = readNote(["// graph: g\n(a:A {name: 'a'})"]);
    assert.equal(reading.tooLarge, undefined);
    assert.equal(reading.graphs.get('g').boxes.length, 1);
  });
});

describe('on the page’s own thread, where a layout cannot be stopped, the limits are tighter', () => {
  const box = (i, text = `Thing ${i}`) => ({ key: `n${i}`, kind: 'Thing', text });
  const drawing = (boxes, links = []) => ({ graph: 'g', boxes, links, estimates: [] });

  test('the page limits: 300 things, 750 links, 100 kB of drawing instructions, words of 1,000 characters', () => {
    assert.equal(PAGE_LIMITS.things, 300);
    assert.equal(PAGE_LIMITS.links, 750);
    assert.equal(PAGE_LIMITS.sourceBytes, 100_000);
    assert.equal(PAGE_LIMITS.word, 1_000);
    assert.ok(LAYOUT_LIMITS.word >= LAYOUT_LIMITS.sourceBytes, 'in a worker, the time limit stops a long word');
  });

  test('a word of 999,000 characters, which would hold the page while its drawing instructions are written, is refused unwritten', () => {
    const d = drawing([box(0, 'x'.repeat(999_000)), box(1)]);
    const t = performance.now();
    const r = tooLarge(d, PAGE_LIMITS);
    assert.ok(performance.now() - t < 200, 'at once');
    assert.deepEqual(r, { reason: 'too-large', limit: 'word', count: 999_000, most: 1_000 });
  });

  test('a graph under the worker’s limits but over the page’s is refused there', () => {
    const d = drawing(Array.from({ length: 301 }, (_, i) => box(i)));
    assert.equal(tooLarge(d, LAYOUT_LIMITS), null);
    assert.deepEqual(tooLarge(d, PAGE_LIMITS), { reason: 'too-large', limit: 'things', count: 301, most: 300 });
  });
});
