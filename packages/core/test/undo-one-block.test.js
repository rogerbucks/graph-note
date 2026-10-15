// Undo stays in its block (editor spec §9, undo_stays_in_its_block): switching the pane to another block starts that
// block's own history, so Undo and Redo never write one block's text into another, and a reason that held for the
// block left is not given for the one chosen. Found in review of #451, 15 Oct 2026: select() kept the history, so Undo
// after switching blocks wrote block A's old text over block B.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PaneSession } from '../src/pane.ts';

const fence = (t) => '```gql\n' + t + '\n```';
const A = "// graph: alpha\n(a:T {name: 'A'})";
const B = "// graph: beta\n(b:T {name: 'B'})";
const NOTE = ['# Note', '', fence(A), '', 'Between.', '', fence(B), ''].join('\n');
const MINE = A + ',\n(mine:T)';
/** Switches the pane to block B, wherever the note now has it, as the picker offers it. */
const toB = (s) => s.select(s.choices().find((c) => c.graph === 'beta').line);

/** A session that wrote MINE into block A, then switched to block B: the session and the note. */
function switched() {
  const s = new PaneSession(NOTE, 2);
  s.type(MINE);
  const w = s.write(NOTE);
  assert.equal(w.ok, true);
  toB(s);
  assert.equal(s.text, B);
  return { s, note: w.note };
}

describe('switching to another block', () => {
  test('starts its own history: Undo writes nothing into it, and never block A’s text', () => {
    const { s, note } = switched();
    assert.equal(s.canUndo(), false, 'block B has nothing of its own to undo');
    const w = s.undo(note);
    assert.equal(w.ok, true);
    assert.equal(w.note, note, 'the note is untouched');
    assert.equal(s.text, B);
  });

  test('a redo waiting in block A is not redone into block B', () => {
    const s = new PaneSession(NOTE, 2);
    s.type(MINE);
    const undone = s.undo(NOTE).note;
    assert.equal(undone, NOTE);
    assert.equal(s.canRedo(), true);
    toB(s);
    assert.equal(s.text, B);
    assert.equal(s.canRedo(), false);
    assert.equal(s.redo(undone).note, NOTE, 'nothing redone into block B');
  });

  test('a write in block B is undone in block B alone', () => {
    const { s, note } = switched();
    s.type(B + ',\n(also:T)');
    const w = s.write(note);
    assert.equal(w.ok, true);
    assert.equal(s.undo(w.note).note, note, 'block B back as it was, block A keeps its write');
    assert.equal(s.undo(note).note, note, 'and nothing of block A undone from block B');
  });

  test('a reason that held for block A is not given for block B', () => {
    const s = new PaneSession(NOTE, 2);
    s.type(MINE);
    const note = s.write(NOTE).note;
    const theirs = note.replace(MINE, A + ',\n(theirs:T)');
    assert.equal(s.noteChanged(theirs), 'reloaded');
    assert.match(s.stepRefusal('undo'), /^Nothing to undo: another program/);
    toB(s);
    assert.equal(s.text, B);
    assert.equal(s.stepRefusal('undo'), null);
    assert.equal(s.stepRefusal('redo'), null);
    const w = s.undo(theirs);
    assert.deepEqual([w.ok, w.note], [true, theirs], 'nothing to undo, and nothing refused');
  });
});
