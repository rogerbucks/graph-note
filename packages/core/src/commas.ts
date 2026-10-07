// The comma added for you (editor spec §4, comma_added_for_you): once the next pattern starts on a new line and the line
// before is otherwise valid, the comma that parts them is added at the end of that line. The reader would read the line
// break as the comma anyway (format spec §3); adding it keeps the text plain GQL for every other reader.
import gs from '@graph-note/graph-spec';
import { gqlSpans, graphOfBlock } from './drawing.ts';

/**
 * Where to add the comma after a ( was typed just before `caret` in a block's text — the index in the text, just after
 * the pattern on the line before — or null when none is wanted: the ( is not the first thing on its line, the line before
 * is not a complete pattern, already ends with a comma, or the block up to it is not valid.
 */
export function commaFor(text: string, caret: number): number | null {
  if (text[caret - 1] !== '(') return null;
  const lineStart = text.lastIndexOf('\n', caret - 2) + 1;
  if (text.slice(lineStart, caret - 1).trim() || lineStart === 0) return null;
  // the line before, skipping blank lines and comment lines
  let end = lineStart - 1;
  while (end >= 0) {
    const start = text.lastIndexOf('\n', end - 1) + 1,
      line = text.slice(start, end).trim();
    if (line && !line.startsWith('//')) {
      const code = text.slice(start, end).trimEnd();
      if (!code.endsWith(')')) return null;
      return gs.checkSyntax(text.slice(0, start + code.length)) === null ? start + code.length : null;
    }
    if (start === 0) return null;
    end = start - 1;
  }
  return null;
}

/** The same, in a whole note: where to add the comma after a ( typed just before `caret`, or null outside a graph block. */
export function commaInNote(note: string, caret: number): number | null {
  const lineOf = (pos: number) => note.slice(0, pos).split('\n').length - 1;
  const line = lineOf(caret);
  const span = gqlSpans(note).find((s) => s.open < line && line < s.close);
  if (!span || !graphOfBlock(span.text)) return null;
  const start =
    note
      .split('\n')
      .slice(0, span.open + 1)
      .join('\n').length + 1; // the block's first character
  const at = commaFor(span.text, caret - start);
  return at === null ? null : start + at;
}
