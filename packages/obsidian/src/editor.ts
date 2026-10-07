// What is added for you in the note's own editor (spec §4, comma_added_for_you and colon_added_for_you): when a ( typed in
// a graph block starts the next pattern on a new line, and the line before is otherwise valid, the comma is added at the
// end of that line; when a ] typed closes a link type written without its colon that matches one type of the graph, the
// colon is added, with the type as the graph spells it. Each goes in as its own step, apart from the typing, so one undo
// takes back only it. The rules are the core's.
import { EditorView } from '@codemirror/view';
import { Transaction } from '@codemirror/state';
import { colonInNote, commaInNote } from '@graph-note/core';

/** The note editor's extension that adds the comma and the colon for you as you type. */
export const addForYou = EditorView.updateListener.of((u) => {
  if (!u.transactions.some((t) => t.isUserEvent('input.type'))) return;
  let caret = -1,
    typed = '';
  if (u.docChanged)
    u.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
      const t = inserted.toString();
      // Obsidian pairs brackets as they are typed: ( comes as (), with the caret between
      if (t === '(' || t === ']') [caret, typed] = [toB, t];
      else if (t === '()') [caret, typed] = [fromB + 1, '('];
    });
  else {
    // and a ] typed before the ] already there only moves the caret past it
    const from = u.startState.selection.main.head,
      head = u.state.selection.main.head;
    if (head === from + 1 && u.state.doc.toString()[from] === ']') [caret, typed] = [head, ']'];
  }
  if (caret < 0) return;
  const note = u.state.doc.toString();
  let change: { from: number; to?: number; insert: string } | null = null,
    event = '';
  if (typed === '(') {
    const at = commaInNote(note, caret);
    if (at !== null) [change, event] = [{ from: at, insert: ',' }, 'input.comma'];
  } else {
    const c = colonInNote(note, caret);
    if (c) [change, event] = [{ from: c.from, to: c.to, insert: c.text }, 'input.colon'];
  }
  if (!change) return;
  const view = u.view,
    doc = u.state.doc,
    changes = change;
  // an editor may not be changed while it is updating: make the change straight after, if nothing else changed meanwhile
  window.setTimeout(() => {
    if (view.state.doc !== doc) return;
    view.dispatch({ changes, annotations: Transaction.userEvent.of(event) });
  }, 0);
});
