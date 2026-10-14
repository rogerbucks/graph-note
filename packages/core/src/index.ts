// The host-free core of the graph note editor (spec §10). It imports no host: no obsidian, no vscode.
export { gqlBlocks, gqlSpans, graphOfBlock, isSharedSchema, namesSharedSchema, styleOf } from './blocks.ts';
export { readNote } from './drawing.ts';
export { blockItems } from './block-items.ts';
export { hops } from './estimates.ts';
export { replaceBlock, insertBlockAfter, History } from './store.ts';
export type { BlockRef, WriteResult } from './store.ts';
export type { Span } from './blocks.ts';
export type { Block, Box, Link, GraphDrawing, Problem, NoteReading, ThingNote } from './note-reading.ts';
export { layoutSource, drawingSource, STYLE } from './layout.ts';
export { explain, distance } from './estimates.ts';
export type { Estimate } from './estimates.ts';
export { estimateFix } from './estimate-fix.ts';
export type { EstimateFix } from './estimate-fix.ts';
export { themed, choose, sizeOf, fixed, withoutColorMix, hueColour } from './theme.ts';
export { draw, directions, chosen, details, linkDetails } from './render.ts';
export { PALETTES, THEME_COLOURS, fixedPalette } from './palette.ts';
export type { Palette, ThemeColours } from './palette.ts';
export { readStyle, outsideOf, lookOf, legendOf } from './style.ts';
export type { StyleReading } from './style.ts';
export { ARROWHEADS, FORMATS, INLINE, LINES, NUDGE_WORDS, OUTSIDE, STYLE_HUES } from './style-graph.ts';
export type {
  ArrowheadsChoice,
  Arrows,
  Frame,
  InlineSwitch,
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
export { nudgedSource, nudgedDrawing, styledDrawing } from './style-source.ts';
export { arrowsShown } from './arrows.ts';
export { INLINE_ROWS } from './inline-properties.ts';
export type { InlineProperties, PropertyRow } from './inline-properties.ts';
export { styleEdit } from './style-edit.ts';
export {
  DIAGRAM_TYPES,
  LARGE_GRAPH,
  diagramFor,
  diagramOffer,
  nearestType,
  shapeOf,
  suggestType,
  typeFits,
} from './types.ts';
export type { DiagramChoice, DiagramOffer, DiagramType, GraphShape, Suggestion, TypeFit } from './types.ts';
export { scrollsOneWay, tableOf, wayIn } from './types-table.ts';
export type { DiagramTable } from './types-table.ts';
export type { DiagramPlan } from './note-reading.ts';
export type { Diagram } from './style-graph.ts';
export type {
  ArrowsWrite,
  DiagramWrite,
  LookWrite,
  NudgeWrite,
  ShowWrite,
  ShownWrite,
  StyleChange,
  StyleEdit,
} from './style-edit.ts';
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
export { AcrossZoom } from './zoom-across.ts';
export type { Mode, Place, Size, View, ZoomEvent } from './zoom.ts';
export { MOVE_MS, READABLE_SCALE, Trail, coverOf, glideAt, linkGroups, pointerTo, sheetLimit } from './details-nav.ts';
export type { LinkGroup, Pointing, TrailStep } from './details-nav.ts';
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
export { addView, makeView } from './view-write.ts';
export type { ViewArgs, ViewKind, ViewRefusal, ViewSpec } from './view-profile.ts';
export { evaluate } from './view-evaluate.ts';
export type { ViewResult } from './view-evaluate.ts';
export { DEPARTURES, underStrictness, toStandard, standardBlocks } from './strictness.ts';
export type { Converted, Departure, Strictness, StrictnessSettings } from './strictness.ts';
export { OPTIONS, DEFAULT_SETTINGS, settingsFrom, indentText, aiModel } from './settings.ts';
export type {
  AiModel,
  AiUse,
  Choice as OptionChoice,
  CompanionSetting,
  ExportTheme,
  FocusDepthSetting,
  Indent,
  Option,
  Settings,
} from './settings.ts';
export { exportScope } from './export-scope.ts';
export type { ExportRequest, ExportScope } from './export-scope.ts';
export { EXPORT_FORMATS, PNG_MIN_SCALE, exportSvg, exportWithLayout, pngSize } from './export.ts';
export type { ExportFormat, ExportImage, ExportInfo, ExportLayout, PngSize } from './export.ts';
export { pageSvg, pngPages } from './export-pages.ts';
export type { PngPage } from './export-pages.ts';
export { DATA_FORMATS, dataText, exportedData, isDataFormat } from './export-data.ts';
export type { DataFormat } from './export-data.ts';
export type { DataInfo, ExportedData } from './export-data-model.ts';
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
export { acceptNameFirst } from './suggested-names.ts';
export { addThing, suggestName } from './add-thing.ts';
export type { NewThing, ThingAdded } from './add-thing.ts';
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
export { BIG_PROPOSAL, linkChange, makeProposal, provenanceLines, thingChange, valueGql } from './proposals.ts';
export type {
  ChangeGroup,
  ChangeInput,
  ChangeOp,
  Proposal,
  ProposalInput,
  ProposedChange,
  Proposer,
  ProposerKind,
  Provenance,
} from './proposals.ts';
export { NO_BASIS, basisOf } from './proposals-basis.ts';
export type { Stale } from './proposals-basis.ts';
export { MARK_WORDS } from './proposals-marks.ts';
export type { ChangeMark, MarkKind, Marks } from './proposals-marks.ts';
export { changeSetId } from './proposals-text.ts';
export type { Decision } from './proposals-text.ts';
export { ProposalReview } from './proposals-review.ts';
export { aiReady, confirmSend, prepareSend, sendPrepared } from './ai.ts';
export type {
  Confirmation,
  PreparedSend,
  SendAsk,
  SendDeps,
  SendRecord,
  SendRefused,
  SendResult,
  Transport,
  TransportReply,
  TransportRequest,
} from './ai.ts';
export { AI_PURPOSES, endpointProblem, modelChoices } from './ai-choice.ts';
export type { HostAi, ModelChoice } from './ai-choice.ts';
export type { ScopeChoice } from './ai-scope.ts';
export { noteWithProposal } from './ai-answer.ts';
export type { ChangeRow, DecideOptions, Person, ProposalShown, Reviewed, Which } from './proposals-shown.ts';
export { hitAreas, nearby, TapCycle, boundsOf, centres } from './hits.ts';
export { FADE, KEPT, FocusState, depthOf, edgesOf, estimateEdge, focusOf, highlightOf } from './focus.ts';
export type { FocusDepth, FocusEdge, FocusTarget, Kept } from './focus.ts';
export {
  FIND_LIMIT,
  LegendFilter,
  Untangle,
  emphasis,
  find,
  kindLegend,
  neighbourhood,
  neighbourhoodWords,
  nextAlong,
  pathWords,
  shortestPath,
} from './untangle.ts';
export type { Found, Layers, LegendItem, LegendState, PathFound } from './untangle.ts';
export { BUSY_HUB, foldsHiding } from './untangle-fold.ts';
export type { Folding } from './untangle-fold.ts';
export {
  LABEL_SCALE,
  SWITCH_NAMES,
  VIEW_SWITCHES,
  ViewState,
  labelsHidden,
  startingSwitches,
} from './view-switches.ts';
export type { Fold, ViewSwitch, ViewSwitches } from './view-switches.ts';
export { linksOf } from './style.ts';
export type { Links, OnOff, Routing } from './style-graph.ts';
export type { SwitchSetting } from './settings.ts';
export { TextHistory } from './history.ts';
export type { Change, TextState } from './history.ts';
export type { Bounds, HitAreas, Shape } from './hits.ts';
export type { PropType, Property, Target, Edit, Parsed } from './inspector.ts';
