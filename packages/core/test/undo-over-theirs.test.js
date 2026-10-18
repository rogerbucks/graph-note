// Undo never undoes over a change another program, a sync or another pane made to the note (editor spec §9,
// undo_never_over_theirs; §26, cc_undo_safe). Once the block changes outside the session, its history starts again from
// the note as it now is. Undo and Redo say why there is nothing to take back. A change elsewhere in the note leaves the
// session's own undo working. Found in review, 15 Oct 2026: the pane reloaded the other program's block and kept its
// history, so Undo wrote the old text over it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PaneSession } from '../src/pane.ts';

const fence = (t) => '```gql\n' + t + '\n```';
const A = "// graph: alpha\n(a:T {name: 'A'})";
const B = "// graph: beta\n(b:T {name: 'B'})";
const NOTE = ['# Note', '', fence(A), '', 'Between.', '', fence(B), ''].join('\n');
const MINE = A + ',\n(mine:T)';
const THEIRS = A + ',\n(theirs:T)';

/** A session on the first block that has written MINE into the note: the session and the note it wrote. */
function written() {
  const s = new PaneSession(NOTE, 2);
  s.type(MINE);
  const w = s.write(NOTE);
  assert.equal(w.ok, true);
  assert.equal(s.canUndo(), true, 'its own write can be undone');
  return { s, note: w.note };
}

/** Holds that `w` is an undo or redo refused for the history, saying why, with nothing typed to keep. */
function refusedForHistory(w, which) {
  assert.equal(w.ok, false, `${which} is refused`);
  assert.equal(w.history, true, `${which} is refused for the history, not as a write`);
  assert.match(w.reason, new RegExp(`^Nothing to ${which}: another program, a sync or another pane changed this`));
}

describe('another program changes the block', () => {
  test('the history starts again from the note as it now is, and Undo says why there is nothing to take back', () => {
    const { s, note } = written();
    const theirs = note.replace(MINE, THEIRS);
    assert.equal(s.noteChanged(theirs), 'reloaded');
    assert.equal(s.text, THEIRS);
    assert.equal(s.canUndo(), false, 'nothing of its own left to undo');
    assert.match(s.stepRefusal('undo'), /^Nothing to undo: another program/);
    refusedForHistory(s.undo(theirs), 'undo');
    assert.equal(s.text, THEIRS, 'the other program’s block stays');
    refusedForHistory(s.undo(theirs), 'undo');
  });

  test('a write after it is the session’s own again, and undoes back to the note as it was then, never further', () => {
    const { s, note } = written();
    const theirs = note.replace(MINE, THEIRS);
    s.noteChanged(theirs);
    s.type(THEIRS + ',\n(again:T)');
    const w = s.write(theirs);
    assert.equal(w.ok, true);
    const back = s.undo(w.note);
    assert.equal(back.ok, true);
    assert.equal(back.note, theirs, 'undone to the note as the other program left it');
    refusedForHistory(s.undo(back.note), 'undo');
    assert.equal(s.redo(back.note).note, w.note, 'its own undo is redone');
  });

  test('a redo waiting when the block changes is dropped too, and Redo says why', () => {
    const { s, note } = written();
    const undone = s.undo(note).note;
    assert.equal(undone, NOTE);
    assert.equal(s.canRedo(), true);
    const theirs = undone.replace(A, THEIRS);
    assert.equal(s.noteChanged(theirs), 'reloaded');
    assert.equal(s.canRedo(), false);
    refusedForHistory(s.redo(theirs), 'redo');
    assert.equal(s.text, THEIRS);
  });

  test('typing not yet written when it changes is a conflict, and the history starts again then too', () => {
    const { s, note } = written();
    s.type(MINE + ',\n(more:T)');
    const theirs = note.replace(MINE, THEIRS);
    assert.equal(s.noteChanged(theirs), 'conflict');
    const w = s.write(theirs);
    assert.equal(w.ok, false);
    assert.equal(w.draft, MINE + ',\n(more:T)', 'what was typed is kept as a draft');
    refusedForHistory(s.undo(theirs), 'undo');
    assert.equal(s.text, THEIRS);
  });
});

describe('a sync changes the block', () => {
  // Obsidian Sync writes the file itself, and the vault tells the editor only afterwards: Undo can reach the note before
  // the editor has heard of the change
  test('an Undo that finds the block changed is refused, and nothing undone or redone is written over it later', () => {
    const { s, note } = written();
    const synced = note.replace(MINE, THEIRS);
    const w = s.undo(synced);
    assert.equal(w.ok, false, 'the undo is refused: the block changed since');
    assert.equal(s.text, THEIRS, 'the block reloaded as the sync left it');
    assert.equal(s.noteChanged(synced), 'unchanged', 'the change heard late');
    refusedForHistory(s.redo(synced), 'redo');
    refusedForHistory(s.undo(synced), 'undo');
  });

  test('a sync heard before Undo is pressed is another program’s change', () => {
    const { s, note } = written();
    const synced = note.replace(MINE, THEIRS);
    assert.equal(s.noteChanged(synced), 'reloaded');
    refusedForHistory(s.undo(synced), 'undo');
  });
});

describe('another pane changes the block', () => {
  test('its write is never undone from the first pane, and its own undo still works', () => {
    const { s: first, note } = written();
    const second = new PaneSession(note, 2);
    assert.equal(second.text, MINE);
    second.type(THEIRS);
    const w = second.write(note);
    assert.equal(w.ok, true);
    assert.equal(first.noteChanged(w.note), 'reloaded');
    refusedForHistory(first.undo(w.note), 'undo');
    assert.equal(first.text, THEIRS);
    const back = second.undo(w.note);
    assert.equal(back.ok, true, 'the second pane undoes its own write');
    assert.equal(back.note, note);
  });
});

describe('a change elsewhere in the note', () => {
  test('in another block, or in the prose, leaves the session’s own undo working', () => {
    for (const elsewhere of [(n) => n.replace(B, B + ',\n(theirs:T)'), (n) => n.replace('Between.', 'Changed.')]) {
      const { s, note } = written();
      const changed = elsewhere(note);
      assert.equal(s.noteChanged(changed), 'unchanged');
      assert.equal(s.canUndo(), true);
      assert.equal(s.stepRefusal('undo'), null);
      const back = s.undo(changed);
      assert.equal(back.ok, true);
      assert.equal(back.note, elsewhere(NOTE), 'its own write undone, the other change kept');
    }
  });

  test('a change that moves the block leaves it working too', () => {
    const { s, note } = written();
    const moved = note.replace('# Note', '# Note\n\nA new paragraph above.');
    assert.equal(s.noteChanged(moved), 'unchanged');
    assert.equal(s.undo(moved).note, NOTE.replace('# Note', '# Note\n\nA new paragraph above.'));
  });
});
