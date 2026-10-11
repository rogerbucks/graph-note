// The host-free core of the graph note editor (spec §10). It imports no host: no obsidian, no vscode.
export { gqlBlocks, gqlSpans, graphOfBlock, isSharedSchema, namesSharedSchema, styleOf } from './blocks.ts';
export { readNote } from './drawing.ts';
export { blockItems } from './block-items.ts';
export { hops } from './estimates.ts';
export { replaceBlock, insertBlockAfter, History } from './store.ts';
export type { BlockRef, WriteResult } from './store.ts';
export type { Span } from './blocks.ts';
export type { Block, Box, Link, GraphDrawing, Problem, NoteReading } from './note-reading.ts';
export { layoutSource, drawingSource, STYLE } from './layout.ts';
export { explain, distance } from './estimates.ts';
export type { Estimate } from './estimates.ts';
export { themed, choose, sizeOf, fixed, withoutColorMix, hueColour } from './theme.ts';
export { draw, directions, chosen, details, linkDetails } from './render.ts';
export { PALETTES, THEME_COLOURS, fixedPalette } from './palette.ts';
export type { Palette, ThemeColours } from './palette.ts';
export { readStyle, outsideOf, lookOf, legendOf } from './style.ts';
export type { StyleReading } from './style.ts';
export { FORMATS, LINES, NUDGE_WORDS, OUTSIDE, STYLE_HUES } from './style-graph.ts';
export type {
  Frame,
  LegendEntry,
  LineStyle,
  LinkTarget,
  Look,
  Nudge,
  NudgeWord,
  Outside,
  Show,
  Shown,
  StyleAt,
  StyleGraph,
  StyleScope,
  StyleTarget,
  TextFormat,
  ThingLook,
  ViewStyle,
} from './style-graph.ts';
export { nudgedSource, nudgedDrawing } from './style-source.ts';
export { styleEdit } from './style-edit.ts';
export type { LookWrite, NudgeWrite, ShownWrite, StyleChange, StyleEdit } from './style-edit.ts';
export { loadEngine } from './engine.ts';
export type { Engine, Drawn, Direction, Details, LinkDetail, LinkDetails } from './render.ts';
export { LAYOUT_LIMITS, PAGE_LIMITS, READ_LIMITS, textTooLarge, tooLarge } from './layout-limits.ts';
export type { LayoutLimits, ReadLimits, Refusal } from './layout-limits.ts';
export { LayoutRunner, TIMEOUTS_BEFORE_STOPPING, inThreadPort, serveLayouts } from './layout-worker.ts';
export type {
  Clock,
  LayoutPort,
  LayoutReply,
  LayoutRequest,
  LayoutScope,
  RunnerOptions,
  Told,
} from './layout-worker.ts';
export { Zoom, MIN_SCALE, MAX_SCALE, STEP } from './zoom.ts';
export type { Mode, Size, View, ZoomEvent } from './zoom.ts';
export { tokenize, TOKEN_CLASSES } from './tokens.ts';
export type { Token, TokenClass } from './tokens.ts';
export { diagnostics, completions, readBack, textVersion, SEVERITY, KIND } from './help.ts';
export type { Diagnostic, CodeAction, CompletionItem, Range, Position, TextEdit } from './help.ts';
export { inlineCompletion, stepOver } from './autocomplete.ts';
export type { Inline, InlineKind } from './autocomplete.ts';
export { isDraft, lockBlock, reverseGuess } from './lock.ts';
export { PaneSession } from './pane.ts';
export { PathPlayer, PathRecorder, mergePathProblems, pathBlock, pathProblems, pathsOf } from './paths.ts';
export type { PathBlock, PathReading, PathStep, WalkedPath } from './paths.ts';
export { viewsOf, readingOf } from './views.ts';
export type { NamedView } from './views.ts';
export { VIEW_FORMS, VIEW_KINDS, VIEW_LIMITS, VIEW_NAMES, parseView } from './view-profile.ts';
export { viewBlock, viewQuery } from './view-write.ts';
export type { ViewArgs, ViewKind, ViewRefusal, ViewSpec } from './view-profile.ts';
export { evaluate } from './view-evaluate.ts';
export type { ViewResult } from './view-evaluate.ts';
export { DEPARTURES, underStrictness, toStandard, standardBlocks } from './strictness.ts';
export type { Converted, Departure, Strictness, StrictnessSettings } from './strictness.ts';
export { OPTIONS, DEFAULT_SETTINGS, settingsFrom, indentText, aiModel } from './settings.ts';
export type {
  AiModel,
  Choice as OptionChoice,
  CompanionSetting,
  ExportTheme,
  Indent,
  Option,
  Settings,
} from './settings.ts';
export { exportScope } from './export-scope.ts';
export type { ExportRequest, ExportScope } from './export-scope.ts';
export { EXPORT_FORMATS, PNG_MIN_SCALE, exportSvg, pngSize } from './export.ts';
export type { ExportFormat, ExportImage, ExportInfo, PngSize } from './export.ts';
export { saidDate } from './export-frame.ts';
export { exportPlan } from './export-plan.ts';
export type { ExportDecision, ExportGo, ExportPlanInput } from './export-plan.ts';
export { companionNote } from './export-note.ts';
export type { CompanionInfo } from './export-note.ts';
export { writeSafely } from './export-write.ts';
export type { SafeWrite, WriteOps } from './export-write.ts';
export type { Choice, PaneWrite } from './pane.ts';
export { completenessReport } from './completeness.ts';
export type { CompletenessReport, RuleReport } from './completeness.ts';
export {
  DeferredNotDeclared,
  declareDeferred,
  declareDeferredBlock,
  parkForLater,
  parked,
  parkedCount,
} from './deferred.ts';
export type { DeferredDeclared, Park, Parked, ParkedCount } from './deferred.ts';
export { nameFromText, nameSlug, nameStyleOf, nameWords, textFromName } from './name-suggestions.ts';
export type { GraphNames, NameStyle } from './name-suggestions.ts';
export { commaFor, commaInNote, colonFor, colonInNote } from './commas.ts';
export type { TextChange } from './commas.ts';
export {
  parseValue,
  propertiesOf,
  propertyNames,
  setProperty,
  renameProperty,
  spanOf,
  linkInBlock,
} from './inspector.ts';
export { listValues, makeList, addToList, removeFromList, linkedValues, listsOf } from './linked-list.ts';
export type { ListShape, ListValue, ListEdit } from './linked-list.ts';
export { hitAreas, nearby, TapCycle } from './hits.ts';
export { TextHistory } from './history.ts';
export type { Change, TextState } from './history.ts';
export type { HitAreas, Shape } from './hits.ts';
export type { PropType, Property, Target, Edit, Parsed } from './inspector.ts';
