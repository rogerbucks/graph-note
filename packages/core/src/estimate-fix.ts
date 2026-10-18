// An estimated link's fix (spec §3, estimate_never_written). Accepting the estimate is its problem's own fix, the one
// the editor's fix bar offers (`diagnostics`). It is found at the estimate's `span`, where the path itself writes the
// misspelt word. It is never the same word in a text, or another link's, on its line. So accepting from the drawing
// writes exactly what the fix bar would, and the editor can select the word there. Host-free: the host writes the edit,
// into the text being edited or into the note.
import { diagnostics } from './help.ts';
import type { CodeAction, Range } from './help.ts';
import type { NoteReading } from './note-reading.ts';

/** An estimate's fix: the block it is written in, where its misspelt word is there, and the fix that accepts it. */
export interface EstimateFix {
  /** The block (index in the note) the estimate is written in. */
  block: number;
  /** Where the misspelt name or type is written in that block, on one line. */
  range: Range;
  /** The problem's own preferred fix: the word changed to what it was taken to mean. */
  fix: CodeAction;
}

/**
 * The fix that accepts estimate `index` of `graph`, when `text` is the block it is written in, with its edits for
 * `uri`. Null when `text` is not that block as read, or the estimate's word could not be placed. So a fix never writes
 * over anything but the word it names.
 */
export function estimateFix(
  reading: NoteReading,
  graph: string,
  index: number,
  text: string,
  uri: string,
): EstimateFix | null {
  const e = reading.graphs.get(graph)?.estimates[index],
    at = e?.span;
  if (!e || !at || reading.texts[e.block] !== text) return null;
  // its problem's diagnostic is the one at the very place of the word, which the reader found in the path itself
  for (const d of diagnostics(reading, graph, e.block, text, uri)) {
    const { start, end } = d.range;
    if (start.line !== at.line || end.line !== at.line || start.character !== at.character || end.character !== at.end)
      continue;
    const fix = d.data.fixes.find((f) => f.isPreferred);
    if (fix) return { block: e.block, range: d.range, fix };
  }
  return null;
}
