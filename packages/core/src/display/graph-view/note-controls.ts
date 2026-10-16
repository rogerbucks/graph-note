// Adding, changing and removing a note from the details (editor spec §24, note_add): while the block is edited in place,
// the details of a thing or link offer to add its note, or to change or remove the one it has. The core's `setNote`
// does the writing — the `///` lines above the thing or link, nothing else in the block changing — and the block is
// replaced through the editor, so the editor's own undo takes the note away or brings it back. A refusal is said in
// words beside the controls, nothing written.
import { linkInBlock, setNote } from '@graph-note/core';
import type { NoteReading, Target, ThingNote } from '@graph-note/core';

/** What the controls need of the editor open on the card. */
export interface NoteEditing {
  /** The thing or link, as `setNote` finds it in the block being edited; null where it is not written there. */
  target: () => Target | null;
  /** The block as typed. */
  text: () => string;
  /** Replaces the block being edited with `text`. */
  replace: (text: string) => void;
}

/** A button with words, as the details' other offers are. */
const plain = (parent: HTMLElement, text: string, onClick: () => void): void => {
  parent.createEl('button', { text, attr: { type: 'button' } }).addEventListener('click', onClick);
};

/** The note controls for one thing or link: its buttons, and, while one is pressed, a field for the note's words. */
function controls(el: HTMLElement, note: ThingNote | undefined, edit: NoteEditing): void {
  const box = el.createDiv({ cls: 'graph-note-note-controls' }),
    said = box.createDiv({ cls: 'graph-note-note-said', attr: { role: 'alert' } }),
    body = box.createDiv();
  const write = (words: string | null): void => {
    const target = edit.target();
    if (!target) {
      said.setText('This is not written in the block being edited, so its note cannot be written here.');
      return;
    }
    const r = setNote(edit.text(), target, words);
    if (r.ok) edit.replace(r.text);
    else said.setText(r.reason);
  };
  const offer = (): void => {
    body.empty();
    const row = body.createDiv({ cls: 'graph-note-note-buttons' });
    plain(row, note ? 'Change the note' : 'Add a note', ask);
    if (note) plain(row, 'Remove the note', () => write(null));
  };
  const ask = (): void => {
    body.empty();
    const field = body.createEl('textarea', {
      cls: 'graph-note-note-field',
      attr: { 'aria-label': 'Note', rows: '4' },
    });
    field.value = note?.text ?? '';
    const row = body.createDiv({ cls: 'graph-note-note-buttons' });
    plain(row, 'Save note', () => write(field.value));
    plain(row, 'Cancel', offer);
    field.focus();
  };
  offer();
}

/**
 * The note controls for the thing or link `target` of `graph` in the details, `text` being the block as typed and
 * `replace` writing the block: the note it has now is the reading's, and a link is found among those written in the block.
 */
export function noteControls(
  el: HTMLElement,
  reading: NoteReading,
  graph: string,
  target: { thing: string } | { link: number },
  text: () => string,
  replace: (text: string) => void,
): void {
  const drawing = reading.graphs.get(graph),
    note =
      'thing' in target ? drawing?.boxes.find((b) => b.key === target.thing)?.note : drawing?.links[target.link]?.note;
  controls(el, note, {
    target: () => {
      if ('thing' in target) return target;
      const n = linkInBlock(reading, graph, target.link, text());
      return n < 0 ? null : { link: n };
    },
    text,
    replace,
  });
}
