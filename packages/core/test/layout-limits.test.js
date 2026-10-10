// How large a graph may be before it is shown as text (spec §9, layout_contained): the note's own text is measured before
// it is read, so no block, however large or broken, holds the page while it is read; and on the page's own thread, where
// a layout cannot be stopped, the limits are tighter.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { LAYOUT_LIMITS, PAGE_LIMITS, READ_LIMITS, textTooLarge, tooLarge } from '../src/layout-limits.ts';
import { fastest, onePass } from './processor-time.js';

/**
 * Asserts a refusal that only measures a text came at once: in under 10 plain passes over the text (it takes 1 to 3),
 * the least processor time of three of each, so it neither read nor wrote what it measured; and, as a backstop against
 * a slowdown of both alike, under `most` ms of processor time, the test's old limit. Returns what the step gave.
 */
function atOnce(text, step, most) {
  const { ms: took, out } = fastest(3, step),
    pass = onePass(text);
  assert.ok(took < 10 * pass, `${took.toFixed(1)} ms, against ${pass.toFixed(1)} ms for one pass over the text`);
  assert.ok(took < most, `${took.toFixed(0)} ms of processor time, over ${most}`);
  return out;
}

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
    const reading = atOnce(block, () => readNote([block]), 1000);
    assert.equal(reading.tooLarge?.limit, 'text-bytes');
    assert.equal(reading.graphs.size, 0, 'nothing drawn');
    assert.deepEqual(reading.problems, []);
  });

  test('only what is read is measured: a large query or excerpt never stops the graphs beside it being drawn', () => {
    const query = `// graph: g · QUERY\n${'MATCH (n) RETURN n\n'.repeat(40_000)}`;
    const excerpt = `// excerpt\n${'(a:A)\n'.repeat(40_000)}`;
    const reading = readNote([query, excerpt, "// graph: g\n(a:A {name: 'a'})"]);
    assert.equal(reading.tooLarge, undefined);
    assert.equal(reading.graphs.get('g').boxes.length, 1);
  });

  test('the shared schemas are read, so they are measured too', () => {
    const schema = `// graph: s · SCHEMA s\n${"(k:Meta:ElementType {name: 'LINKS', kind: 'edge'}),\n".repeat(12_000)}`;
    const reading = readNote(["// graph: g · schema s\n(a:A {name: 'a'})"], 0, [schema]);
    assert.equal(reading.tooLarge?.limit, 'text-bytes');
    assert.equal(reading.graphs.size, 0);
  });

  test('over the limits the plugin draws nothing, so there is nothing to hold to the Python reader (drawn_in_part)', () => {
    const reading = readNote([`// graph: g\n${"(a:A {name: 'a'}),\n".repeat(30_000)}(b:B)`]);
    assert.ok(reading.tooLarge);
    assert.equal(reading.graphs.size, 0);
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
    const r = atOnce(d.boxes[0].text, () => tooLarge(d, PAGE_LIMITS), 200);
    assert.deepEqual(r, { reason: 'too-large', limit: 'word', count: 999_000, most: 1_000 });
  });

  test('a graph under the worker’s limits but over the page’s is refused there', () => {
    const d = drawing(Array.from({ length: 301 }, (_, i) => box(i)));
    assert.equal(tooLarge(d, LAYOUT_LIMITS), null);
    assert.deepEqual(tooLarge(d, PAGE_LIMITS), { reason: 'too-large', limit: 'things', count: 301, most: 300 });
  });
});
