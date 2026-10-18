// A fix's edits applied to text (spec §4, §8). It gives the text with the edits a problem's fix gives. The block
// editor's fix bar writes them so, and so does an estimated link's quick fix in the details. No DOM in it.
import type { Diagnostic } from '@thoughtknot/core';

/** The edits of a fix, by document, as a problem's fix gives them. */
export type FixChanges = Record<string, { range: Diagnostic['range']; newText: string }[]>;

/** The text with a fix's edits made, the last first so each place still holds. */
export function withFix(text: string, changes: FixChanges): string {
  const lines = text.split('\n');
  const offset = (p: { line: number; character: number }) =>
    lines.slice(0, p.line).reduce((a, l) => a + l.length + 1, 0) + p.character;
  const edits = Object.values(changes)
    .flat()
    .sort((a, b) => offset(b.range.start) - offset(a.range.start));
  let v = text;
  for (const e of edits) v = v.slice(0, offset(e.range.start)) + e.newText + v.slice(offset(e.range.end));
  return v;
}
