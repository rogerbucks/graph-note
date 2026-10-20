// Reading a SQLite database file from the vault (spec §20, db_import_on_request). sql.js opens the file's bytes in
// memory, on this device. Nothing reaches the network: the engine's WebAssembly is inside main.js. The file is never
// written: the database is opened query-only, and the copy in memory is let go once the queries have run.
import initSqlJs from 'sql.js';
import type { SqlJs } from 'sql.js';
import wasmBinary from 'sql.js/dist/sql-wasm-browser.wasm';
import { word } from '@thoughtknot/core';
import type { DbRow } from '@thoughtknot/core';

/** The most rows one query may give back, so a mistaken query cannot fill the note. */
export const MOST_ROWS = 10_000;

// the engine is loaded the first time Import is pressed, then kept
let engine: Promise<SqlJs> | undefined;

/** Runs each query on the database in `bytes`, in turn, and gives back each one's rows. A query that writes fails. */
export async function sqliteQuery(bytes: ArrayBuffer, queries: string[]): Promise<DbRow[][]> {
  engine ??= initSqlJs({ wasmBinary });
  const sql = await engine.catch((e: unknown) => {
    engine = undefined;
    throw e;
  });
  const db = new sql.Database(new Uint8Array(bytes));
  try {
    db.exec('PRAGMA query_only = ON');
    return queries.map((query) => rowsOf(db.exec(query)));
  } finally {
    db.close();
  }
}

/** The rows of a query's last statement, each a column's value by the column's name. */
function rowsOf(results: { columns: string[]; values: unknown[][] }[]): DbRow[] {
  const last = results.at(-1);
  if (!last) return [];
  if (last.values.length > MOST_ROWS) throw new Error(word('import.too-many', { most: MOST_ROWS }));
  return last.values.map((values) => Object.fromEntries(last.columns.map((c, i) => [c, values[i]])));
}
