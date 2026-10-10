// The graph blocks of a note (spec §3): where each gql fenced block is, and what its graph line says — the graph it draws,
// whether it holds data or a schema, a shared schema or one that names a shared schema, or a graph line that cannot be read.
import gs from '@graph-note/graph-spec';
import type { Block, Problem } from './note-reading.ts';
import { N, S, trim } from './whitespace.ts';

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*gql\s*$/i;

/** A gql block's place in a note: its text (lines joined by \\n), the 0-based lines of its opening fence and of its closing one (the line count when unclosed). */
export interface Span {
  text: string;
  open: number;
  close: number;
}

/** Where each gql fenced block of a note is. An unclosed fence runs to the end, as Markdown reads it. */
export function gqlSpans(note: string): Span[] {
  const lines = note.split('\n').map((l) => l.replace(/\r$/, '')),
    out: Span[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i] ?? '');
    if (!open) continue;
    const mark = open[1] ?? '```',
      close = new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j] ?? '')) j++;
    out.push({ text: lines.slice(i + 1, j).join('\n'), open: i, close: j });
    i = j;
  }
  return out;
}

/** The gql fenced blocks of a note, in order, each with the note line (1-based) its fence opens on. */
export function gqlBlocks(note: string): Block[] {
  return gqlSpans(note).map((s) => ({ text: s.text, line: s.open + 1 }));
}

// the graph line, read with whitespace as GQL names it (§3), as the reader reads it
const GRAPH_OF = new RegExp(`^${S}*//${S}*graph:${S}*(${N}+)`),
  GRAPH_LINE = new RegExp(`^${S}*//${S}*graph:`),
  SHARED = new RegExp(`^${S}*//${S}*graph:[^\\n]*·${S}*SCHEMA${S}+${N}+`),
  NAMES_SHARED = new RegExp(`^${S}*//${S}*graph:[^\\n]*·${S}*schema${S}+${N}+`);

/** The graph a block names, or null. */
export const graphOf = (text: string): string | null => GRAPH_OF.exec(firstLine(text))?.[1] ?? null;

/** The first line of a text with anything on it, found line by line: a large block is never split whole to find it (§9). */
function firstLine(text: string): string {
  for (let at = 0; ;) {
    const end = text.indexOf('\n', at),
      line = end === -1 ? text.slice(at) : text.slice(at, end);
    if (trim(line)) return line;
    if (end === -1) return '';
    at = end + 1;
  }
}

const isGraphLine = (text: string) => GRAPH_LINE.test(firstLine(text));

/** The kind of a block, or null when it holds no data to draw: a query, an excerpt, a change set, or no graph line. */
export function dataKind(text: string): 'data' | 'schema' | null | Problem {
  try {
    const [, kind] = gs.header(text);
    return kind === 'data' || kind === 'schema' ? kind : null;
  } catch (e) {
    if (!isGraphLine(text)) return null;
    const p = e instanceof gs.ProfileError ? e : null;
    return {
      graph: null,
      block: -1,
      severity: 'error',
      line: p?.line ?? 1,
      message: p?.msg ?? 'the graph line cannot be read',
      fix: p?.fix ?? "start the block with '// graph: <name>'",
    };
  }
}

/** Whether a block is a shared schema (§5): its graph line says SCHEMA and its name. */
export const isSharedSchema = (text: string): boolean => SHARED.test(firstLine(text));

/** Whether a block's graph is typed by a shared schema it names: its graph line says "schema" and the schema's name. */
export const namesSharedSchema = (text: string): boolean => NAMES_SHARED.test(firstLine(text));

/** The graph a block draws: its name when it is a data block with a graph line, else null — a query, schema, excerpt or plain code. */
export function graphOfBlock(text: string): string | null {
  return dataKind(text) === 'data' ? graphOf(text) : null;
}
