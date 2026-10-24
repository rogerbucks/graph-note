// The graph mesh, as the core's entry exports it (editor spec §27 to §30): its store, history, renames, schema moves,
// certainty drawn and type suggestions. Kept apart from index.ts so each file stays short.
export { MeshIndex, memoryBackend, noteRows, PAGE_MOST, sqliteBackend } from './mesh-index.ts';
export type {
  BetweenRow,
  Found as MeshFound,
  GroupRow,
  LinkRow,
  MeshBackend,
  NoteRows,
  Page,
  Span as SourceSpan,
  SqlEngine,
  ThingRow,
} from './mesh-index.ts';
export { MeshHistory, type LogEntry, type LogKind } from './mesh-history.ts';
export { renameAcross, type NotRewritten, type RenameAcross } from './rename-across.ts';
export { schemaMove, schemaVersions, type SchemaMove } from './schema-version-moves.ts';
export { CERTAINTY_LEVELS, CERTAINTY_LOOKS, certaintyLevel } from './certainty-drawn.ts';
export type { CertaintyLevel, CertaintyLook } from './certainty-drawn.ts';
export { typeSuggestions, TYPE_SUGGESTER, withSuggestion } from './type-suggestion.ts';
export type { CloserLook, SuggestionLimits, TypeSuggestion } from './type-suggestion.ts';
