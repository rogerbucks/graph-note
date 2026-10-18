// The settings the mod hands the editor server in its environment (spec §26, cc_settings_shared). The gate's, as the
// launcher makes them (`settingsForServer`: classifications, the level for unlabelled notes, each model's name and
// ceiling or matrix row, never its address or key), and now the ones the page shows with: how it indents, draws, folds
// and what the viewer's aids are. The server reads them back with the core's `settingsFrom`, so a missing one is its
// default, and answers them to the page read only.
import type { GateSettings, Settings } from '@graph-note/core';

/** What the mod reads from its settings file: the gate's, and any of the editor's own that were saved. */
export type LaunchSettings = GateSettings & Partial<Omit<Settings, keyof GateSettings>>;

/** The settings the page shows with, beside the gate's. */
const SHOWN = [
  'strictness',
  'allowed',
  'indent',
  'direction',
  'focusDepth',
  'labelsByZoom',
  'foldHubs',
  'foldGroups',
  'mergeLinks',
  'noteCallouts',
  'miniMap',
  'detailsOpen',
  'drawingHeight',
  // who decides on the card: the name written into each Decision (proposals-judgement.ts)
  'decider',
] as const;

/** The settings as the server is given them, in its environment: no key, only what its gate reads. */
export function settingsForServer(settings: GateSettings): string {
  return JSON.stringify({
    classifications: settings.classifications,
    aiUnlabelled: settings.aiUnlabelled,
    // each model's row and switches go too, so the server holds Claude to the same row as the mod
    aiModels: settings.aiModels.map((m) => ({
      name: m.name,
      ceiling: m.ceiling,
      ...(m.matrixRow ? { matrixRow: m.matrixRow, matrixOn: m.matrixOn ?? [] } : {}),
    })),
    aiClassMap: settings.aiClassMap ?? {},
    // the rows the mod read from the matrix note; none given are none, and a row picked then clears nothing
    matrix: settings.matrix ?? [],
    ...(settings.matrixProblem ? { matrixProblem: settings.matrixProblem } : {}),
  });
}

/** The JSON for `GRAPH_NOTE_EDITOR_SETTINGS`: the gate's own JSON (`gateJson`) with the page's settings beside it. */
export function settingsEnvironment(settings: LaunchSettings, gateJson: string): string {
  const shown = Object.fromEntries(SHOWN.filter((k) => settings[k] !== undefined).map((k) => [k, settings[k]]));
  return JSON.stringify({ ...shown, ...(JSON.parse(gateJson) as Record<string, unknown>) });
}
