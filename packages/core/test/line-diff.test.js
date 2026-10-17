// The lines changed between two texts (editor spec §41, github_review_items): the lowest level of a review, every line
// kept, added or removed, in the fewest edits, numbered in both texts, and a limit past which nothing is compared.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DIFF_LIMIT, lineDiff } from '../src/line-diff.ts';

/** The older and the newer text read back from a comparison: what it keeps and removes, and what it keeps and adds. */
const sides = (d) => [
  d
    .filter((l) => l.kind !== 'add')
    .map((l) => l.text)
    .join('\n'),
  d
    .filter((l) => l.kind !== 'remove')
    .map((l) => l.text)
    .join('\n'),
];

describe('a comparison line by line', () => {
  // proves: github_review_items
  test('gives back both texts whole, in the fewest lines added and removed', () => {
    // every pair of short texts over three words: each comparison reads back as both texts
    const texts = ['', 'a', 'b', 'a\nb', 'b\na', 'a\nb\nc', 'c\nb\na', 'a\nc', 'a\na\nb', 'b\nb\nc\na'];
    for (const a of texts)
      for (const b of texts) {
        const d = lineDiff(a, b);
        assert.deepEqual(sides(d), [a, b], JSON.stringify([a, b]));
      }
    const d = lineDiff('a\nb\nc\nd', 'b\nd\ne');
    assert.equal(d.filter((l) => l.kind !== 'keep').length, 3);
  });

  // proves: github_review_items
  test('numbers each line in the text it is in, from one', () => {
    assert.deepEqual(lineDiff('a\nb\nc\n', 'a\nx\nc\n'), [
      { kind: 'keep', text: 'a', old: 1, new: 1 },
      { kind: 'remove', text: 'b', old: 2 },
      { kind: 'add', text: 'x', new: 2 },
      { kind: 'keep', text: 'c', old: 3, new: 3 },
    ]);
  });

  // proves: github_review_items
  test('past its limit says the change is too large, and is never compared without end', () => {
    const many = (p) => Array.from({ length: DIFF_LIMIT }, (_, i) => `${p}${i}`).join('\n');
    assert.equal(lineDiff(many('a'), many('b')), null);
    assert.deepEqual(lineDiff('', ''), []);
  });
});
