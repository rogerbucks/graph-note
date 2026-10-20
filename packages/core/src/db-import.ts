// Importing from a database (editor spec §20, db_import_on_request; §21, settings_db_connections). The database is a
// SQLite file in the vault, so nothing is set up, no password is kept and nothing reaches the network. The core decides
// which files are databases and what an import writes. The host runs the query, only when the user presses Import.
// - An import is written into the note as a GQL block: a copy, as text. It keeps no live link: nothing in it runs again
//   on its own.
// - Each row of the things query is a thing. Its `id` column is its id, a `kind` column its kind, the rest properties.
// - Each row of the links query, when there is one, is a link: its `from`, `type` and `to` columns, the rest properties.
import type { Value } from '@thoughtknot/graph-spec';
import { gqlBlock } from './export-data-gql.ts';
import { oneLine } from './export-data-model.ts';
import type { DataLink, DataThing } from './export-data-model.ts';
import { saidDate } from './export-frame.ts';

/** Whether a vault file is a SQLite database Import can read, by its ending: .sqlite, .sqlite3 or .db. */
export const isDbFile = (path: string): boolean => /\.(sqlite3?|db)$/i.test(path);

/** A row a query returned: each column's value, by the column's name. */
export type DbRow = Record<string, unknown>;

// a kind and a link's type as the profile reads one
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A column's value as a note can hold it; null for none. A date is its ISO text, anything else its JSON. */
function valueOf(v: unknown): Value | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : String(v);
  // a blob, such as an image, has no text a note can hold, so it is left out
  if (v instanceof Uint8Array) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  try {
    return JSON.stringify(v) ?? null;
  } catch {
    return null;
  }
}

/** A column's value as the text of an id, a kind or a link's type. It is empty for none, or for no plain value. */
function cell(v: unknown): string {
  const value = valueOf(v);
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

/** A row's columns, but those named in `skip`, as properties: a column with no value is left out. */
function propsOf(row: DbRow, skip: string[]): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const [k, v] of Object.entries(row)) {
    const value = valueOf(v);
    if (!skip.includes(k) && NAME.test(k) && value !== null) out[k] = value;
  }
  return out;
}

/** An import: the block to write, or why nothing is written. */
export type DbImported = { block: string } | { refused: string };

/**
 * The rows of an import as one GQL block of graph `graph`, fenced as a note holds it. Its comment says which file it came
 * from, and when. It is refused, writing nothing, for a row with no id or two rows with
 * one id. It is refused for a kind or a link's type that is not a name. It is refused for a link to a thing the things
 * query did not return.
 */
export function importedBlock(
  graph: string,
  things: DbRow[],
  links: DbRow[],
  info: { file: string; date: string },
): DbImported {
  if (!NAME.test(graph)) return { refused: `${graph} is not a graph name: use letters, digits and _` };
  const data: DataThing[] = [];
  const ids = new Set<string>();
  for (const [i, row] of things.entries()) {
    const key = cell(row.id);
    if (!key) return { refused: `Row ${i + 1} of the things has no id column` };
    if (ids.has(key)) return { refused: `Two rows of the things have the id ${key}` };
    ids.add(key);
    const kind = cell(row.kind);
    if (kind && !NAME.test(kind))
      return { refused: `The kind ${kind} of ${key} is not a name: use letters, digits and _` };
    data.push([key, kind ? [kind] : [], propsOf(row, ['id', 'kind'])]);
  }
  const joined: DataLink[] = [];
  for (const [i, row] of links.entries()) {
    const [from, type, to] = [cell(row.from), cell(row.type), cell(row.to)];
    if (!from || !to || !type) return { refused: `Row ${i + 1} of the links needs from, type and to columns` };
    if (!NAME.test(type)) return { refused: `The link type ${type} is not a name: use letters, digits and _` };
    for (const end of [from, to])
      if (!ids.has(end)) return { refused: `A link names ${end}, which the things query did not return` };
    joined.push([from, type, to, propsOf(row, ['from', 'type', 'to'])]);
  }
  const written = gqlBlock({ graph, things: data, links: joined }, { note: '', date: info.date }).split('\n');
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  // the exported comment gives way to one saying it is a copy from the database file, linked to nothing
  written[1] = `// Imported from ${oneLine(info.file)} on ${saidDate(info.date)}: ${count(data.length, 'thing')} and ${count(joined.length, 'link')}, a copy that is not kept in step.`;
  return { block: `\`\`\`gql\n${written.join('\n')}\`\`\`` };
}

/** Note `note` with `block` added at its end, after a blank line. */
export function withImport(note: string, block: string): string {
  // the blank lines at its end are counted back from the end, one pass: never a search that could start at each one
  let end = note.length;
  while (end && note[end - 1] === '\n') end--;
  const body = note.slice(0, end);
  return body ? `${body}\n\n${block}\n` : `${block}\n`;
}
