// What the /graph mod's hooks module takes from this package. esbuild.config.mjs bundles it into mod/hooks/graph.js. It
// is reading, the layout source, theming and the pane's view. It has no Graphviz, which runs as a process (spec §10).
export { viewOf, PANE_PALETTE, notePath, SVG_MAX, NO_GRAPH } from './graph-view.ts';
export type { GraphView } from './graph-view.ts';
export { settingsFrom } from '@thoughtknot/core';
export { EditorLauncher, confirmArgs, editArgs, sayEdit, sayProposed, sayStopped } from './editor-launch.ts';
export { DATA_FOLDER_REFUSAL, guardDataFolder, guardOpenNote, pathOf } from './data-guard.ts';
export { guardGateFiles } from './gate-guard.ts';
export { readLinkVia, realPathVia } from './editor-realpath.ts';
export type { EditOutcome, EditorPorts, Spawned } from './editor-launch.ts';
export { layOut, NODE_MISSING, RENDER_SCRIPT } from './graphviz-process.ts';
export type { Laid, ProcessResult, RunProcess } from './graphviz-process.ts';
