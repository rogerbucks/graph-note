// The edit pane's session (spec §4, §9): the block being edited, chosen from the note's graph blocks; what is typed, written
// back to the note; a write refused when the block changed meanwhile, with what was typed kept as a draft; the pane reloaded
// when the note changes under a clean pane; and undo and redo of what was written.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PaneSession } from '../src/pane.ts';
import { pathBlock } from '../src/paths.ts';

const fence = (t) => '```gql\n' + t + '\n```';
const A = "// graph: alpha\n(a:T {name: 'A'})";
const B = "// graph: beta\n(b:T {name: 'B'})";
const Q = '// graph: alpha · QUERY\nMATCH (n) RETURN n';
const NOTE = ['# Note', '', fence(A), '', fence(Q), '', fence(B), ''].join('\n');

describe('the block', () => {
  test('the pane opens on the block that was tapped', () => {
    const s = new PaneSession(NOTE, 12);
    assert.equal(s.graph, 'beta');
    assert.equal(s.text, B);
  });

  test('a note with several graph blocks offers each in a picker; queries are not offered', () => {
    const s = new PaneSession(NOTE, 2);
    assert.deepEqual(s.choices(), [
      { line: 2, graph: 'alpha', label: 'alpha · line 3' },
      { line: 12, graph: 'beta', label: 'beta · line 13' },
    ]);
    s.select(12);
    assert.equal(s.text, B);
  });

  test('a line that holds no graph block opens on the first graph block', () => {
    assert.equal(new PaneSession(NOTE, 999).graph, 'alpha');
  });

  test('a note with no graph block has nothing to edit, and says so', () => {
    assert.throws(() => new PaneSession('# Nothing here', 0), /no graph block/);
  });
});

describe('writing what is typed', () => {
  test('what is typed is written into the block, and the rest of the note is kept', () => {
    const s = new PaneSession(NOTE, 2);
    s.type(A + ",\n(c:T {name: 'C'})");
    assert.equal(s.dirty, true);
    const r = s.write(NOTE);
    assert.equal(r.ok, true);
    assert.equal(r.note, NOTE.replace(A, A + ",\n(c:T {name: 'C'})"));
    assert.equal(s.dirty, false);
  });

  test('nothing to write when nothing was typed', () => {
    const s = new PaneSession(NOTE, 2);
    assert.deepEqual(s.write(NOTE), { ok: true, note: NOTE, unchanged: true });
  });

  test('the drawing in the pane is of what is typed, before it is written', () => {
    const s = new PaneSession(NOTE, 2);
    s.type(A + ",\n(c:T {name: 'C'})");
    assert.deepEqual(
      s
        .reading(NOTE)
        .graphs.get('alpha')
        .boxes.map((b) => b.key),
      ['a', 'c'],
    );
  });
});

describe('no blind overwrite, and nothing typed lost', () => {
  test('if the block changed in the note meanwhile, the write is refused and what was typed is kept as a draft', () => {
    const s = new PaneSession(NOTE, 2);
    s.type(A + ',\n(mine:T)');
    const theirs = NOTE.replace(A, A + ',\n(theirs:T)');
    const r = s.write(theirs);
    assert.equal(r.ok, false);
    assert.match(r.reason, /changed since/);
    assert.equal(r.draft, A + ',\n(mine:T)');
    assert.equal(s.text, A + ',\n(theirs:T)', 'the pane reloads the block as it now is');
    assert.equal(s.dirty, false);
  });

  test('a change to the note under a clean pane reloads it', () => {
    const s = new PaneSession(NOTE, 2);
    const changed = NOTE.replace(A, A + ',\n(theirs:T)');
    assert.equal(s.noteChanged(changed), 'reloaded');
    assert.equal(s.text, A + ',\n(theirs:T)');
    assert.equal(s.noteChanged(changed), 'unchanged');
  });

  test('a change to the note under a pane with unwritten typing is a conflict, and the typing stays', () => {
    const s = new PaneSession(NOTE, 2);
    s.type(A + ',\n(mine:T)');
    assert.equal(s.noteChanged(NOTE.replace(A, A + ',\n(theirs:T)')), 'conflict');
    assert.equal(s.text, A + ',\n(mine:T)');
  });

  test('a change elsewhere in the note, or one that moves the block, is not a conflict', () => {
    const s = new PaneSession(NOTE, 12);
    s.type(B + ',\n(mine:T)');
    const moved = NOTE.replace('# Note', '# Note\n\nA new paragraph above.');
    assert.equal(s.noteChanged(moved), 'unchanged');
    const r = s.write(moved);
    assert.equal(r.ok, true);
    assert.equal(r.note, moved.replace(B, B + ',\n(mine:T)'));
  });

  test('a block deleted from the note under the pane is a conflict, never an overwrite', () => {
    const s = new PaneSession(NOTE, 2);
    s.type(A + ',\n(mine:T)');
    const r = s.write(NOTE.replace(fence(A), ''));
    assert.equal(r.ok, false);
    assert.equal(r.draft, A + ',\n(mine:T)');
  });
});

describe('the note as it reads with what is typed', () => {
  test('gives every block of the note with the typed text in the edited block’s place, and which that is', () => {
    const s = new PaneSession(NOTE, 12);
    const typed = B + ",\n(mine:T {name: 'M'})";
    s.type(typed);
    assert.deepEqual(s.texts(NOTE), { texts: [A, Q, typed], index: 2 });
  });

  test('says the block is not there when the note no longer holds it, and keeps the texts as they are', () => {
    const s = new PaneSession(NOTE, 12);
    s.type(B + ',\n(mine:T)');
    assert.deepEqual(s.texts(NOTE.replace(fence(B), '')), { texts: [A, Q], index: -1 });
  });
});

describe('undo and redo', () => {
  test('each write can be undone and redone, back to the original note', () => {
    const s = new PaneSession(NOTE, 2);
    let note = NOTE;
    for (const t of [A + ',\n(c:T)', A + ',\n(c:T),\n(d:T)']) {
      s.type(t);
      note = s.write(note).note;
    }
    assert.equal(s.canUndo(), true);
    note = s.undo(note).note;
    assert.equal(s.text, A + ',\n(c:T)');
    note = s.undo(note).note;
    assert.equal(note, NOTE);
    assert.equal(s.canUndo(), false);
    note = s.redo(note).note;
    assert.equal(note, NOTE.replace(A, A + ',\n(c:T)'));
  });

  test('typing not yet written is written before an undo, so it can be redone', () => {
    const s = new PaneSession(NOTE, 2);
    s.type(A + ',\n(c:T)');
    const note = s.undo(NOTE).note;
    assert.equal(note, NOTE);
    assert.equal(s.redo(note).note, NOTE.replace(A, A + ',\n(c:T)'));
  });
});

// Review, 11 Oct 2026: an edit written into the block is checked against the note as it is now, never an older drawing
describe('the note as it is now', () => {
  test('is read with what is typed in the block’s place, and follows the note as it changes', () => {
    const other = "// graph: alpha\n(small_reader:T {name: 'Other'})";
    const typed = `${A},\n(:T {name: 'Small reader'})`;
    const suggested = (s) => {
      const boxes = s.current().graphs.get('alpha')?.boxes ?? [];
      return boxes.filter((b) => b.suggested).map((b) => b.key);
    };
    const before = ['# Note', '', fence(other), '', fence(A), ''].join('\n');
    const s = new PaneSession(before, 7);
    assert.equal(s.text, A, 'the block after the other');
    s.type(typed);
    assert.deepEqual(suggested(s), ['small_reader_2'], 'the other block writes small_reader');
    assert.equal(s.noteChanged(before.replace(other, other.replaceAll('small_reader', 'other'))), 'unchanged');
    assert.deepEqual(suggested(s), ['small_reader'], 'read again as the note now is');
  });

  test('suggests a name against the blocks after the edited one too, as the whole note does', () => {
    const later = "// graph: alpha\n(small_reader:T {name: 'Other'})";
    const note = ['# Note', '', fence(`${A},\n(:T {name: 'Small reader'})`), '', fence(later), ''].join('\n');
    const s = new PaneSession(note, 2);
    const boxes = s.current().graphs.get('alpha')?.boxes ?? [];
    assert.deepEqual(
      boxes.filter((b) => b.suggested).map((b) => b.key),
      ['small_reader_2'],
    );
    const r = pathBlock(s.current(), 'alpha', s.text, 'Walk', ['a', 'small_reader_2']);
    assert.match(
      r.refused,
      /^accept its name first: Small reader is only drawn under the suggested name small_reader_2,/,
    );
  });
});

// Review, 11 Oct 2026: the check made before an edit can be against a note older than the one written into; so an edit
// made for the person is checked again as it is written, against that note, for the names it newly writes
describe('an edit made for the person, as it is written', () => {
  const other = (id) => `// graph: alpha\n(${id}:T {name: 'Other'})`;
  const unnamed = `${A},\n(:T {name: 'Small reader'})`;
  const noteOf = (first) => ['# Note', '', fence(first), '', fence(unnamed), ''].join('\n');
  const edited = (s, text) => {
    s.edit(text);
    assert.equal(s.text, text);
    assert.ok(s.dirty);
  };

  test('naming a thing only suggested in the note written into is refused, the block reloaded and the edit kept', () => {
    const s = new PaneSession(noteOf(other('small_reader')), 7);
    assert.equal(s.text, unnamed);
    const text = `${unnamed},\n(a)-[:SEES]->(small_reader)`;
    edited(s, text);
    // the other block's thing was renamed meanwhile, and the session had not heard: small_reader is now only suggested
    const w = s.write(noteOf(other('elsewhere')));
    assert.equal(w.ok, false);
    assert.match(w.reason, /^accept its name first: Small reader is only drawn under the suggested name small_reader,/);
    assert.deepEqual([w.draft, w.edit, s.text, s.dirty], [text, true, unnamed, false]);
  });

  test('a name it gives that another block has written meanwhile is refused', () => {
    for (const [given, text] of [
      ['small_reader', `${A},\n(small_reader:T {name: 'Small reader'})`],
      ['tablet', `${unnamed},\n(tablet:T {name: 'Tablet'})`],
    ]) {
      const s = new PaneSession(noteOf(other('elsewhere')), 7);
      edited(s, text);
      const w = s.write(noteOf(other(given)));
      assert.equal(w.ok, false, given);
      assert.equal(w.reason, `${given} is already a name in graph alpha: choose another`);
      assert.equal(s.text, unnamed);
    }
  });

  test('is written when the note written into agrees, and typing is not held to it', () => {
    const s = new PaneSession(noteOf(other('small_reader')), 7);
    edited(s, `${unnamed},\n(a)-[:SEES]->(small_reader)`);
    assert.equal(s.write(noteOf(other('small_reader'))).ok, true);
    const typed = new PaneSession(noteOf(other('small_reader')), 7);
    typed.type(`${unnamed},\n(a)-[:SEES]->(small_reader)`);
    assert.equal(typed.write(noteOf(other('elsewhere'))).ok, true, 'what the person types is theirs to write');
  });
});
