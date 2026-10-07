// The host-free core of the graph note editor (spec §10). It imports no host: no obsidian, no vscode.
export {
  gqlBlocks,
  gqlSpans,
  readNote,
  graphOfBlock,
  isSharedSchema,
  namesSharedSchema,
  blockItems,
} from './drawing.ts';
export { hops } from './estimates.ts';
export { replaceBlock, insertBlockAfter, History } from './store.ts';
export type { BlockRef, WriteResult } from './store.ts';
export type { Block, Span, Box, Link, GraphDrawing, Problem, NoteReading } from './drawing.ts';
export { layoutSource, drawingSource, STYLE } from './layout.ts';
export { explain, distance } from './estimates.ts';
export type { Estimate } from './estimates.ts';
export { themed, choose, sizeOf, fixed, withoutColorMix } from './theme.ts';
export { loadEngine, draw, details, linkDetails } from './render.ts';
export type { Engine, Drawn, Details, LinkDetail, LinkDetails } from './render.ts';
export { Zoom, MIN_SCALE, MAX_SCALE, STEP } from './zoom.ts';
export type { Mode, Size, View, ZoomEvent } from './zoom.ts';
export { tokenize, TOKEN_CLASSES } from './tokens.ts';
export type { Token, TokenClass } from './tokens.ts';
export { diagnostics, completions, readBack, textVersion, SEVERITY, KIND } from './help.ts';
export type { Diagnostic, CodeAction, CompletionItem, Range, Position, TextEdit } from './help.ts';
export { isDraft, lockBlock, reverseGuess } from './lock.ts';
export { PaneSession } from './pane.ts';
export type { Choice, PaneWrite } from './pane.ts';
export { completenessReport } from './completeness.ts';
export type { CompletenessReport, RuleReport } from './completeness.ts';
export { commaFor, commaInNote } from './commas.ts';
export { parseValue, propertiesOf, propertyNames, setProperty, spanOf, linkInBlock } from './inspector.ts';
export { hitAreas, nearby, TapCycle } from './hits.ts';
export type { HitAreas, Shape } from './hits.ts';
export type { PropType, Property, Target, Edit, Parsed } from './inspector.ts';
