// The plug-in interface (editor spec §43, plugin_interface and plugin_manifest_limits): one typed, versioned way in for
// what Graph Note can be extended with, used by the built-in ones too. A plug-in names itself, the interface version it
// was built for and, in its manifest, the extension points it uses; it is given only those. What it adds is checked as it
// is added, and a call into it that throws is caught and named, never let through to blank a drawing. The first
// extension point is the data exports; diagram types, graph steps and sources, storage, AI providers, commands and
// theme tokens join it one at a time, each with its own contract suite (plugins-contract.ts).
import type { DataInfo, ExportedData } from './export-data-model.ts';

/** The version of the plug-in interface; a plug-in built for another is refused. */
export const PLUGIN_API = '1';

/** The extension points a plug-in may use, as its manifest names them. */
export const EXTENSION_POINTS = ['exports'] as const;

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

/** What a plug-in is given to add to: only the points its manifest names. */
export interface ExtensionPoints {
  exports?: { add: (exporter: DataExporter) => void };
}

/** A plug-in: who it is, what it uses, and what it adds. */
export interface GraphNotePlugin {
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

/** The plug-ins installed and what each added; one for each host, made by `pluginRegistry`. */
export interface PluginRegistry {
  /** Installs `plugin`; throws, saying why, when its manifest or what it adds is refused, and then installs none of it. */
  register: (plugin: GraphNotePlugin) => void;
  /** The ids of the plug-ins installed, in the order they were. */
  plugins: () => string[];
  /** Every data export added, in the order added. */
  exporters: () => DataExporter[];
  /** The export of `format`, or undefined. */
  exporter: (format: string) => DataExporter | undefined;
  /** The data written by the export of `format`, or what went wrong and whose plug-in it was. */
  writeData: (format: string, data: ExportedData, info: DataInfo) => PluginResult<string>;
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

/** A registry with no plug-ins installed yet. */
export function pluginRegistry(): PluginRegistry {
  const installed: string[] = [];
  const exporters: DataExporter[] = [];
  const owner = new Map<string, string>();
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
    },
    plugins: () => [...installed],
    exporters: () => [...exporters],
    exporter: (format) => exporters.find((e) => e.format === format),
    writeData(format, data, info) {
      const e = exporters.find((x) => x.format === format);
      if (!e) return { ok: false, plugin: '', message: `No plug-in adds the format "${format}".` };
      const plugin = owner.get(format) ?? '';
      try {
        const value = e.write(data, info);
        if (typeof value !== 'string')
          return { ok: false, plugin, message: `The export ${e.title} of ${plugin} gave no text.` };
        return { ok: true, value };
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        return { ok: false, plugin, message: `The export ${e.title} of ${plugin} failed: ${why}` };
      }
    },
  };
}
