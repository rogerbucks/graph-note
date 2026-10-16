// The settings the mod hands the editor server in its environment (spec §26, cc_settings_shared). The gate's three (the
// classifications, the level for unlabelled notes, and each model's name and ceiling, never its address or key) as before,
// and now the ones the page shows with: how it indents, draws, folds and what the viewer's aids are. The server reads them
// back with the core's `settingsFrom`, so a missing one is its default, and answers them to the page read only.
import type { GateSettings, Settings } from '@graph-note/core';

/** What the mod reads from its settings file: the gate's, and any of the editor's own that were saved. */
export type LaunchSettings = GateSettings & Partial<Settings>;

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
] as const;

/** The JSON for `GRAPH_NOTE_EDITOR_SETTINGS`: none given is empty, which the server reads as the defaults. */
export function settingsEnvironment(settings: LaunchSettings | null): string {
  if (!settings) return '';
  const shown = Object.fromEntries(SHOWN.filter((k) => settings[k] !== undefined).map((k) => [k, settings[k]]));
  return JSON.stringify({
    ...shown,
    classifications: settings.classifications,
    aiUnlabelled: settings.aiUnlabelled,
    aiModels: settings.aiModels.map((m) => ({ name: m.name, ceiling: m.ceiling })),
  });
}
