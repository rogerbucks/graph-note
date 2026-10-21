// What a plug-in adds through each extension point, and why each is refused (editor spec §43, plugin_interface). The
// registry (plugins.ts) checks each with these as it is added. It also lists the host's abilities a manifest may name
// (plugin_manifest_limits). A plug-in is given those it names and no other.
import type { DataInfo, ExportedData } from './export-data-model.ts';
import type { NoteStorage } from './note-storage.ts';

const WORD = /^[a-z][a-z0-9-]*$/;

/** A data export a plug-in adds: the format's word, its name as offered, its file's extension and media type, and the writer. */
export interface DataExporter {
  /** The word the format is chosen by, lower case: `csv`. */
  format: string;
  /** What the format is called where it is offered: `CSV`. */
  title: string;
  /** The file name's extension, without its dot. */
  extension: string;
  /** The media type the file is shared as. */
  mime: string;
  /** The data written in this format. */
  write: (data: ExportedData, info: DataInfo) => string;
}

/** A place notes are kept that a plug-in adds, such as a server or a cloud drive (§41, storage_contract). */
export interface StorageBackend {
  /** The word it is chosen by, lower case: `webdav`. */
  name: string;
  /** What it is called where it is offered: `WebDAV`. */
  title: string;
  /** A store of the notes kept there, each read and written as `NoteStorage` promises. */
  open: () => NoteStorage;
}

/** A command a plug-in adds, which a host offers in its command list and menus. */
export interface PluginCommand {
  /** Its id, under its plug-in's own: `acme.tags.count`. */
  id: string;
  /** What it is called where it is offered, in the host's language. */
  title: string;
  /** Does what the command does. */
  run: () => void;
}

/**
 * The element a panel is drawn in, as the core sees it. The core has no DOM, so it names only the direction. A host
 * hands in its own element, set to read in the host's direction, and a panel may take it as an `HTMLElement`.
 */
export interface PanelRoot {
  dir: string;
}

/** A panel a plug-in adds, which a host shows beside a graph, as a sidebar or a pane is. */
export interface PluginPanel {
  /** Its id, under its plug-in's own: `acme.tags.list`. */
  id: string;
  /** What it is called where it is offered, in the host's language. */
  title: string;
  /** Draws the panel into `el`, which the host made and set to read in its direction. */
  render(el: PanelRoot): void;
}

/** The host's abilities a plug-in may ask for in its manifest, each given only to one that names it. */
export const HOST_ABILITIES = ['notice', 'settings', 'secrets', 'files'] as const;

/** One of the host's abilities. */
export type HostAbility = (typeof HOST_ABILITIES)[number];

/**
 * What each ability is: a brief notice, the plug-in's own settings and secrets, and the host's notes. They are the
 * host's own (display/host.ts, `Host`), which the core does not import, so the shapes are said again here.
 */
export interface HostAbilities {
  notice: (message: string) => void;
  /** The plug-in's settings: one JSON value, kept by the host for this plug-in alone. */
  settings: { load: () => Promise<unknown>; save: (value: unknown) => Promise<void> };
  /** The plug-in's own secrets, each read by its name under the plug-in's id: `acme.one.token`. */
  secrets: { get: (name: string) => string | null | Promise<string | null> };
  files: NoteStorage;
}

/** Why a data export a plug-in adds is refused, or null when it is accepted. */
export function exporterProblem(e: DataExporter, taken: Map<string, string>): string | null {
  if (!WORD.test(e.format)) return `the format "${e.format}" is not a lower-case word`;
  if (taken.has(e.format)) return `the format "${e.format}" is already added by ${taken.get(e.format)}`;
  if (!e.title.trim()) return `the format "${e.format}" has no title`;
  if (!WORD.test(e.extension)) return `the extension "${e.extension}" is not a lower-case word`;
  if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(e.mime)) return `the media type "${e.mime}" is not one`;
  if (typeof e.write !== 'function') return `the format "${e.format}" has no writer`;
  return null;
}

/** Why a storage backend a plug-in adds is refused, or null when it is accepted. */
export function backendProblem(b: StorageBackend, taken: Map<string, string>): string | null {
  if (!WORD.test(b.name)) return `the storage "${b.name}" is not named by a lower-case word`;
  if (taken.has(b.name)) return `the storage "${b.name}" is already added by ${taken.get(b.name)}`;
  if (!b.title.trim()) return `the storage "${b.name}" has no title`;
  if (typeof b.open !== 'function') return `the storage "${b.name}" cannot be opened`;
  return null;
}

/** Why a command the plug-in `pluginId` adds is refused, or null when it is accepted. */
export function commandProblem(c: PluginCommand, pluginId: string, taken: Map<string, string>): string | null {
  const word = c.id.startsWith(`${pluginId}.`) ? c.id.slice(pluginId.length + 1) : '';
  if (!WORD.test(word)) return `the command "${c.id}" is not named ${pluginId}.<word>`;
  if (taken.has(c.id)) return `the command "${c.id}" is added already`;
  if (!c.title.trim()) return `the command "${c.id}" has no title`;
  if (typeof c.run !== 'function') return `the command "${c.id}" does nothing`;
  return null;
}

/** Why a panel the plug-in `pluginId` adds is refused, or null when it is accepted. */
export function panelProblem(c: PluginPanel, pluginId: string, taken: Map<string, string>): string | null {
  const word = c.id.startsWith(`${pluginId}.`) ? c.id.slice(pluginId.length + 1) : '';
  if (!WORD.test(word)) return `the panel "${c.id}" is not named ${pluginId}.<word>`;
  if (taken.has(c.id)) return `the panel "${c.id}" is added already`;
  if (!c.title.trim()) return `the panel "${c.id}" has no title`;
  if (typeof c.render !== 'function') return `the panel "${c.id}" draws nothing`;
  return null;
}
