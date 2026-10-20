// A box drawn under a suggested name (spec §4, unnamed_drawn_suggested; Roger, 10 Oct 2026). It is a thing written
// without a name, drawn under the name suggested for it until that is written. Here are where it is written in the
// block being edited, and what its details say of it. Here too is the one-click fix that writes the name, as an edit
// one undo takes back.
import { spanOf, word } from '@thoughtknot/core';
import type { Details, NoteReading } from '@thoughtknot/core';
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

/**
 * The name the thing just after `place`'s ( in the block as typed is suggested now, in the note as it is now (§4).
 * Another block can have changed it since the card was drawn. Undefined when the thing there is no longer without a
 * name.
 */
function nameNow(now: NoteReading, graph: string, place: { line: number; character: number }, text: string) {
  const box = now.graphs
    .get(graph)
    ?.boxes.find(
      (b) =>
        b.suggested?.line === place.line &&
        b.suggested.character === place.character &&
        now.texts[b.suggested.block] === text,
    );
  return box?.key;
}

/** What screen readers hear of a box: its kind and text, and that its name is only suggested, when it is. */
export const boxLabel = (box: { key: string; kind: string; text: string; suggested?: object }): string =>
  box.suggested
    ? word('suggested.label', { text: box.kind ? `${box.kind}: ${box.text}` : box.text, name: box.key })
    : box.kind
      ? `${box.kind}: ${box.text}`
      : box.text;

/**
 * In a box's details, its suggested name, said by a sign and in words. While its block is edited in place, it also
 * gives the fix that writes the name after its (. Outside edit mode nothing can be written, so it says how to write it.
 */
export function showSuggested(
  el: HTMLElement,
  reading: NoteReading,
  graph: string,
  d: Details,
  ed: Editing | undefined,
): void {
  const drawn = d.suggested?.suggested;
  if (!drawn) return;
  const text = ed?.session?.text;
  const place = text === undefined ? undefined : unnamedPlace(reading, graph, d.key, text);
  // the name as the note suggests it now, never as the card drew it: another block can have taken that name since (§4)
  const name =
    ed?.session && place && text !== undefined ? nameNow(ed.session.current(), graph, place, text) : undefined;
  const row = el.createDiv({ cls: 'thoughtknot-suggested' });
  row.createSpan({ text: word('suggested.says', { name: name ?? drawn }) });
  if (!ed || text === undefined || !place || !name || !spanOf(text, { thing: name }, place)) {
    row.createSpan({ cls: 'thoughtknot-fix', text: word('suggested.edit') });
    return;
  }
  const title = word('suggested.add', { name });
  const status = row.createSpan({ cls: 'thoughtknot-fix', attr: { role: 'status' } });
  // the text as it is when pressed: the details are redrawn only once typing stops, so what was typed since is kept
  button(row, title, 'pencil', () => status.setText(writeName(ed, graph, name, place)), title);
}

/**
 * Writes a suggested name after the thing's ( in the text being edited, as it is now. It writes nothing, and says why,
 * when the thing there has a name by now or is no longer there. It does the same when the thing is suggested another
 * name by now. The note checks the name again as it is written (§4).
 */
function writeName(ed: Editing, graph: string, name: string, place: { line: number; character: number }): string {
  const text = ed.session?.text;
  if (!ed.session || text === undefined) return word('suggested.not-editing');
  const at =
    text
      .split('\n')
      .slice(0, place.line)
      .reduce((n, l) => n + l.length + 1, 0) + place.character;
  if (text[at - 1] === '(' && /[A-Za-z_]/.test(text[at] ?? '')) return word('suggested.has-name');
  if (!spanOf(text, { thing: name }, place)) return word('suggested.moved');
  const now = nameNow(ed.session.current(), graph, place, text);
  if (now !== name) return word('suggested.renamed', { name: now ?? word('suggested.another') });
  ed.replace(text.slice(0, at) + name + text.slice(at));
  return '';
}
