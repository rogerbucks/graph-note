// What the shipped editor server is handed by the mod that runs it (spec §26, workstream C2). It gets its vault, its
// note and the folder for drafts, in its environment. It never gets them in an argument (it takes none). From them it:
// - makes the note store;
// - opens the one note for the session, by the path the mod names;
// - hands the process its API, and the note's id for the address.
// With no vault in its environment it serves no API, as before. A note that cannot be opened, or a folder that is
// refused, is thrown as plain words. The process says them on stderr before it listens anywhere.
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EditorProcessOptions } from './editor-process.ts';
import { settingsFrom, word } from '@thoughtknot/core';
import { matrixRowsFrom } from '@thoughtknot/core/hosts/matrix-table';
import type { GateSettings } from '@thoughtknot/core';
import { storeGate } from './editor-gate.ts';
import { proposerName } from './editor-proposals.ts';
import { NoteStore } from './editor-store.ts';
import { loadPageAssets, type PageAssets } from './page-assets.ts';
import { Exporter, withExport } from './export-api.ts';
import { pageSettings, withSettings } from './page-settings.ts';

/** The variables the mod sets; the process reads these and no others. */
export const EDITOR_ENVIRONMENT = {
  vault: 'THOUGHTKNOT_EDITOR_VAULT',
  note: 'THOUGHTKNOT_EDITOR_NOTE',
  drafts: 'THOUGHTKNOT_EDITOR_DRAFTS',
  input: 'THOUGHTKNOT_EDITOR_INPUT',
  /** The gate's settings as JSON: the classifications, the level for unlabelled notes and the AI models (no key). */
  settings: 'THOUGHTKNOT_EDITOR_SETTINGS',
  /** The digest of the text the user said yes to; empty when none was asked. */
  confirmed: 'THOUGHTKNOT_EDITOR_CONFIRMED',
  /** `stdin` when the mod hands the key for Claude's proposals on standard input (never here): good for one route only. */
  proposer: 'THOUGHTKNOT_EDITOR_PROPOSER',
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
 * The page's files, from the folder the build made. That is `mod/page/` beside the built `mod/bin/` this process runs
 * from. Or it is `mod/page/` of the package, when run from this source folder. Never the page's source folder. With no
 * built page the start fails in plain words, before the server listens, rather than serving a page that cannot run.
 */
export async function pageFiles(here = dirname(fileURLToPath(import.meta.url))): Promise<PageAssets> {
  const files = await loadPageAssets(join(here, basename(here) === 'bin' ? '../page' : '../mod/page'));
  if (!files.has('/')) throw new Error(word('server.page-not-built'));
  return files;
}

/** The process's options from its environment: the store for the vault, with the note opened, and how it is stopped. */
export async function optionsFromEnvironment(
  env: Record<string, string | undefined>,
  key?: string,
): Promise<EditorProcessOptions> {
  const vault = env[EDITOR_ENVIRONMENT.vault];
  if (!vault) return {};
  const note = env[EDITOR_ENVIRONMENT.note];
  const drafts = env[EDITOR_ENVIRONMENT.drafts];
  if (!note || !drafts) throw new Error(word('server.no-note-or-drafts'));
  // the gate is always in: with no settings given it is the defaults, the strictest
  const confirmed = env[EDITOR_ENVIRONMENT.confirmed] || null;
  const settings = gateSettings(env[EDITOR_ENVIRONMENT.settings]);
  const gate = storeGate(settings, confirmed);
  const store = await NoteStore.create({ vault, drafts, gate, proposer: proposerName(settings) });
  // a key too short to be one, or with odd characters, is no key: no proposal is taken
  const proposerKey = /^[A-Za-z0-9_-]{32,}$/.test(key ?? '') ? key : undefined;
  const opened = await store.open(note);
  if (!opened.ok) {
    await store.stop();
    throw new Error(opened.why);
  }
  // exports go to the export folder the settings name, else the note's own, as new files only (export-api.ts)
  const exporter = new Exporter({
    vault: store.vault,
    exportFolder: pageSettings(env[EDITOR_ENVIRONMENT.settings]).exportFolder,
    notePath: (id) => store.pathOf(id),
  });
  return {
    api: withSettings(env[EDITOR_ENVIRONMENT.settings], withExport(exporter, store.api)),
    page: await pageFiles(),
    drain: async () => void (await Promise.all([store.stop(), exporter.stop()])),
    note: opened.id,
    ignoreInput: env[EDITOR_ENVIRONMENT.input] === 'ignore',
    ...(proposerKey ? { proposerKey } : {}),
  };
}
