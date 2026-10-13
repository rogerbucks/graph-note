// Notes on things and links (editor spec §24): the lines of exactly three slashes directly above a thing or a link,
// read by notes() into each note's text, CommonMark for the host to render, and its summary, and the lines holding more
// than one thing that a note above belongs to none of. The cases are the shared table, owned-comment-cases.json, which
// the Python library reads alike (python/graph_spec/tests/test_notes.py), so both readers read the same notes from the
// same text (note_both_readers). CommonJS, as the package is.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const C = require('../src/graph-spec-check.js');
const { cases } = require('./owned-comment-cases.json');

const proving = (id) => cases.filter((c) => c.proves.includes(id));

/** Every case that proves requirement `id` read by notes() as the table says: its notes and shared lines, or refused at
 * the table's line. */
function readsAsTheTableSays(id) {
  const of = proving(id);
  assert.ok(of.length, `no case in the table proves ${id}`);
  for (const c of of) {
    if ('refused' in c)
      assert.throws(
        () => C.notes(c.block),
        (e) => e instanceof C.ProfileError && e.line === c.refused,
        c.id,
      );
    else assert.deepEqual(C.notes(c.block), { notes: c.notes, shared: c.shared }, c.id);
  }
}

test('note_comment: a note is the lines of exactly three slashes and a space or the line end, directly above its thing or link; a blank line or an ordinary comment ends it', () => {
  readsAsTheTableSays('note_comment');
});

test('note_comment: every note notes() reads is the note of an element that owns one, and every such note is read', () => {
  for (const c of cases) {
    if ('refused' in c) continue;
    const owned = C.ownedComments(c.block).owned.filter((o) => o.note.length);
    assert.deepEqual(
      C.notes(c.block).notes.map((n) => [n.line, n.element, n.summary]),
      owned.map((o) => [o.line, o.element, o.summary]),
      c.id,
    );
  }
});

test("note_text: a note's text is its /// lines joined in order, a bare /// a paragraph break, CommonMark as written; its first paragraph is its summary", () => {
  readsAsTheTableSays('note_text');
});

test('note_never_other_comments: lines of two slashes or of four or more, -- and /* */ comments, and the // graph: and // excerpt lines are never notes', () => {
  readsAsTheTableSays('note_never_other_comments');
});

test('note_one_owner: a note above a line holding more than one thing belongs to none of them, and that line is said with the lines of the note', () => {
  readsAsTheTableSays('note_one_owner');
});

test('note_both_readers: every case for notes in the shared table says what notes() reads, and this reader reads it so', () => {
  const of = proving('note_both_readers');
  for (const c of of) assert.ok('refused' in c || ('notes' in c && 'shared' in c), `${c.id} says what notes() reads`);
  for (const c of cases.filter((x) => 'notes' in x)) assert.ok(of.includes(c), `${c.id} is held to both readers`);
  readsAsTheTableSays('note_both_readers');
});

test('note_standard: notes stay plain comments: a block reads to the same graph with its notes as without them, passes the syntax check and the dialect linter alike, and keeps every line in the text an engine is given', () => {
  const noted = cases.filter((c) => c.notes?.length);
  assert.ok(noted.length);
  for (const c of noted) {
    const drop = new Set(c.notes.flatMap((n) => n.lines));
    const without = c.block
      .split('\n')
      .filter((_, i) => !drop.has(i + 1))
      .join('\n');
    const store = C.read([c.block]);
    assert.deepEqual(store.graphs, C.read([without]).graphs, c.id);
    assert.equal(C.checkSyntax(c.block), null, c.id);
    assert.deepEqual(C.lint(c.block), C.lint(without), c.id);
    assert.equal(store.corrected(c.block), c.block, c.id);
  }
});
