// The block followed, not its copy (editor spec §9, block_followed_not_its_copy): after another program pastes a copy of
// the open block and then edits the original, the session keeps to the original, so Undo never reverts the copy while
// their edit survives; when it cannot tell the two apart, it stops and says so, writing and undoing neither. Found while
// fixing #451, 15 Oct 2026: the session followed a block by its text alone, so it took the unchanged copy for its own.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PaneSession } from '../src/pane.ts';

const fence = (t) => '```gql\n' + t + '\n```';
const A = "// graph: alpha\n(a:T {name: 'A'})";
const B = "// graph: beta\n(b:T {name: 'B'})";
const NOTE = ['# Note', '', fence(A), '', 'Between.', '', fence(B), ''].join('\n');
const MINE = A + ',\n(mine:T)';
const THEIRS = A + ',\n(theirs:T)';
/** A copy of the block pasted at the end of the note, after the other block. */
const pastedFar = (note) => note + '\n' + fence(MINE) + '\n';
/** A copy of the block pasted directly below it. */
const pastedBeside = (note) => note.replace(fence(MINE), fence(MINE) + '\n\n' + fence(MINE));
/** The original edited: the first block holding MINE, which is the original wherever the copy was pasted after it. */
const editedOriginal = (note) => note.replace(fence(MINE), fence(THEIRS));
/** The copy, as it was pasted: the note still ends with it. */
const copyKept = (note) => note.endsWith(fence(MINE) + '\n');

/** A session on the first block that has written MINE into the note: the session and the note it wrote. */
function written() {
  const s = new PaneSession(NOTE, 2);
  s.type(MINE);
  const w = s.write(NOTE);
  assert.equal(w.ok, true);
  assert.equal(s.canUndo(), true, 'its own write can be undone');
  return { s, note: w.note };
}

/** Holds that `w` is an undo or redo refused for the history, with nothing typed to keep. */
function refusedForHistory(w, which) {
  assert.equal(w.ok, false, `${which} is refused`);
  assert.equal(w.history, true, `${which} is refused for the history, not as a write`);
}

/** Holds that the session has stopped, saying it cannot tell its block from the copy. */
function stopped(reason) {
  assert.match(reason ?? '', /copy of this block/);
  assert.match(reason ?? '', /cannot tell which/);
}

describe('a copy pasted elsewhere, then the original edited', () => {
  test('told of each change, the session keeps to the original: it reloads their edit and never undoes the copy', () => {
    const { s, note } = written();
    const pasted = pastedFar(note);
    assert.equal(s.noteChanged(pasted), 'unchanged', 'its block is untouched by the paste');
    assert.equal(s.canUndo(), true);
    const edited = editedOriginal(pasted);
    assert.equal(s.noteChanged(edited), 'reloaded', 'the original was changed, not followed to the copy');
    assert.equal(s.text, THEIRS);
    refusedForHistory(s.undo(edited), 'undo');
    s.type(THEIRS + ',\n(again:T)');
    const w = s.write(edited);
    assert.equal(w.ok, true);
    assert.equal(w.note, edited.replace(fence(THEIRS), fence(THEIRS + ',\n(again:T)')), 'written into the original');
    assert.ok(copyKept(w.note), 'the copy as it was pasted');
  });

  test('told of both at once, it keeps to the original too', () => {
    const { s, note } = written();
    const edited = editedOriginal(pastedFar(note));
    assert.equal(s.noteChanged(edited), 'reloaded');
    assert.equal(s.text, THEIRS);
    refusedForHistory(s.undo(edited), 'undo');
    assert.equal(s.text, THEIRS, 'their edit survives');
  });

  test('an Undo that finds both before the session heard of them is refused, and the copy is left as it was', () => {
    const { s, note } = written();
    const edited = editedOriginal(pastedFar(note));
    const w = s.undo(edited);
    assert.equal(w.ok, false, 'the undo is refused: the original changed since');
    assert.equal(s.text, THEIRS, 'the original reloaded as they left it');
    assert.equal(s.noteChanged(edited), 'unchanged', 'the change heard late');
    refusedForHistory(s.undo(edited), 'undo');
    refusedForHistory(s.redo(edited), 'redo');
  });

  test('a block that moved while another block changed, with no copy anywhere, is still followed', () => {
    const { s, note } = written();
    const changed = note.replace('# Note', '# Note\n\nA new paragraph.').replace(B, B + ',\n(theirs:T)');
    assert.equal(s.noteChanged(changed), 'unchanged');
    const back = s.undo(changed);
    assert.equal(back.ok, true);
    assert.equal(back.note, changed.replace(MINE, A), 'its own write undone, the other changes kept');
  });
});

describe('a block moved, with no copy', () => {
  // the review of this fix, 15 Oct 2026: a fence line is every block's, so the block cut away brings the next one's fence
  // to its line; that block, of the same graph, is never taken for the one held, edited
  test('cut and pasted after another block of its graph, it is followed to where it was pasted', () => {
    const more = "// graph: alpha\n(more:T {name: 'More'})";
    const note = ['# Note', '', fence(A), '', fence(more), ''].join('\n');
    const s = new PaneSession(note, 2);
    s.type(MINE);
    const written = s.write(note).note;
    const moved = written.replace(fence(MINE) + '\n\n', '') + '\n' + fence(MINE) + '\n';
    assert.equal(s.noteChanged(moved), 'unchanged');
    assert.equal(s.text, MINE);
    assert.equal(s.ref.line, moved.split('\n').lastIndexOf('```gql'), 'followed to where it was pasted');
    const back = s.undo(moved);
    assert.equal(back.ok, true);
    assert.equal(back.note, moved.replace(MINE, A), 'its own write undone where it now is, the other block untouched');
  });
});

describe('a copy it cannot tell from the original', () => {
  test('pasted directly beside the block: the session stops and says so, writing and undoing neither', () => {
    const { s, note } = written();
    const pasted = pastedBeside(note);
    assert.equal(s.noteChanged(pasted), 'conflict');
    stopped(s.stepRefusal('undo'));
    stopped(s.stepRefusal('redo'));
    assert.equal(s.canUndo(), false);
    const undo = s.undo(pasted);
    refusedForHistory(undo, 'undo');
    stopped(undo.reason);
    s.type(MINE + ',\n(more:T)');
    const w = s.write(pasted);
    assert.equal(w.ok, false, 'nothing written into either');
    stopped(w.reason);
    assert.equal(w.draft, MINE + ',\n(more:T)', 'what was typed is kept as a draft');
    const edited = editedOriginal(pasted);
    assert.equal(s.noteChanged(edited), 'conflict', 'still stopped once one of them is edited');
    stopped(s.undo(edited).reason);
  });

  test('pasted beside it and the original edited, heard at once: it cannot tell them apart, and stops', () => {
    const { s, note } = written();
    const edited = note.replace(fence(MINE), fence(THEIRS) + '\n\n' + fence(MINE));
    assert.equal(s.noteChanged(edited), 'conflict');
    const w = s.undo(edited);
    refusedForHistory(w, 'undo');
    stopped(w.reason);
    assert.ok(edited.includes(fence(THEIRS)) && edited.includes(fence(MINE)), 'both left as they are');
  });

  test('choosing a block again goes on, with that block’s own history', () => {
    const { s, note } = written();
    const pasted = pastedBeside(note);
    s.noteChanged(pasted);
    const line = s.choices().find((c) => c.graph === 'alpha').line;
    s.select(line);
    assert.equal(s.stepRefusal('undo'), null);
    s.type(MINE + ',\n(more:T)');
    const w = s.write(pasted);
    assert.equal(w.ok, true);
    assert.equal(w.note, pasted.replace(fence(MINE), fence(MINE + ',\n(more:T)')), 'written into the block chosen');
    assert.equal(s.undo(w.note).note, pasted, 'and undone there');
  });
});
