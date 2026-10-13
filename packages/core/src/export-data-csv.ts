// The data as CSV (editor spec §16, export_data_formats, export_lossless): one table, as RFC 4180 writes it, records ending
// at CRLF. Its header names six columns — kind, id, labels, from, type, to — then each property with the kind of its
// values, `size:number`, a column for each kind a property's values come in. A row is a thing (its id and its kinds,
// joined by `;`) or a link (its from, type and to), things first, each in the order written. So it reads back exactly:
// - a property a row does not have is an empty cell; an empty text is `""`, quoted, so the two are told apart;
// - a text a spreadsheet would run as a formula, one starting with =, +, -, @, a tab or a carriage return, is guarded by
//   an apostrophe before it, as is one that starts with an apostrophe already; a reader takes one apostrophe off;
// - a number is written as it reads back, -0 too; a truth value as true or false; a day as YYYY-MM-DD; an instant in UTC.
import type { Value } from '@graph-note/graph-spec';
import { kindOf, numberText, timeText } from './export-data-model.ts';
import type { ExportedData, ValueKind } from './export-data-model.ts';

const FIXED = ['kind', 'id', 'labels', 'from', 'type', 'to'];
// the first characters a spreadsheet takes as the start of a formula, and the guard itself
const GUARDED = /^[=+\-@\t\r']/;

/** A cell as RFC 4180 writes it: quoted when it holds a comma, a quote, a line break or nothing, its quotes doubled. */
function cell(text: string, empty = false): string {
  if (text === '') return empty ? '""' : '';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A text as a cell: guarded where a spreadsheet would run it, and quoted when empty, so it is never a missing value. */
const textCell = (text: string) => cell(GUARDED.test(text) ? `'${text}` : text, true);

/** A value as a cell. */
function valueCell(v: Value, kind: ValueKind): string {
  if (kind === 'text') return textCell(v as string);
  if (kind === 'number') return numberText(v as number);
  if (kind === 'boolean') return v ? 'true' : 'false';
  return timeText(v as { kind: 'date' | 'datetime'; s: string });
}

/** The data as one CSV table, with its header. */
export function csvText(data: ExportedData): string {
  // each property's column for each kind of value it holds, in the order first met, things before links
  const columns = new Map<string, { key: string; kind: ValueKind }>();
  const columnOf = (key: string, v: Value) => {
    const kind = kindOf(v),
      name = `${key}:${kind}`;
    if (!columns.has(name)) columns.set(name, { key, kind });
    return name;
  };
  const rows = [
    ...data.things.map(([id, kinds, props]) => ({
      fixed: ['thing', textCell(id), kinds.join(';'), '', '', ''],
      props,
    })),
    ...data.links.map(([from, type, to, props]) => ({
      fixed: ['link', '', '', textCell(from), type, textCell(to)],
      props,
    })),
  ].map(({ fixed, props }) => {
    const cells = new Map<string, string>();
    for (const [key, v] of Object.entries(props)) {
      if (key === 'id' && fixed[0] === 'thing') continue; // the id has its own column
      cells.set(columnOf(key, v), valueCell(v, kindOf(v)));
    }
    return { fixed, cells };
  });
  const names = [...columns.keys()];
  const lines = [
    [...FIXED, ...names.map((n) => cell(n))].join(','),
    ...rows.map(({ fixed, cells }) => [...fixed, ...names.map((n) => cells.get(n) ?? '')].join(',')),
  ];
  return lines.map((l) => `${l}\r\n`).join('');
}
