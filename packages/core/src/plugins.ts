// The plug-in interface (editor spec §43, plugin_interface and plugin_manifest_limits). It is one typed, versioned way
// in for what ThoughtKnot can be extended with, used by the built-in ones too. A plug-in names itself and the interface
// version it was built for. In its manifest it names the extension points it uses; it is given only those. What it adds
// is checked as it is added. A call into it that throws is caught and named, never let through to blank a drawing. The
// first extension point is the data exports, and the second the theme tokens (§44, plugin_theme_tokens). A plug-in
// inherits the core's design tokens and may add colours of its own, each meeting the locked contrast (theme-tokens.ts).
// The third is note storage (§41, storage_contract), and the fourth the commands a person runs. A call over the time
// limit is named and its answer dropped. Its plug-in is stopped, so it never holds a drawing up again.
// Diagram types, graph steps and sources and AI providers join them one at a time. Each comes with its own contract
// suite (plugins-contract.ts).
import type { DataInfo, ExportedData } from './export-data-model.ts';
import type { NoteStorage } from './note-storage.ts';
import { THEME_TOKENS, themeTokenProblem } from './theme-tokens.ts';
import type { ThemeToken } from './theme-tokens.ts';

/** The version of the plug-in interface; a plug-in built for another is refused. */
export const PLUGIN_API = '1';

/** The extension points a plug-in may use, as its manifest names them. */
export const EXTENSION_POINTS = ['exports', 'theme', 'storage', 'commands'] as const;

/** One of the extension points. */
export type ExtensionPoint = (typeof EXTENSION_POINTS)[number];

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

/** What a plug-in is given to add to: only the points its manifest names. */
export interface ExtensionPoints {
  exports?: { add: (exporter: DataExporter) => void };
  /** The theme: the core's tokens, which a plug-in's styles may name, and a way to add colours of its own. */
  theme?: { core: readonly string[]; add: (token: ThemeToken) => void };
  storage?: { add: (backend: StorageBackend) => void };
  commands?: { add: (command: PluginCommand) => void };
}

/** A plug-in: who it is, what it uses, and what it adds. */
export interface ThoughtKnotPlugin {
  /** Its own name, dotted and lower case: `acme.mermaid-export`. */
  id: string;
  /** Its own version, as major.minor.patch. */
  version: string;
  /** The version of the plug-in interface it was built for. */
  api: string;
  /** The extension points it uses: its manifest. */
  uses: ExtensionPoint[];
  /** Adds what it brings, through the points it is given. */
  register: (points: ExtensionPoints) => void;
}

/** The answer of a call into a plug-in: its value, or what went wrong and whose it was. */
export type PluginResult<T> = { ok: true; value: T } | { ok: false; plugin: string; message: string };

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const WORD = /^[a-z][a-z0-9-]*$/;

/** How long a call into a plug-in may run, in milliseconds, before the plug-in is stopped. */
export const PLUGIN_TIME_LIMIT = 2000;

/** What a registry is made with: how long a call may run, and the clock it is timed by. */
export interface RegistryOptions {
  /** In milliseconds; `PLUGIN_TIME_LIMIT` unless set. */
  timeLimit?: number;
  /** The time now, in milliseconds; `Date.now` unless set. */
  now?: () => number;
}

/** A plug-in that was stopped, and why. */
export interface StoppedPlugin {
  plugin: string;
  why: string;
}

/** The plug-ins installed and what each added; one for each host, made by `pluginRegistry`. */
export interface PluginRegistry {
  /** Installs `plugin`; throws, saying why, when its manifest or what it adds is refused, and then installs none of it. */
  register: (plugin: ThoughtKnotPlugin) => void;
  /** The ids of the plug-ins installed, in the order they were. */
  plugins: () => string[];
  /** Every data export added, in the order added. */
  exporters: () => DataExporter[];
  /** The export of `format`, or undefined. */
  exporter: (format: string) => DataExporter | undefined;
  /** Every theme token added, in the order added, for a host to apply (theme-tokens.ts, `themeTokenCss`). */
  themeTokens: () => ThemeToken[];
  /** The data written by the export of `format`, or what went wrong and whose plug-in it was. */
  writeData: (format: string, data: ExportedData, info: DataInfo) => PluginResult<string>;
  /** Every storage backend added, in the order added. */
  storages: () => StorageBackend[];
  /** The notes of the backend `name`, opened, or what went wrong and whose plug-in it was. */
  openStorage: (name: string) => PluginResult<NoteStorage>;
  /** Every command added, in the order added. */
  commands: () => PluginCommand[];
  /** Runs the command `id`, or says what went wrong and whose plug-in it was. */
  runCommand: (id: string) => PluginResult<undefined>;
  /** The plug-ins stopped for running too long, and why; nothing of theirs is called again. */
  stopped: () => StoppedPlugin[];
}

/** Why a data export a plug-in adds is refused, or null when it is accepted. */
function exporterProblem(e: DataExporter, taken: Map<string, string>): string | null {
  if (!WORD.test(e.format)) return `the format "${e.format}" is not a lower-case word`;
  if (taken.has(e.format)) return `the format "${e.format}" is already added by ${taken.get(e.format)}`;
  if (!e.title.trim()) return `the format "${e.format}" has no title`;
  if (!WORD.test(e.extension)) return `the extension "${e.extension}" is not a lower-case word`;
  if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(e.mime)) return `the media type "${e.mime}" is not one`;
  if (typeof e.write !== 'function') return `the format "${e.format}" has no writer`;
  return null;
}

/** Why a storage backend a plug-in adds is refused, or null when it is accepted. */
function backendProblem(b: StorageBackend, taken: Map<string, string>): string | null {
  if (!WORD.test(b.name)) return `the storage "${b.name}" is not named by a lower-case word`;
  if (taken.has(b.name)) return `the storage "${b.name}" is already added by ${taken.get(b.name)}`;
  if (!b.title.trim()) return `the storage "${b.name}" has no title`;
  if (typeof b.open !== 'function') return `the storage "${b.name}" cannot be opened`;
  return null;
}

/** Why a command the plug-in `pluginId` adds is refused, or null when it is accepted. */
function commandProblem(c: PluginCommand, pluginId: string, taken: Map<string, string>): string | null {
  const word = c.id.startsWith(`${pluginId}.`) ? c.id.slice(pluginId.length + 1) : '';
  if (!WORD.test(word)) return `the command "${c.id}" is not named ${pluginId}.<word>`;
  if (taken.has(c.id)) return `the command "${c.id}" is added already`;
  if (!c.title.trim()) return `the command "${c.id}" has no title`;
  if (typeof c.run !== 'function') return `the command "${c.id}" does nothing`;
  return null;
}

/** What a plug-in adds to one point, kept aside until all it adds has been accepted. */
interface Shelf<T> {
  items: T[];
  owner: Map<string, string>;
}

const shelf = <T>(): Shelf<T> => ({ items: [], owner: new Map() });

/** A registry with no plug-ins installed yet. */
export function pluginRegistry(options: RegistryOptions = {}): PluginRegistry {
  const { timeLimit = PLUGIN_TIME_LIMIT, now = Date.now } = options;
  const installed: string[] = [];
  const exporters: DataExporter[] = [];
  const owner = new Map<string, string>();
  const tokens: ThemeToken[] = [];
  const tokenOwner = new Map<string, string>();
  const backends = shelf<StorageBackend>();
  const commands = shelf<PluginCommand>();
  const stopped = new Map<string, string>();
  const core = Object.freeze(Object.keys(THEME_TOKENS));
  /** The answer of `call`, made by `plugin`'s `what`, timed, caught and named. A call over the limit stops the plug-in. */
  const guarded = <T>(plugin: string, what: string, call: () => T): PluginResult<T> => {
    const stop = stopped.get(plugin);
    if (stop !== undefined) return { ok: false, plugin, message: `${what} of ${plugin} was not run: ${stop}` };
    const start = now();
    let value: T;
    try {
      value = call();
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      return { ok: false, plugin, message: `${what} of ${plugin} failed: ${why}` };
    }
    const took = now() - start;
    if (took > timeLimit) {
      const why = `the plug-in was stopped, as ${what} took ${Math.round(took)} ms, over the ${timeLimit} ms allowed`;
      stopped.set(plugin, why);
      return { ok: false, plugin, message: `${what} of ${plugin} ran too long: ${why}.` };
    }
    return { ok: true, value };
  };
  /** Moves what a plug-in added onto the registry's own shelf, once all of it was accepted. */
  const keep = <T>(from: Shelf<T>, to: Shelf<T>, key: (t: T) => string, plugin: string) => {
    for (const t of from.items) {
      to.items.push(t);
      to.owner.set(key(t), plugin);
    }
  };
  return {
    register(plugin) {
      const refuse = (why: string): never => {
        throw new Error(`The plug-in ${plugin.id || '(no id)'} was not installed: ${why}.`);
      };
      if (!ID.test(plugin.id)) refuse('its id must be dotted lower-case words, such as acme.mermaid-export');
      if (installed.includes(plugin.id)) refuse('a plug-in with that id is installed already');
      if (!SEMVER.test(plugin.version)) refuse(`its version "${plugin.version}" is not major.minor.patch`);
      if (plugin.api !== PLUGIN_API)
        refuse(`it was built for version ${plugin.api} of the interface, not ${PLUGIN_API}`);
      const unknown = plugin.uses.filter((p) => !(EXTENSION_POINTS as readonly string[]).includes(p));
      if (unknown.length) refuse(`its manifest names extension points that do not exist: ${unknown.join(', ')}`);
      // what it adds is kept aside until it has all been accepted, so a refused plug-in leaves nothing behind
      const added: DataExporter[] = [];
      const taken = new Map(owner);
      const addedTokens: ThemeToken[] = [];
      const tokenTaken = new Map(tokenOwner);
      const addedBackends = shelf<StorageBackend>();
      const addedCommands = shelf<PluginCommand>();
      const points: ExtensionPoints = {};
      if (plugin.uses.includes('exports'))
        points.exports = {
          add: (e) => {
            const why = exporterProblem(e, taken);
            if (why) refuse(why);
            taken.set(e.format, plugin.id);
            added.push({ ...e });
          },
        };
      if (plugin.uses.includes('theme'))
        points.theme = Object.freeze({
          core,
          add: (t: ThemeToken) => {
            const why = themeTokenProblem(t, plugin.id);
            if (why) refuse(why);
            const by = tokenTaken.get(t.name);
            if (by) refuse(`the theme token ${t.name} is already added by ${by}`);
            tokenTaken.set(t.name, plugin.id);
            addedTokens.push({ ...t });
          },
        });
      if (plugin.uses.includes('storage'))
        points.storage = {
          add: (b) => {
            const why = backendProblem(b, new Map([...backends.owner, ...addedBackends.owner]));
            if (why) refuse(why);
            addedBackends.owner.set(b.name, plugin.id);
            addedBackends.items.push({ ...b });
          },
        };
      if (plugin.uses.includes('commands'))
        points.commands = {
          add: (c) => {
            const why = commandProblem(c, plugin.id, new Map([...commands.owner, ...addedCommands.owner]));
            if (why) refuse(why);
            addedCommands.owner.set(c.id, plugin.id);
            addedCommands.items.push({ ...c });
          },
        };
      try {
        plugin.register(Object.freeze(points));
      } catch (e) {
        if (e instanceof Error && e.message.startsWith(`The plug-in ${plugin.id}`)) throw e;
        refuse(`it failed while registering: ${e instanceof Error ? e.message : String(e)}`);
      }
      installed.push(plugin.id);
      for (const e of added) {
        exporters.push(e);
        owner.set(e.format, plugin.id);
      }
      for (const t of addedTokens) {
        tokens.push(t);
        tokenOwner.set(t.name, plugin.id);
      }
      keep(addedBackends, backends, (b) => b.name, plugin.id);
      keep(addedCommands, commands, (c) => c.id, plugin.id);
    },
    plugins: () => [...installed],
    exporters: () => [...exporters],
    themeTokens: () => tokens.map((t) => ({ ...t })),
    exporter: (format) => exporters.find((e) => e.format === format),
    writeData(format, data, info) {
      const e = exporters.find((x) => x.format === format);
      if (!e) return { ok: false, plugin: '', message: `No plug-in adds the format "${format}".` };
      const plugin = owner.get(format) ?? '';
      const written = guarded(plugin, `The export ${e.title}`, () => e.write(data, info));
      if (written.ok && typeof written.value !== 'string')
        return { ok: false, plugin, message: `The export ${e.title} of ${plugin} gave no text.` };
      return written;
    },
    storages: () => backends.items.map((b) => ({ ...b })),
    openStorage(name) {
      const b = backends.items.find((x) => x.name === name);
      if (!b) return { ok: false, plugin: '', message: `No plug-in adds the storage "${name}".` };
      return guarded(backends.owner.get(name) ?? '', `The storage ${b.title}`, () => b.open());
    },
    commands: () => commands.items.map((c) => ({ ...c })),
    runCommand(id) {
      const c = commands.items.find((x) => x.id === id);
      if (!c) return { ok: false, plugin: '', message: `No plug-in adds the command "${id}".` };
      return guarded(commands.owner.get(id) ?? '', `The command ${c.title}`, () => void c.run());
    },
    stopped: () => [...stopped].map(([plugin, why]) => ({ plugin, why })),
  };
}
