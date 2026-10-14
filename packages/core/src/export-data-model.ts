// The data a data export holds, and the kinds of value in it (editor spec §16, export_data_formats, export_lossless): the
// things and links as the reader read them, each value one of the five kinds the document profile reads — a text, a
// number, a truth value, a day or an instant — so each format writes a value in a way that reads back as itself.
import gs from '@graph-note/graph-spec';
import type { Value } from '@graph-note/graph-spec';

/** One thing exported: its id, its kinds in the order written, and its properties, its id among them. */
export type DataThing = [id: string, kinds: string[], properties: Record<string, Value>];

/** One link exported: the thing it is from, its type, the thing it is to, and its properties. */
export type DataLink = [from: string, type: string, to: string, properties: Record<string, Value>];

/** The data an export holds: the graph's name, the view's when it is a view, the things, then the links between them. */
export interface ExportedData {
  graph: string;
  view?: string;
  things: DataThing[];
  links: DataLink[];
  /**
   * Only for a view exported with its faded context (view_export_stays_view): what is outside the view, things by id
   * and links by their place in `links`. Each format marks them so, and reads back the same things and links.
   */
  faded?: { things: string[]; links: number[] };
  /**
   * Only when a thing or link it holds has a note (editor spec §24, note_standard): each note's text as the reader read
   * it, things' by id and links' by their place in `links`. A format with comments keeps them; CSV leaves them out.
   */
  notes?: { things: [id: string, text: string][]; links: [at: number, text: string][] };
}

/** Where the data came from, as a format that can say so says it: the note's path and the day, `YYYY-MM-DD`. */
export interface DataInfo {
  note: string;
  date: string;
}

/** The kinds of value the document profile reads (§3). */
export type ValueKind = 'text' | 'number' | 'boolean' | 'date' | 'datetime';

/** The kind of a value read from a note; throws for anything the profile does not read, so nothing is written wrongly. */
export function kindOf(v: Value): ValueKind {
  if (typeof v === 'string') return 'text';
  if (typeof v === 'number' && Number.isFinite(v)) return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (v instanceof gs.GTime) return v.kind;
  throw new Error(`${JSON.stringify(v)} is not a value a note can hold, so it cannot be exported`);
}

/** A number as text that reads back as the same number, -0 among them. */
export const numberText = (n: number): string => (Object.is(n, -0) ? '-0' : String(n));

/** A day or an instant as ISO 8601 writes it: a day as it is, an instant in UTC with its Z. */
export const timeText = (t: { kind: 'date' | 'datetime'; s: string }): string =>
  t.kind === 'datetime' ? `${t.s}Z` : t.s;

/** Whether a character is a control character, or a line or paragraph separator: one that would break a line, or hide in one. */
const breaks = (c: string) => {
  const code = c.charCodeAt(0);
  return code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029;
};

/** One line: each line break, tab or other control character in `text` made a space, for a comment or a note's path. */
export const oneLine = (text: string): string => [...text].map((c) => (breaks(c) ? ' ' : c)).join('');
