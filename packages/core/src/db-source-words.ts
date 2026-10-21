// The words of Import from a database (editor spec §20, §21). They are in UK English (editor spec §42,
// words_catalogue). source-words.ts keeps them with every other word.

/** The import dialog's words, by key, in UK English. */
export const DB_SOURCE_WORDS = {
  'db.none': 'No database file is in the vault: Import reads a .sqlite, .sqlite3 or .db file kept there.',
  'import.title': 'Import from a database',
  'import.file': 'Database file',
  'import.file.sentence': 'A SQLite file in this vault. It is read on this device, and nothing is sent anywhere.',
  'import.graph': 'Graph name',
  'import.graph.sentence': 'The name of the graph the rows are written as.',
  'import.things': 'Things query',
  'import.things.sentence':
    'Each row is a thing: its id column is its id, a kind column its kind, the rest properties.',
  'import.links': 'Links query',
  'import.links.sentence': 'Optional. Each row is a link: its from, type and to columns, the rest properties.',
  'import.copy': 'The rows are written into this note as text. Nothing stays linked to the database.',
  'import.run': 'Import',
  'import.cancel': 'Cancel',
  'import.too-many': 'The query gave more than {most} rows. Narrow it with where or limit.',
  'import.done': 'Imported {graph} from {file} into {note}.',
  'import.failed': 'The import from {file} failed, so nothing was written: {why}',
  // why the rows cannot be written, said as the {why} above (db-import.ts)
  'import.not-graph-name': '{graph} is not a graph name: use letters, digits and _',
  'import.no-id': 'Row {row} of the things has no id column',
  'import.same-id': 'Two rows of the things have the id {id}',
  'import.kind-not-name': 'The kind {kind} of {id} is not a name: use letters, digits and _',
  'import.link-columns': 'Row {row} of the links needs from, type and to columns',
  'import.type-not-name': 'The link type {type} is not a name: use letters, digits and _',
  'import.link-unknown': 'A link names {id}, which the things query did not return',
} as const;
