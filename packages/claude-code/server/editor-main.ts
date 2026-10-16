// What the shipped editor server is handed by the mod that runs it (spec §26, workstream C2): its vault, its note and the
// folder for drafts, in its environment, never in an argument (it takes none). From them it makes the note store, opens
// the one note for the session by the path the mod names, and hands the process its API and the note's id for the
// address. With no vault in its environment it serves no API, as before. A note that cannot be opened, or a folder that
// is refused, is thrown as plain words, which the process says on stderr before it listens anywhere.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EditorProcessOptions } from './editor-process.ts';
import { settingsFrom } from '@graph-note/core';
import { matrixRowsFrom } from '@graph-note/core/hosts/matrix-table';
import type { GateSettings } from '@graph-note/core';
import { storeGate } from './editor-gate.ts';
import { NoteStore } from './editor-store.ts';
import { loadPageAssets, type PageAssets } from './page-assets.ts';
import { withSettings } from './page-settings.ts';

/** The variables the mod sets; the process reads these and no others. */
export const EDITOR_ENVIRONMENT = {
  vault: 'GRAPH_NOTE_EDITOR_VAULT',
  note: 'GRAPH_NOTE_EDITOR_NOTE',
  drafts: 'GRAPH_NOTE_EDITOR_DRAFTS',
  input: 'GRAPH_NOTE_EDITOR_INPUT',
  /** The gate's settings as JSON: the classifications, the level for unlabelled notes and the AI models (no key). */
  settings: 'GRAPH_NOTE_EDITOR_SETTINGS',
  /** The digest of the text the user said yes to; empty when none was asked. */
  confirmed: 'GRAPH_NOTE_EDITOR_CONFIRMED',
} as const;

/** The gate's settings from the environment, as the core reads settings back; none, or unreadable ones, are the defaults. */
export function gateSettings(raw: string | undefined): GateSettings {
  try {
    const given: unknown = JSON.parse(raw ?? 'null');
    const s = settingsFrom(given);
    const matrix = given && typeof given === 'object' ? matrixRowsFrom((given as Record<string, unknown>).matrix) : [];
    const problem = (given as Record<string, unknown> | null)?.matrixProblem;
    return {
      classifications: s.classifications,
      aiUnlabelled: s.aiUnlabelled,
      aiModels: s.aiModels,
      aiClassMap: s.aiClassMap,
      matrix,
      ...(typeof problem === 'string' && problem ? { matrixProblem: problem } : {}),
    };
  } catch {
    const d = settingsFrom(null);
    return { classifications: d.classifications, aiUnlabelled: d.aiUnlabelled, aiModels: d.aiModels };
  }
}

/**
 * The page's files, from the folder the build made beside this process: `mod/page/` from the built `mod/bin/`, or from
 * this source folder `mod/page/` of its package. A folder that is not there serves no page files (the placeholder shows).
 */
async function pageFiles(): Promise<PageAssets> {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const folder of ['../mod/page', '../page']) {
    const files = await loadPageAssets(join(here, folder));
    if (files.has('/')) return files;
  }
  return new Map();
}

/** The process's options from its environment: the store for the vault, with the note opened, and how it is stopped. */
export async function optionsFromEnvironment(env: Record<string, string | undefined>): Promise<EditorProcessOptions> {
  const vault = env[EDITOR_ENVIRONMENT.vault];
  if (!vault) return {};
  const note = env[EDITOR_ENVIRONMENT.note];
  const drafts = env[EDITOR_ENVIRONMENT.drafts];
  if (!note || !drafts) throw new Error('It was given a vault but not the note to open, or the folder for drafts.');
  // the gate is always in: with no settings given it is the defaults, the strictest
  const confirmed = env[EDITOR_ENVIRONMENT.confirmed] || null;
  const gate = storeGate(gateSettings(env[EDITOR_ENVIRONMENT.settings]), confirmed);
  const store = await NoteStore.create({ vault, drafts, gate });
  const opened = await store.open(note);
  if (!opened.ok) {
    await store.stop();
    throw new Error(opened.why);
  }
  return {
    api: withSettings(env[EDITOR_ENVIRONMENT.settings], store.api),
    page: await pageFiles(),
    drain: () => store.stop(),
    note: opened.id,
    ignoreInput: env[EDITOR_ENVIRONMENT.input] === 'ignore',
  };
}
