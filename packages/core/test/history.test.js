// The text's own undo history (editor spec §4, typing_keeps_focus, 8 Oct 2026): Obsidian redraws a block each time its
// text is written, and Chromium empties a field's undo history whenever the field leaves the page. So the editor keeps
// its own. Each run of typing is one step, as a platform's undo groups it, and anything else is a step of its own.
// Host-free: a state is the text and its selection.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TextHistory } from '../src/history.ts';

const at = (text, start = text.length, end = start) => ({ text, start, end });

/** Types each character at the caret, as a person does, recording each as typing. */
function typeOn(h, from, chars) {
  let s = from;
  for (const ch of chars) {
    s = at(s.text.slice(0, s.start) + ch + s.text.slice(s.end), s.start + 1);
    h.record(s, 'typing');
  }
  return s;
}

describe('one step for each run of typing', () => {
  test('a run of typing is undone in one step, back to where it began, and redone the same', () => {
    const h = new TextHistory(at('ab'));
    const s = typeOn(h, at('ab'), 'cde');
    assert.deepEqual(h.undo(), at('ab'));
    assert.deepEqual(h.redo(), s);
    assert.equal(h.redo(), null);
  });

  test('a new line ends a run, as does moving the caret to type elsewhere', () => {
    const h = new TextHistory(at(''));
    let s = typeOn(h, at(''), 'ab\ncd');
    s = typeOn(h, at(s.text, 0), 'X');
    assert.deepEqual(h.undo(), at('ab\ncd'));
    assert.deepEqual(h.undo(), at('ab\n'));
    assert.deepEqual(h.undo(), at(''));
    assert.equal(h.undo(), null);
  });

  test('deleting backwards is a run of its own, apart from the typing before it', () => {
    const h = new TextHistory(at(''));
    typeOn(h, at(''), 'abcd');
    h.record(at('abc'), 'typing');
    h.record(at('ab'), 'typing');
    assert.deepEqual(h.undo(), at('abcd'));
    assert.deepEqual(h.undo(), at(''));
  });

  test('anything else is a step of its own: a paste, a fix, a comma added for you', () => {
    const h = new TextHistory(at('a'));
    const s = typeOn(h, at('a'), '\n(');
    h.record(at('a,\n(', 4), 'other');
    assert.deepEqual(h.undo(), s, 'the comma alone');
    assert.deepEqual(h.undo(), at('a\n'), 'then the typing');
  });

  test('a state the same as the last is not a step', () => {
    const h = new TextHistory(at('a'));
    h.record(at('a'), 'other');
    assert.equal(h.undo(), null);
  });
});

describe('undo and redo', () => {
  test('a change after an undo drops what could have been redone', () => {
    const h = new TextHistory(at(''));
    typeOn(h, at(''), 'ab');
    h.undo();
    h.record(at('x'), 'other');
    assert.equal(h.redo(), null);
    assert.deepEqual(h.undo(), at(''));
  });

  test('typing after an undo starts a new run, never merged into the step undone', () => {
    const h = new TextHistory(at(''));
    typeOn(h, at(''), 'ab ');
    typeOn(h, at('ab '), 'cd');
    assert.equal(h.undo().text, '');
    typeOn(h, at(''), 'x');
    assert.deepEqual(h.undo(), at(''));
  });

  test('starting again forgets every step: for a text reloaded from the note', () => {
    const h = new TextHistory(at(''));
    typeOn(h, at(''), 'ab');
    h.reset(at('other'));
    assert.equal(h.undo(), null);
    assert.equal(h.redo(), null);
  });

  test('it keeps the last few hundred steps, not every one', () => {
    const h = new TextHistory(at(''));
    for (let i = 0; i < 1000; i++) h.record(at(String(i)), 'other');
    let n = 0;
    while (h.undo()) n++;
    assert.ok(n <= 500 && n >= 100, `${n} steps kept`);
  });
});
