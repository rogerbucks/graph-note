// The block followed, not its copy (editor spec §9, block_followed_not_its_copy): after another program pastes a copy of
// the open block and then edits the original, the session keeps to the original, so Undo never reverts the copy while
// their edit survives; when it cannot tell the two apart, it stops and says so, writing and undoing neither. Found while
// fixing #451, 15 Oct 2026: the session followed a block by its text alone, so it took the unchanged copy for its own.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PaneSession } from '../src/pane.ts';
import { followBlock } from '../src/block-follow.ts';

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

  test('a stopped session says so: `stopped`, and its refused write marked `stopped`', () => {
    const { s, note } = written();
    const pasted = pastedBeside(note);
    assert.equal(s.stopped, false);
    s.noteChanged(pasted);
    assert.equal(s.stopped, true);
    s.type(MINE + ',\n(more:T)');
    const w = s.write(pasted);
    assert.deepEqual([w.ok, w.stopped], [false, true]);
    s.select(s.choices()[0].line);
    assert.equal(s.stopped, false, 'until a block is chosen again');
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

// The review of #465, 15 Oct 2026: one change can put a copy in place of another block, keeping the count of blocks,
// and a new block of the same graph is not the held block edited unless it reads as it
const B2 = "// graph: alpha\n(b:T {name: 'B'})";
const B3 = "// graph: beta\n(b:T {name: 'B'})";
const FRESH = "// graph: alpha\n(fresh:T {name: 'Fresh'})";
/** `# Note`, the held block A, then block `b`, then `End.`; a session on A that has written MINE into it. */
function besideBlock(b) {
  const note = ['# Note', '', fence(A), '', fence(b), '', 'End.', ''].join('\n');
  const s = new PaneSession(note, 2);
  s.type(MINE);
  const w = s.write(note);
  assert.equal(w.ok, true);
  return { s, note: w.note };
}

describe('a copy in place of another block, in one change', () => {
  for (const [what, b] of [
    ['another block of its graph', B2],
    ['a block of another graph', B3],
  ]) {
    test(`over ${what}, with the original edited and the note above it: the session stops, undoing neither`, () => {
      const { s, note } = besideBlock(b);
      // the note as one outside change leaves it: `# Note!`, A edited to THEIRS, and B replaced by a copy of MINE
      const changed = ['# Note!', '', fence(THEIRS), '', fence(MINE), '', 'End.', ''].join('\n');
      assert.equal(note, ['# Note', '', fence(MINE), '', fence(b), '', 'End.', ''].join('\n'));
      assert.equal(s.noteChanged(changed), 'conflict');
      const w = s.undo(changed);
      refusedForHistory(w, 'undo');
      stopped(w.reason);
    });
  }

  test('a copy pasted far off while the note above changes: two blocks hold its text, and it stops', () => {
    const { s, note } = written();
    const changed = pastedFar(note.replace('# Note', '# Note!'));
    assert.equal(s.noteChanged(changed), 'conflict');
    stopped(s.stepRefusal('undo'));
  });
});

describe('a new block that is not the held block edited', () => {
  test('a different block of its graph pasted directly above it: followed, never stopped', () => {
    const { s, note } = written();
    const changed = note.replace(fence(MINE), fence(FRESH) + '\n\n' + fence(MINE));
    assert.equal(s.noteChanged(changed), 'unchanged');
    assert.equal(s.stepRefusal('undo'), null);
    const back = s.undo(changed);
    assert.equal(back.ok, true);
    assert.equal(back.note, changed.replace(fence(MINE), fence(A)), 'its own write undone, the new block kept');
  });

  test('an edit above it and below it, and a new block of its graph, in one change: followed, never stopped', () => {
    const { s, note } = written();
    const changed = note.replace('# Note', '# Note!').replace('Between.', 'Between!') + '\n' + fence(FRESH) + '\n';
    assert.equal(s.noteChanged(changed), 'unchanged');
    const back = s.undo(changed);
    assert.equal(back.ok, true);
    assert.equal(back.note, changed.replace(fence(MINE), fence(A)));
  });

  // the re-review of #465, 15 Oct 2026: half of the shorter text let a tiny block read as the held block edited
  test('a tiny block of its graph pasted directly above it: followed, never stopped', () => {
    const { s, note } = written();
    const changed = note.replace(fence(MINE), fence('// graph: alpha\n(z:T)') + '\n\n' + fence(MINE));
    assert.equal(s.noteChanged(changed), 'unchanged');
    assert.equal(s.stepRefusal('undo'), null);
  });

  test('a copy pasted directly above it, then the original edited: the original is followed', () => {
    const { s, note } = written();
    const above = note.replace('# Note\n', '# Note\n' + fence(MINE) + '\n');
    assert.equal(s.noteChanged(above), 'unchanged', 'the original kept the blank line above it');
    const edited = above.replace('\n\n' + fence(MINE), '\n\n' + fence(THEIRS));
    assert.ok(edited.startsWith('# Note\n' + fence(MINE) + '\n'), 'the copy as it was pasted');
    assert.equal(s.noteChanged(edited), 'reloaded');
    assert.equal(s.text, THEIRS);
    refusedForHistory(s.undo(edited), 'undo');
  });
});

// The re-review of #465, 15 Oct 2026: the original rewritten past half its text after a copy was pasted no longer read
// as the held block edited, so the copy was the one block left holding its text and the session followed it
const REWRITES = {
  'rewritten whole': "// graph: alpha\n(q:T {name: 'Q'})",
  'most lines replaced': "// graph: alpha\n(a:T {name: 'Alpha, renamed'}),\n(x:T), (y:T), (z:T)",
  'one line added at the top': "// graph: alpha\n(top:T),\n(a:T {name: 'A'}),\n(mine:T)",
  'much appended': MINE + ",\n(p:T {name: 'a long new thing with a long text'}),\n(r:T {name: 'and another long one'})",
};

/**
 * Holds that the session never follows the copy once the original became `rewrite`: it stops, or keeps to the original
 * and reloads it; Undo takes nothing back, and a write after typing never touches the copy.
 */
function neverTheCopy(s, note, rewrite) {
  const outcome = s.noteChanged(note);
  assert.notEqual(outcome, 'unchanged', 'the copy, unchanged, is never taken for the block');
  if (outcome === 'reloaded') assert.equal(s.text, rewrite, 'the original, as they left it');
  else stopped(s.stepRefusal('undo'));
  assert.equal(s.undo(note).ok, false, 'nothing undone');
  s.type(s.text + ',\n(late:T)');
  const w = s.write(note);
  if (w.ok) assert.equal(w.note, note.replace(fence(rewrite), fence(rewrite + ',\n(late:T)')), 'into the original');
  else stopped(w.reason);
  return outcome;
}

describe('the original rewritten after a copy is pasted', () => {
  test('a copy pasted far off, then the original rewritten, told of each: never the copy; rewritten whole, stopped', () => {
    for (const [what, rewrite] of Object.entries(REWRITES)) {
      const { s, note } = written();
      const pasted = pastedFar(note);
      assert.equal(s.noteChanged(pasted), 'unchanged', what);
      const outcome = neverTheCopy(s, pasted.replace(fence(MINE), fence(rewrite)), rewrite);
      if (what === 'rewritten whole') assert.equal(outcome, 'conflict', 'nothing of the block is left to know it by');
    }
  });

  test('a copy pasted far off and the original rewritten, in one change: never the copy; rewritten whole, stopped', () => {
    for (const [what, rewrite] of Object.entries(REWRITES)) {
      const { s, note } = written();
      const outcome = neverTheCopy(s, pastedFar(note).replace(fence(MINE), fence(rewrite)), rewrite);
      if (what === 'rewritten whole') assert.equal(outcome, 'conflict', 'nothing of the block is left to know it by');
    }
  });

  test('a copy pasted beside it, then the original rewritten, told of each: stopped', () => {
    for (const [what, rewrite] of Object.entries(REWRITES)) {
      const { s, note } = written();
      const pasted = pastedBeside(note);
      assert.equal(s.noteChanged(pasted), 'conflict', what);
      assert.equal(neverTheCopy(s, pasted.replace(fence(MINE), fence(rewrite)), rewrite), 'conflict', what);
    }
  });

  test('a copy pasted beside it and the original rewritten, in one change, still read as its own: stopped', () => {
    for (const what of ['most lines replaced', 'one line added at the top', 'much appended']) {
      const { s, note } = written();
      const changed = note.replace(fence(MINE), fence(REWRITES[what]) + '\n\n' + fence(MINE));
      assert.equal(s.noteChanged(changed), 'conflict', what);
      stopped(s.undo(changed).reason);
    }
  });

  // the one case no reading of the note can tell: the note is, byte for byte, a new block pasted above the block
  test('a copy pasted beside it and the original rewritten whole, in one change, reads as a new block pasted above', () => {
    const rewrite = REWRITES['rewritten whole'];
    const { s, note } = written();
    const changed = note.replace(fence(MINE), fence(rewrite) + '\n\n' + fence(MINE));
    const pastedAbove = note.replace('# Note\n\n', '# Note\n\n' + fence(rewrite) + '\n\n');
    assert.equal(changed, pastedAbove, 'the same text');
    assert.equal(s.noteChanged(changed), 'unchanged');
  });
});

// The re-review of #465, 15 Oct 2026: each new block was compared with every block before, so 8,000 blocks took half a
// second; the blocks looked at are counted, never timed (spec §12)
describe('following is linear in the blocks', () => {
  /** A note of `n` blocks of the graph after the held one, and the note with its first and last lines changed. */
  function many(n) {
    const blocks = Array.from({ length: n }, (_, i) => fence(`// graph: alpha\n(b${i}:T {name: 'B ${i}'})`));
    const before = ['# Note', '', fence(MINE), '', ...blocks, 'End.', ''].join('\n');
    const after = before.replace('# Note', '# Note!').replace('End.', 'End!') + fence(FRESH) + '\n';
    return { before, after };
  }
  const looked = (n) => {
    const { before, after } = many(n);
    const work = { looked: 0 };
    assert.deepEqual(followBlock(before, after, 2, work), { at: 0 }, 'the block, followed');
    return work.looked;
  };

  test('twice the blocks, about twice the blocks looked at, and each looked at a few times at most', () => {
    const small = looked(1000),
      large = looked(2000);
    assert.ok(small >= 1000, `every block looked at, the control: ${small}`);
    assert.ok(large <= small * 2.2, `${small} then ${large}`);
    assert.ok(large <= 8 * 2000, `${large} for 2000 blocks`);
  });
});
