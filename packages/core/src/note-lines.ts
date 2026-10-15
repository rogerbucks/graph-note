// The comment lines a thing or link owns (editor spec §24, note_comment): the lines of exactly three slashes (its note) and
// the //@ lines (its tags) directly above it, which an edit that takes the thing out takes out with it, and which no
// other thing may be left holding. Host-free; the one definition of what such a line is, as the reader reads it.
import { trim } from './whitespace.ts';

/** A note line: exactly three slashes, then a space or the line's end. */
export const NOTE = /^\/\/\/(?: |$)/;
/** A tag line: `//@ `, a key and a colon. */
export const TAG = /^\/\/@ [A-Za-z_][A-Za-z0-9_.-]*:/;

/** Whether a line is a note line or a tag line, as the reader reads it. */
export const isOwnedLine = (line: string): boolean => {
  const t = trim(line);
  return NOTE.test(t) || TAG.test(t);
};

/** The 0-based indexes of the run of note and tag lines directly above line `index` of `lines`, in order. */
export function ownedAbove(lines: readonly string[], index: number): number[] {
  const out: number[] = [];
  for (let i = index - 1; i >= 0 && isOwnedLine(lines[i] ?? ''); i--) out.unshift(i);
  return out;
}

/**
 * Where the run of note and tag lines directly above the line starting at `lineStart` of `text` begins, as an offset:
 * `lineStart` itself when there is none. An item taken out by its line takes the run from here.
 */
export function runStart(text: string, lineStart: number): number {
  let start = lineStart;
  while (start > 0) {
    const prev = text.lastIndexOf('\n', start - 2) + 1;
    if (!isOwnedLine(text.slice(prev, start - 1))) break;
    start = prev;
  }
  return start;
}
