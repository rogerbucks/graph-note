// The types of the parts of sql.js the import uses (spec §20, db_import_on_request). sql.js ships none of its own.
// The engine's WebAssembly is bundled into main.js by esbuild's binary loader, so it is never fetched.
declare module 'sql.js' {
  /** One SQLite database, held in memory. */
  export interface Database {
    /** Runs `sql`, giving back each statement's columns and rows. */
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    /** Lets the memory go. */
    close(): void;
  }
  /** The engine, once loaded. */
  export interface SqlJs {
    Database: new (bytes?: Uint8Array) => Database;
  }
  /** Loads the engine from the WebAssembly given, never from the network. */
  export default function initSqlJs(config: { wasmBinary: Uint8Array }): Promise<SqlJs>;
}

declare module 'sql.js/dist/sql-wasm-browser.wasm' {
  /** The engine's WebAssembly, as bytes. */
  const bytes: Uint8Array;
  export default bytes;
}
