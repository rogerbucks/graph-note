// The limits every reader, check and join stops at, with a clear refusal (editor spec §51, spec_read_limits).
'use strict';

const { ProfileError } = require('./profile-error.js');

// Size: the characters in one block, and the things and links in one graph. Nesting: how deep paths open into paths
// (§22). Join size: the documents in one join, and the things and links they hold in all. The Python library states
// the same (graphspec/reader/limits.py), and test/limit-cases.json holds both to them.
const LIMITS = Object.freeze({
  block_chars: 1000000,
  items: 50000,
  nesting: 64,
  join_documents: 64,
  join_items: 100000,
});

// A text's length in characters (code points), as the Python reader counts it. A pair of UTF-16 units is one.
function chars(text) {
  let pairs = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) pairs++;
  }
  return text.length - pairs;
}
// Refuses a block longer than the limit. It is measured, never read, so a huge block costs no more than its length.
function withinSize(block) {
  if (block.length <= LIMITS.block_chars) return;
  const size = chars(block);
  if (size > LIMITS.block_chars)
    throw new ProfileError(
      1,
      `the block is ${size} characters long, over the limit of ${LIMITS.block_chars}`,
      'split it into smaller graphs, each in its own block',
      undefined,
      'GN601',
    );
}
// Refuses a graph holding more things and links than the limit.
function withinItems(graph, count) {
  if (count > LIMITS.items)
    throw new ProfileError(
      1,
      `graph ${graph} holds more than ${LIMITS.items} things and links`,
      'split it into smaller graphs that link to each other',
      undefined,
      'GN602',
    );
}
// Refuses paths opened deeper than the limit, before the stack runs out.
function withinNesting(depth) {
  if (depth > LIMITS.nesting)
    throw new ProfileError(
      1,
      `paths open into paths more than ${LIMITS.nesting} deep`,
      `give the paths fewer levels, at most ${LIMITS.nesting}`,
      undefined,
      'GN603',
    );
}
// Refuses a join of more documents than the limit, before any is read.
function withinJoinDocuments(count) {
  if (count > LIMITS.join_documents)
    throw new ProfileError(
      1,
      `a join of ${count} documents is over the limit of ${LIMITS.join_documents}`,
      `join at most ${LIMITS.join_documents} documents at a time, then join the results`,
      undefined,
      'GN604',
    );
}
// Refuses a join whose documents hold more things and links in all than the limit, before they are joined.
function withinJoinItems(count) {
  if (count > LIMITS.join_items)
    throw new ProfileError(
      1,
      `the documents joined hold more than ${LIMITS.join_items} things and links`,
      'join fewer or smaller documents at a time',
      undefined,
      'GN605',
    );
}

module.exports = { LIMITS, chars, withinSize, withinItems, withinNesting, withinJoinDocuments, withinJoinItems };
