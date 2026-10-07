// The comma added for you (editor spec §4, comma_added_for_you): once the next pattern starts on a new line and the line
// before is otherwise valid, the comma that parts them is added at the end of that line. The reader would read the line
// break as the comma anyway (format spec §3); adding it keeps the text plain GQL for every other reader.
import gs from '@graph-note/graph-spec';

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
    const start = text.lastIndexOf('\n', end - 1) + 1, line = text.slice(start, end).trim();
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
