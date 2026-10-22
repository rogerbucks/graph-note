// The core's plug-in interface, as the core's entry exports it (spec §43, plugin_interface). That is the registry and
// each extension point's contract suite. It is also the drawing marks every diagram type gives, the built-in ones too.
// Kept apart from index.ts so each file stays short.
export { EXTENSION_POINTS, HOST_ABILITIES, PLUGIN_API, PLUGIN_TIME_LIMIT, pluginRegistry } from './plugins.ts';
export { POINT_VERSIONS } from './plugins.ts';
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
export { OUTSIDE_CHARACTERS, outsideBody, outsidePlugin } from './plugin-outside.ts';
export { outsideProblem, sealCode, sealOutside } from './plugin-outside.ts';
export { ISOLATED_POINTS, LOCKED_AWAY, lockDown, servePlugin } from './plugin-serve.ts';
export type { Added, FromPlugin, PluginScope, ToPlugin } from './plugin-serve.ts';
export type { DiagramGiven, DiagramMark, DiagramSpace, MarkPoint, PluginDiagram } from './plugin-diagrams.ts';
export { OBSIDIAN_TOKEN_MAP, THEME_TOKENS, themeTokenCss } from './theme-tokens.ts';
export type { ThemeToken, ThemeTokenUse } from './theme-tokens.ts';
export type { DiagramDrawn } from './plugin-diagrams.ts';
export { CORE_DIAGRAMS_ID, coreDiagramType, coreDiagrams } from './core-diagrams.ts';
export type { MarksEngine } from './core-diagrams.ts';
export { VIEW_TYPES } from './view-types/view-types.ts';
export type { ViewType } from './view-types/view-types.ts';
export {
  BOX_SHAPES,
  DRAW_MARK_KINDS,
  DRAW_MARK_LIMIT,
  DRAW_TEXT_LIMIT,
  drawMarksOf,
  drawOrder,
} from './drawing-marks.ts';
export { fromPluginMarks, markBounds, marksBounds, scaledMarks } from './drawing-marks.ts';
export type { BoxShape, DrawMark, DrawMarkKind, DrawMarkRole, MarkBounds, MarkOutline } from './drawing-marks.ts';
export type { LaidMarks, LaidPart } from './graphviz-marks.ts';
export { layoutSvg } from './graphviz-svg.ts';
