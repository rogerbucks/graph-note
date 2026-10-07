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

/** An edit to a text: the characters from `from` up to `to` replaced by `text`. */
export interface TextChange {
  from: number;
  to: number;
  text: string;
}

/** The text with strings and comments blanked, so positions hold and their contents never match. */
const blank = (text: string) =>
  text
    .replace(/'(?:[^'\\\n]|\\.)*'?/g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

/** The relationship types a graph's text knows: written with their colon, or declared by an ElementType. */
function typesIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of blank(text).matchAll(/-\[\s*:\s*([A-Za-z_]\w*)/g)) out.add(m[1] ?? '');
  for (const m of text.matchAll(/ElementType\s*\{([^{}]*)\}/g)) {
    const name = /\bname:\s*'([^']*)'/.exec(m[1] ?? '')?.[1];
    if (name && /\bkind:\s*'edge'/.test(m[1] ?? '')) out.add(name);
  }
  return out;
}

/**
 * The colon added for you (spec §4, colon_added_for_you): after a ] typed just before `caret` closes a link type written
 * without its colon, the change that writes the colon and the type as the graph spells it — when exactly one type the
 * graph knows so far matches, ignoring case. `earlier` holds the graph's blocks before this one. Null otherwise: a first
 * use, case-only twins, a query, or a ] inside a string or a comment.
 */
export function colonFor(text: string, caret: number, earlier: string[] = []): TextChange | null {
  if (text[caret - 1] !== ']') return null;
  const graph = graphOfBlock(text);
  const firstLine = text.split('\n').find((l) => l.trim()) ?? '';
  if (!graph || /·\s*QUERY\b/.test(firstLine)) return null;
  const before = blank(text.slice(0, caret));
  const m = /-\[\s*([A-Za-z_]\w*)\s*\]$/.exec(before);
  if (!m || m.index === undefined) return null;
  const written = m[1] ?? '',
    from = m.index + m[0].indexOf(written, 2);
  const known = new Set(
    [...earlier.filter((b) => graphOfBlock(b) === graph), text.slice(0, from)].flatMap((t) => [...typesIn(t)]),
  );
  const found = [...known].filter((t) => t.toLowerCase() === written.toLowerCase());
  return found.length === 1 ? { from, to: from + written.length, text: `:${found[0]}` } : null;
}

/** The same, in a whole note: the change that adds the colon after a ] typed just before `caret`, or null outside a graph block. */
export function colonInNote(note: string, caret: number): TextChange | null {
  const line = note.slice(0, caret).split('\n').length - 1;
  const spans = gqlSpans(note);
  const at = spans.findIndex((s) => s.open < line && line < s.close);
  const span = spans[at];
  if (!span || !graphOfBlock(span.text)) return null;
  const start =
    note
      .split('\n')
      .slice(0, span.open + 1)
      .join('\n').length + 1;
  const e = colonFor(
    span.text,
    caret - start,
    spans.slice(0, at).map((s) => s.text),
  );
  return e ? { from: start + e.from, to: start + e.to, text: e.text } : null;
}
