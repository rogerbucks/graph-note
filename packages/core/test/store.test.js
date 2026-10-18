// Writing a block back to its note (spec §9). The text is the store (§2). So a write replaces only the block's own
// lines and leaves every other byte alone. A block that changed since the pane read it is never overwritten blind.
// Every write can be undone, back to the note's original bytes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replaceBlock, History } from '../src/store.ts';
import { gqlBlocks } from '../src/blocks.ts';

const NOTE =
  '# A note\n\nIntro.\n\n```gql\n// graph: g\n(a:T)\n```\n\nMiddle.\n\n```gql\n// graph: h\n(b:T)\n```\nEnd, with no newline';
const refOf = (note, n) => {
  const b = gqlBlocks(note)[n];
  return { line: b.line - 1, text: b.text };
};

describe('writing a block', () => {
  test('only the block’s own lines change; every other byte is kept', () => {
    const r = replaceBlock(NOTE, refOf(NOTE, 0), '// graph: g\n(a:T),\n(c:T)');
    assert.equal(r.ok, true);
    assert.equal(r.note, NOTE.replace('// graph: g\n(a:T)\n```', '// graph: g\n(a:T),\n(c:T)\n```'));
    assert.deepEqual(
      r.ref,
      { line: 4, text: '// graph: g\n(a:T),\n(c:T)' },
      'and the pane now holds the block as written',
    );
  });

  test('Windows line endings and a missing final newline are kept as they were', () => {
    const crlf = NOTE.replace(/\n/g, '\r\n');
    const r = replaceBlock(crlf, refOf(crlf, 1), '// graph: h\n(b:T), (d:T)');
    assert.equal(r.ok, true);
    assert.equal(r.note, crlf.replace('(b:T)\r\n```', '(b:T), (d:T)\r\n```'));
  });

  test('a block can be emptied, and written again', () => {
    const r = replaceBlock(NOTE, refOf(NOTE, 0), '');
    assert.equal(r.note, NOTE.replace('```gql\n// graph: g\n(a:T)\n```', '```gql\n\n```'));
    const back = replaceBlock(r.note, r.ref, '// graph: g\n(a:T)');
    assert.equal(back.note, NOTE);
  });
});

describe('no blind overwrite', () => {
  test('if the block changed since the pane read it, the write is refused and says so', () => {
    const ref = refOf(NOTE, 0);
    const edited = NOTE.replace('(a:T)', '(a:T), (z:T)');
    const r = replaceBlock(edited, ref, '// graph: g\n(a:T),\n(c:T)');
    assert.equal(r.ok, false);
    assert.match(r.reason, /changed since/);
    assert.equal(r.current.text, '// graph: g\n(a:T), (z:T)', 'with the block as it now is, to reload');
  });

  test('a block moved by edits above it, but unchanged, is still written', () => {
    const ref = refOf(NOTE, 1);
    const moved = NOTE.replace('Intro.', 'Intro.\n\nA new paragraph.\nAnd another line.');
    const r = replaceBlock(moved, ref, '// graph: h\n(b:T), (d:T)');
    assert.equal(r.ok, true);
    assert.equal(r.note, moved.replace('(b:T)\n```', '(b:T), (d:T)\n```'));
  });

  test('if the block cannot be told apart from another identical one, the write is refused', () => {
    const twice = '```gql\n// graph: g\n(a:T)\n```\n\n```gql\n// graph: g\n(a:T)\n```';
    const ref = { line: 40, text: '// graph: g\n(a:T)' };
    const r = replaceBlock(twice, ref, 'x');
    assert.equal(r.ok, false);
    assert.match(r.reason, /more than one/);
  });

  test('if the block is gone, the write is refused', () => {
    const r = replaceBlock('# Empty now', refOf(NOTE, 0), 'x');
    assert.equal(r.ok, false);
    assert.match(r.reason, /no longer/);
    assert.equal(r.current, null);
  });
});

describe('undo', () => {
  test('every write can be undone, back to the original bytes, and redone', () => {
    const h = new History();
    let note = NOTE,
      ref = refOf(NOTE, 0);
    for (const text of ['// graph: g\n(a:T),\n(c:T)', '// graph: g\n(a:T),\n(c:T),\n(d:T)']) {
      const r = replaceBlock(note, ref, text);
      h.record(ref.text, r.ref.text);
      note = r.note;
      ref = r.ref;
    }
    assert.ok(h.canUndo());
    for (let step; (step = h.undo());) {
      const r = replaceBlock(note, ref, step);
      note = r.note;
      ref = r.ref;
    }
    assert.equal(note, NOTE);
    assert.equal(h.canUndo(), false);
    const redo = h.redo();
    assert.equal(redo, '// graph: g\n(a:T),\n(c:T)');
  });

  test('a new write after undoing drops what could have been redone', () => {
    const h = new History();
    h.record('a', 'b');
    h.record('b', 'c');
    h.undo();
    h.record('b', 'x');
    assert.equal(h.redo(), null);
    assert.equal(h.undo(), 'b');
    assert.equal(h.undo(), 'a');
  });
});
