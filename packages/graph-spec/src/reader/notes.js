// The notes on things and links (graph spec §26; editor spec §24, note_comment, note_text, note_one_owner), as notes.py
// reads them: each run of /// lines owned by the one element directly below it, as text for the host to render as
// CommonMark, and each line holding more than one element with a note above it, which belongs to none of them.
'use strict';

const { scanComments } = require('./owned-comments.js');

/** A block's notes: notes, in line order, each with its element's line, the element (a thing as {thing: its name}, a
 * link as {link: [from, type, to]}, by the names written), its /// lines' numbers, its text (what follows each marker
 * and its space, joined in order with a line break, so a bare /// is a paragraph break) and its summary, the first
 * paragraph; and shared, each line holding more than one element with a note's /// lines directly above it, as {line,
 * lines}. //@ lines are never a note's, and an element with only those has none. Refuses what the reader refuses, with
 * its ProfileError; a query or an excerpt holds no notes. */
function notes(block) {
  const { owned, shared } = scanComments(block);
  return {
    notes: owned
      .filter((o) => o.lines.length)
      .map((o) => ({ line: o.line, element: o.element, lines: o.lines, text: o.note.join('\n'), summary: o.summary })),
    shared,
  };
}

module.exports = { notes };
