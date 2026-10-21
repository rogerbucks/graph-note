// The host-free core of the graph note editor (spec §10). It imports no host: no obsidian, no vscode.
export { gqlBlocks, gqlSpans, graphOfBlock, isSharedSchema, namesSharedSchema, styleOf } from './blocks.ts';
export { readNote } from './drawing.ts';
export { blockItems } from './block-items.ts';
export { replaceBlock, insertBlockAfter, History } from './store.ts';
export type { BlockRef, WriteResult } from './store.ts';
export { historyLayer, layered, memoryStorage } from './note-storage.ts';
export { CORE_STORAGE } from './core-storage.ts';
export { CHANGE_WAITS, gatedFiles } from './plugin-files.ts';
export type { FilesOffer, ProposedNoteChange } from './plugin-files.ts';
export { notePath, noteVersion, refusal, REFUSED } from './note-storage.ts';
export type { ChangeLog, NoteStorage, StorageLayer, StoredChange } from './note-storage.ts';
export type { StoredNote, WriteOptions, WriteOutcome } from './note-storage.ts';
export { storageContract } from './storage-contract.ts';
export type { StorageCheck } from './storage-contract.ts';
export { DIRECTORY, workspaceStorage } from './workspace-storage.ts';
export type { WorkspaceFiles } from './workspace-storage.ts';
export type { Span } from './blocks.ts';
export type { Block, Box, Link, GraphDrawing, Problem, NoteReading, ThingNote } from './note-reading.ts';
export { layoutSource, drawingSource, STYLE } from './layout.ts';
export { explain, distance, hops } from './estimates.ts';
export type { Estimate } from './estimates.ts';
export { estimateFix } from './estimate-fix.ts';
export type { EstimateFix } from './estimate-fix.ts';
export { themed, choose, sizeOf, fixed, withoutColorMix, hueColour } from './theme.ts';
export { draw, directions, chosen, details, linkDetails } from './render.ts';
export { mirrored, inReadingDirection, shownAsRead } from './drawing-direction.ts';
export { PALETTES, THEME_COLOURS, fixedPalette } from './palette.ts';
export type { Palette, ThemeColours } from './palette.ts';
export { readStyle, outsideOf, lookOf, legendOf } from './style.ts';
export { lookTag, lookTags } from './look-tags.ts';
export { SHORTCUTS, SHORTCUT_PLACES } from './shortcuts.ts';
export type { Shortcut, ShortcutPlace } from './shortcuts.ts';
export { TOUR_STEPS, withExample } from './first-run.ts';
export type { TourStep } from './first-run.ts';
export type { StyleReading } from './style.ts';
export { ARROWHEADS, FLOW_MOTIONS, FORMATS, INLINE, LINES, NUDGE_WORDS, OUTSIDE, STYLE_HUES } from './style-graph.ts';
export type {
  ArrowheadsChoice,
  Arrows,
  Flow,
  FlowMotion,
  Frame,
  InlineSwitch,
  LegendEntry,
  LineStyle,
  LinkTarget,
  Picture,
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
export { FLOW_ICONS, flowFor, flowLegend, flowSaid, reversedLinks } from './link-flow.ts';
export type { FlowLegendEntry, FlowLink, Moving } from './link-flow.ts';
export { INLINE_ROWS } from './inline-properties.ts';
export type { InlineProperties, PropertyRow } from './inline-properties.ts';
export { PICTURE_MARK, PICTURE_SIZE, pictureFor, picturesFor } from './picture.ts';
export type { PictureBox } from './picture.ts';
export { imageFacts } from './image-facts.ts';
export type { ImageFacts, ImageFormat } from './image-facts.ts';
export { IMAGE_EXTENSIONS, imageLink, imagesOf, neverMoves } from './image-links.ts';
export type { ImageLink, NamedImage } from './image-links.ts';
export { IMAGE_LIMITS, LIMITS_SAID, REDUCED_WORDS, pastLimit, playRefusal, startOf } from './image-limits.ts';
export type { ImageAt, Start } from './image-limits.ts';
export { animationSaid } from './export-pictures.ts';
export type { LoadedImage, PictureLoad, UnreadImage } from './export-pictures.ts';
export { styleEdit } from './style-edit.ts';
export { DIAGRAM_TYPES, LARGE_GRAPH, diagramFor, diagramOffer, nearestType } from './types.ts';
export { pluginTypeOf, shapeOf, suggestType, typeFits } from './types.ts';
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
export { Zoom, MAX_SCALE, STEP } from './zoom.ts';
export { AcrossZoom } from './zoom-across.ts';
export type { Mode, Place, Size, View, ZoomEvent } from './zoom.ts';
export { MOVE_MS, READABLE_SCALE, Trail, coverOf, glideAt, linkGroups, pointerTo, sheetLimit } from './details-nav.ts';
export { linksSaid, thingSaid } from './details-said.ts';
export type { LinkGroup, Pointing, TrailStep } from './details-nav.ts';
export { tokenize, TOKEN_CLASSES } from './tokens.ts';
export type { Token, TokenClass } from './tokens.ts';
export { diagnostics, completions, readBack, textVersion, SEVERITY, KIND } from './help.ts';
export type { Diagnostic, CodeAction, CompletionItem, Range, Position, TextEdit } from './help.ts';
export { inlineCompletion, stepOver } from './autocomplete.ts';
export type { Inline, InlineKind } from './autocomplete.ts';
export { isDraft, lockBlock, reverseGuess } from './lock.ts';
export { schemaPicture } from './schema-picture.ts';
export { withStandardSchemas } from './standard-schemas.ts';
export type { SchemaPicture } from './schema-picture.ts';
export { PaneSession } from './pane.ts';
export { PathPlayer, PathRecorder, mergePathProblems, pathBlock, pathProblems, pathsOf } from './paths.ts';
export type { PathBlock, PathReading, PathStep, WalkedPath } from './paths.ts';
export { DEFAULT_PACE, PATH_PACES, PathAutoplay, paceSaid } from './path-play.ts';
export type { Scheduler } from './path-play.ts';
export { ANIMATION_LIMITS, animationFits } from './path-animation.ts';
export type { Device, ExportWalk, TooLargeToAnimate } from './path-animation.ts';
export { viewsOf, readingOf } from './views.ts';
export type { NamedView } from './views.ts';
export { VIEW_FORMS, VIEW_KINDS, VIEW_LIMITS, VIEW_NAMES, parseView } from './view-profile.ts';
export { addView, makeView } from './view-write.ts';
export type { ViewArgs, ViewKind, ViewRefusal, ViewSpec } from './view-profile.ts';
export { evaluate } from './view-evaluate.ts';
export type { ViewResult } from './view-evaluate.ts';
export { isSourceBlock, isStepBlock } from './blocks.ts';
export { lineInSource, readSource, sourceFor, sourceOf } from './sources.ts';
export type {
  Fetched as SourceFetched,
  Source as GraphSource,
  SourceFault,
  SourceRead,
  SourceRefusal,
} from './sources.ts';
export { runStep, stepOf } from './steps.ts';
export type { Step as GraphStep, StepFault, StepOutput, StepRun } from './steps.ts';
export { givenLabel } from './steps-input.ts';
export type { StepGiven, StepPoint } from './steps-input.ts';
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
export { CORE_EXPORTS, DATA_FORMATS, dataText, exportedData, isDataFormat } from './export-data.ts';
export type { DataFormat } from './export-data.ts';
export type { DataInfo, ExportedData } from './export-data-model.ts';
export { EXTENSION_POINTS, HOST_ABILITIES, PLUGIN_API, PLUGIN_TIME_LIMIT, pluginRegistry } from './plugins.ts';
export { POINT_VERSIONS } from './plugins.ts';
export { currentLocale, DEFAULT_LOCALE, formatCount, formatDay, formatInstant } from './locale-formats.ts';
export { formatList, formatSize, setLocale, sortedForReader } from './locale-formats.ts';
export type { DataExporter, ExtensionPoint, ExtensionPoints, ThoughtKnotPlugin, PluginRegistry } from './plugins.ts';
export type { PluginCommand, PluginResult, RegistryOptions, StorageBackend, StoppedPlugin } from './plugins.ts';
export type { HostAbilities, HostAbility, HostOffer, PanelRoot, PluginPanel } from './plugins.ts';
export type { GivenGraph, PluginSource, PluginStep } from './plugins.ts';
export { TRUST_LEVELS } from './plugin-sources.ts';
export type { GraphOrigin, JoinedGraph, Trust } from './plugin-sources.ts';
export { commandContract, exporterContract, sampleExports, storageBackendContract } from './plugins-contract.ts';
export { SAMPLE_GRAPH, providerContract, sourceContract, stepContract } from './plugins-contract.ts';
export type { AiProvider, ProviderReading, ProviderRequest } from './plugin-ai.ts';
export { diagramContract, themeTokenContract } from './plugins-contract.ts';
export { isolatedPlugin } from './plugin-isolated.ts';
export type { IsolatedOptions, IsolatedPlugin, PluginPort } from './plugin-isolated.ts';
export { ISOLATED_POINTS, LOCKED_AWAY, lockDown, servePlugin } from './plugin-serve.ts';
export type { Added, FromPlugin, PluginScope, ToPlugin } from './plugin-serve.ts';
export type { DiagramGiven, DiagramMark, DiagramSpace, MarkPoint, PluginDiagram } from './plugin-diagrams.ts';
export { OBSIDIAN_TOKEN_MAP, THEME_TOKENS, themeTokenCss } from './theme-tokens.ts';
export type { ThemeToken, ThemeTokenUse } from './theme-tokens.ts';
export {
  addTranslation,
  currentDirection,
  currentLanguage,
  directionOf,
  placeholdersOf,
  sayWords,
  setDirection,
  setLanguage,
  SOURCE_LANGUAGE,
  translationProblems,
  word,
} from './words.ts';
export type { Catalogue, PluralWords, WordKey, Words, WordValues } from './words.ts';
export { SOURCE_WORDS } from './source-words.ts';
export { isPseudoWord, PSEUDO_LANGUAGES, pseudoWords } from './pseudo-words.ts';
export { optionSaid } from './settings-words.ts';
export type { PluginCheck } from './plugins-contract.ts';
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
export { setNote } from './note-edit.ts';
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
export { CHANGE_LOOKS, NO_CHANGES, changesText, changesView, markedChanges } from './changes-view.ts';
export type { ChangeLine, ChangesShown } from './changes-view.ts';
export { REVIEW_LEVELS, ReviewItems, asNote, groupSaid, reviewLevels, workstreamsFrom } from './github-review-items.ts';
export type {
  ChangedFile,
  FileLines,
  GraphChanges,
  ReviewItem,
  ReviewLevels,
  ReviewSource,
  SummaryGroup,
  Workstreams,
} from './github-review-items.ts';
export { DIFF_LIMIT, lineDiff } from './line-diff.ts';
export type { DiffLine } from './line-diff.ts';
export { THRESHOLDS, thresholdValue } from './thresholds.ts';
export type { Threshold, ThresholdName } from './thresholds.ts';
export { changeSetId } from './proposals-text.ts';
export { DECIDER_DEFAULT, deciderName } from './proposals-judgement.ts';
export type { Decision } from './proposals-judgement.ts';
export type { ProposalCheck } from './proposals-check.ts';
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
export { CLAUDE, claudeGate, classificationOf, noteClassification } from './claude-gate.ts';
export type { Gate, GateSettings, NoteClassification } from './claude-gate.ts';
export { sha256 } from './ai-digest.ts';
export { AI_PURPOSES, endpointProblem, modelChoices } from './ai-choice.ts';
export type { HostAi, ModelChoice } from './ai-choice.ts';
export type { ScopeChoice } from './ai-scope.ts';
export {
  classMapFrom,
  classMapProblems,
  classMapText,
  matchClass,
  matrixGrants,
  matrixProblems,
  unmatchedClasses,
} from './ai-matrix.ts';
export type { ClassGrant, Mark, MatrixCell, MatrixInput, MatrixRow, MatrixSwitch } from './ai-matrix.ts';
export { noteWithProposal } from './ai-answer.ts';
export { changesIn } from './ai-request.ts';
export type { ChangeRow, DecideOptions, Person, ProposalShown, Reviewed, Which } from './proposals-shown.ts';
export { hitAreas, nearby, TapCycle, boundsOf, centres } from './hits.ts';
export { landingFor, landingSaid, placesFor } from './box-drag.ts';
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
export { LEGEND_CHOICES } from './untangle-saved.ts';
export type { LegendChoice, LegendChoiceState } from './untangle-saved.ts';
export { BUSY_HUB, foldsHiding } from './untangle-fold.ts';
export type { Folding } from './untangle-fold.ts';
export {
  LABEL_SCALE,
  SWITCH_NAMES,
  SWITCH_SETTINGS,
  VIEW_SWITCHES,
  ViewState,
  labelsHidden,
  startingSwitches,
} from './view-switches.ts';
export type { Fold, ViewSwitch, ViewSwitches } from './view-switches.ts';
export { linksOf } from './style.ts';
export type { Links, OnOff, Routing } from './style-graph.ts';
export type { DrawingHeightSetting, MiniMapSetting, SwitchSetting } from './settings.ts';
export { tallestOf } from './settings-aids.ts';
export { importedBlock, isDbFile, withImport } from './db-import.ts';
export type { DbImported, DbRow } from './db-import.ts';
export {
  applyChanges,
  attachmentType,
  attachmentsOf,
  brokenLinks,
  embedParts,
  embeddedMarkdown,
  embeddedRemoteImages,
  leavingWords,
  linkKind,
  linkTo,
  linksHeld,
  linksIn,
  noteOf,
  refusedWords,
  remoteImagesIn,
  renamedLinks,
  safeMarkdown,
  withMeant,
} from './links.ts';
export type { Attachment, BrokenLink, EmbedPart, FoundLink, LinkKind, LinkVault, PlacedLink } from './links.ts';
export { TextHistory } from './history.ts';
export type { Change, TextState } from './history.ts';
export type { Bounds, HitAreas, Shape } from './hits.ts';
export type { Landing, PlacedBox, Side, WrittenNudge } from './box-drag.ts';
export type { PropType, Property, Target, Edit, Parsed } from './inspector.ts';
