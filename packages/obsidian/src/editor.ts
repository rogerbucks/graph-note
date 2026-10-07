// The comma added for you in the note's own editor (spec §4, comma_added_for_you): when a ( typed in a graph block starts
// the next pattern on a new line, and the line before is otherwise valid, the comma is added at the end of that line. It
// goes in as its own step, apart from the typing, so one undo takes back the comma alone. The rule is the core's.
import { EditorView } from '@codemirror/view';
import { Transaction } from '@codemirror/state';
import { commaInNote } from '@graph-note/core';

export const addCommas = EditorView.updateListener.of((u) => {
  if (!u.docChanged || !u.transactions.some((t) => t.isUserEvent('input.type'))) return;
  let caret = -1;
  u.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => { if (inserted.toString() === '(') caret = toB; });
  if (caret < 0) return;
  const at = commaInNote(u.state.doc.toString(), caret);
  if (at === null) return;
  const view = u.view, doc = u.state.doc;
  // an editor may not be changed while it is updating: add the comma straight after, if nothing else changed meanwhile
  window.setTimeout(() => {
    if (view.state.doc !== doc) return;
    view.dispatch({ changes: { from: at, insert: ',' }, annotations: Transaction.userEvent.of('input.comma') });
  }, 0);
});
