// A box drawn under a suggested name (spec §4, unnamed_drawn_suggested; Roger, 10 Oct 2026): a thing written without a
// name, drawn under the name suggested for it until that is written — where it is written in the block being edited,
// what its details say of it, and the one-click fix that writes the name, as an edit one undo takes back.
import { spanOf } from '@graph-note/core';
import type { Details, NoteReading } from '@graph-note/core';
import { button } from './view-bar';
import type { Editing } from './view-options';

/** The place just after the ( of a thing drawn under a suggested name, when `text` is the block it is written in. */
export function unnamedPlace(
  reading: NoteReading,
  graph: string,
  key: string,
  text: string,
): { line: number; character: number } | undefined {
  const box = reading.graphs.get(graph)?.boxes.find((b) => b.key === key);
  return box?.suggested && reading.texts[box.suggested.block] === text ? box.suggested : undefined;
}

/** What screen readers hear of a box: its kind and text, and that its name is only suggested, when it is. */
export const boxLabel = (box: { key: string; kind: string; text: string; suggested?: object }): string =>
  `${box.kind ? `${box.kind}: ${box.text}` : box.text}${box.suggested ? ` (suggested name ${box.key}, not yet written)` : ''}`;

/**
 * In a box's details, its suggested name, said by a sign and in words; and, while its block is edited in place, the fix
 * that writes the name after its (. Outside edit mode nothing can be written, so it says how to write it.
 */
export function showSuggested(
  el: HTMLElement,
  reading: NoteReading,
  graph: string,
  d: Details,
  ed: Editing | undefined,
): void {
  const name = d.suggested?.suggested;
  if (!name) return;
  const row = el.createDiv({ cls: 'graph-note-suggested' });
  row.createSpan({ text: `✎ Suggested name: ${name} — not written yet. ` });
  const text = ed?.session?.text;
  const place = text === undefined ? undefined : unnamedPlace(reading, graph, d.key, text);
  if (!ed || text === undefined || !place || !spanOf(text, { thing: d.key }, place)) {
    row.createSpan({ cls: 'graph-note-fix', text: 'Edit the block to add it, or write a name of your own.' });
    return;
  }
  const at =
    text
      .split('\n')
      .slice(0, place.line)
      .reduce((n, l) => n + l.length + 1, 0) + place.character;
  const title = d.suggested?.fixTitle ?? `Add the name ${name}`;
  button(row, title, 'pencil', () => ed.replace(text.slice(0, at) + name + text.slice(at)), title);
}
