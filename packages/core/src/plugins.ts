// The plug-in interface (editor spec §43, plugin_interface and plugin_manifest_limits). It is one typed, versioned way
// in for what ThoughtKnot can be extended with, used by the built-in ones too. A plug-in names itself and the interface
// version it was built for. In its manifest it names the extension points it uses; it is given only those. What it adds
// is checked as it is added. A call into it that throws is caught and named, never let through to blank a drawing. The
// first extension point is the data exports, and the second the theme tokens (§44, plugin_theme_tokens). A plug-in
// inherits the core's design tokens and may add colours of its own, each meeting the locked contrast (theme-tokens.ts).
// The third is note storage (§41, storage_contract), and the fourth the commands a person runs. A call over the time
// limit is named and its answer dropped. Its plug-in is stopped, so it never holds a drawing up again. Then come panels,
// and graph sources and steps, whose graphs are held as joined graphs (plugin-sources.ts, trust_source_joined).
// Then AI providers, and diagram types, which give back marks as data that the core draws (plugin-diagrams.ts). Each
// comes with its own contract suite (plugins-contract.ts).
import type { DataInfo, ExportedData } from './export-data-model.ts';
import type { NoteStorage } from './note-storage.ts';
import { backendProblem, commandProblem, exporterProblem, panelProblem } from './plugin-points.ts';
import { HOST_ABILITIES, sourceProblem, stepProblem } from './plugin-points.ts';
import type { DataExporter, PluginSource, PluginStep, HostAbilities, HostAbility } from './plugin-points.ts';
import type { PanelRoot, PluginCommand, PluginPanel, StorageBackend } from './plugin-points.ts';
import { heldGraph, stepInputs } from './plugin-sources.ts';
import type { JoinedGraph } from './plugin-sources.ts';
import { pluginCalls } from './plugin-calls.ts';
import { guardedProvider, providerProblem } from './plugin-ai.ts';
import type { AiProvider } from './plugin-ai.ts';
import { diagramProblem, drawnDiagram } from './plugin-diagrams.ts';
import type { DiagramSpace, PluginDiagram } from './plugin-diagrams.ts';
import type { GraphShape } from './types-shape.ts';
import type { PluginResult } from './plugin-calls.ts';
import { gatedFiles } from './plugin-files.ts';
import type { FilesOffer } from './plugin-files.ts';
export type { DataExporter, HostAbilities, HostAbility, PanelRoot, PluginCommand } from './plugin-points.ts';
export type { PluginSource, PluginStep, GivenGraph, PluginPanel, StorageBackend } from './plugin-points.ts';
export { HOST_ABILITIES } from './plugin-points.ts';
import { THEME_TOKENS, themeTokenProblem } from './theme-tokens.ts';
import type { ThemeToken } from './theme-tokens.ts';

/** The version of the plug-in interface; a plug-in built for another is refused. */
export const PLUGIN_API = '1';

/** The extension points a plug-in may use, as its manifest names them. */
export const EXTENSION_POINTS = [
  'exports',
  'theme',
  'storage',
  'commands',
  'panels',
  'sources',
  'steps',
  'ai',
  'diagrams',
] as const;

/** One of the extension points. */
export type ExtensionPoint = (typeof EXTENSION_POINTS)[number];

/** What a plug-in is given to add to: only the points its manifest names. */
export interface ExtensionPoints {
  exports?: { add: (exporter: DataExporter) => void };
  /** The theme: the core's tokens, which a plug-in's styles may name, and a way to add colours of its own. */
  theme?: { core: readonly string[]; add: (token: ThemeToken) => void };
  storage?: { add: (backend: StorageBackend) => void };
  commands?: { add: (command: PluginCommand) => void };
  panels?: { add: (panel: PluginPanel) => void };
  sources?: { add: (source: PluginSource) => void };
  steps?: { add: (step: PluginStep) => void };
  ai?: { add: (provider: AiProvider) => void };
  diagrams?: { add: (diagram: PluginDiagram) => void };
  /** The host's abilities the manifest names, and no other (plugin_manifest_limits). */
  host?: Partial<HostAbilities>;
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
  /** The host's abilities it uses, also in its manifest; none unless named. */
  abilities?: HostAbility[];
  /** Adds what it brings, through the points it is given. */
  register: (points: ExtensionPoints) => void;
}

export type { PluginResult } from './plugin-calls.ts';

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/** How long a call into a plug-in may run, in milliseconds, before the plug-in is stopped. */
export const PLUGIN_TIME_LIMIT = 2000;

/** The host's abilities a registry may hand out; settings are made for each plug-in, kept apart from the others'. */
export interface HostOffer {
  notice?: HostAbilities['notice'];
  settingsFor?: (pluginId: string) => HostAbilities['settings'];
  secrets?: HostAbilities['secrets'];
  /** The notes, given to each plug-in through the note gate (plugin-files.ts, TRUST-16). */
  files?: FilesOffer;
}

/**
 * The host's secrets as one plug-in sees them: only those named under its own id, such as `acme.one.token`. Any other
 * name, an AI model's key or another plug-in's, gives null, and the host is never asked for it (TRUST-15).
 */
const ownSecrets = (store: HostAbilities['secrets'], pluginId: string): HostAbilities['secrets'] =>
  Object.freeze({
    get: (name: string) =>
      name.startsWith(`${pluginId}.`) && name.length > pluginId.length + 1 ? store.get(name) : null,
  });

/** What a registry is made with: the host's abilities, how long a call may run, and the clock it is timed by. */
export interface RegistryOptions {
  /** What the host offers; a plug-in naming an ability it does not offer is refused. */
  host?: HostOffer;
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
  /** Every panel added, in the order added. */
  panels: () => PluginPanel[];
  /** Draws the panel `id` into `el`, or says what went wrong and whose plug-in it was. */
  showPanel: (id: string, el: PanelRoot) => PluginResult<undefined>;
  /** Every graph source added, in the order added. */
  graphSources: () => PluginSource[];
  /** The graph at `target` of the source `scheme`, held as a joined graph, or why not. `levels`: the classes set. */
  readGraph: (scheme: string, target: string, levels: readonly string[]) => Promise<PluginResult<JoinedGraph>>;
  /** Every graph step added, in the order added. */
  graphSteps: () => PluginStep[];
  /** The graph the step `id` makes from `inputs`, held as a joined graph, or why not. `levels`: the classes set. */
  runStep: (
    id: string,
    inputs: readonly JoinedGraph[],
    levels: readonly string[],
  ) => Promise<PluginResult<JoinedGraph>>;
  /** Every AI provider added, in the order added. */
  aiProviders: () => AiProvider[];
  /** The AI provider `name`, each call into it timed, caught and named, for `prepareSend`; undefined when none adds it. */
  aiProvider: (name: string) => AiProvider | undefined;
  /** Every diagram type added, in the order added. */
  diagramTypes: () => PluginDiagram[];
  /** The SVG the core draws from the marks the diagram type `type` gives for `shape` in `space`, or why not. */
  drawDiagram: (type: string, shape: GraphShape, space: DiagramSpace) => Promise<PluginResult<string>>;
  /** The plug-ins stopped for running too long, and why; nothing of theirs is called again. */
  stopped: () => StoppedPlugin[];
}

/** What a plug-in adds to one point, kept aside until all it adds has been accepted. */
interface Shelf<T> {
  items: T[];
  owner: Map<string, string>;
  /** What each is named by on its point, such as a command's `id`. */
  key: keyof T;
}

const shelf = <T>(key: keyof T): Shelf<T> => ({ items: [], owner: new Map(), key });
const nameOf = <T>(s: Shelf<T>, t: T) => String(t[s.key]);

/** Why something a plug-in adds to a point is refused, given the plug-in's id and who added each name so far. */
type Problem<T> = (t: T, pluginId: string, taken: Map<string, string>) => string | null;

/** A registry with no plug-ins installed yet. */
export function pluginRegistry(options: RegistryOptions = {}): PluginRegistry {
  const { host = {}, timeLimit = PLUGIN_TIME_LIMIT, now = Date.now } = options;
  const installed: string[] = [];
  const exporters: DataExporter[] = [];
  const owner = new Map<string, string>();
  const tokens: ThemeToken[] = [];
  const tokenOwner = new Map<string, string>();
  const backends = shelf<StorageBackend>('name');
  const commands = shelf<PluginCommand>('id');
  const panels = shelf<PluginPanel>('id');
  const sources = shelf<PluginSource>('scheme');
  const steps = shelf<PluginStep>('id');
  const providers = shelf<AiProvider>('name');
  const diagrams = shelf<PluginDiagram>('type');
  const { guarded, awaited, stopped } = pluginCalls(now, timeLimit);
  const core = Object.freeze(Object.keys(THEME_TOKENS));
  /** The abilities `named` from the host's offer, frozen, or why one cannot be given. */
  const granted = (named: HostAbility[], pluginId: string): Partial<HostAbilities> | string => {
    const missing = named.filter((a) => (a === 'settings' ? !host.settingsFor : !host[a]));
    if (missing.length) return `it asks for host abilities this host does not offer: ${missing.join(', ')}`;
    const out: Partial<HostAbilities> = {};
    if (named.includes('notice')) out.notice = host.notice;
    if (named.includes('settings')) out.settings = host.settingsFor?.(pluginId);
    if (named.includes('secrets') && host.secrets) out.secrets = ownSecrets(host.secrets, pluginId);
    if (named.includes('files') && host.files) out.files = gatedFiles(host.files, pluginId);
    return Object.freeze(out);
  };
  /** Moves what a plug-in added onto the registry's own shelf, once all of it was accepted. */
  const keep = <T>(from: Shelf<T>, to: Shelf<T>, plugin: string) => {
    for (const t of from.items) {
      to.items.push(t);
      to.owner.set(nameOf(to, t), plugin);
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
      const abilities = plugin.abilities ?? [];
      const strange = abilities.filter((a) => !(HOST_ABILITIES as readonly string[]).includes(a));
      if (strange.length) refuse(`its manifest names host abilities that do not exist: ${strange.join(', ')}`);
      const given = abilities.length ? granted(abilities, plugin.id) : null;
      if (typeof given === 'string') refuse(given);
      // what it adds is kept aside until it has all been accepted, so a refused plug-in leaves nothing behind
      const added: DataExporter[] = [];
      const taken = new Map(owner);
      const addedTokens: ThemeToken[] = [];
      const tokenTaken = new Map(tokenOwner);
      const addedBackends = shelf<StorageBackend>('name');
      const addedCommands = shelf<PluginCommand>('id');
      const addedPanels = shelf<PluginPanel>('id');
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
      /** A point whose additions are checked by `problem` against all added so far, and kept aside on `mine`. */
      const onShelf = <T>(mine: Shelf<T>, all: Shelf<T>, problem: Problem<T>, copy = (t: T): T => ({ ...t })) => ({
        add: (t: T) => {
          const why = problem(t, plugin.id, new Map([...all.owner, ...mine.owner]));
          if (why) refuse(why);
          mine.owner.set(nameOf(mine, t), plugin.id);
          mine.items.push(copy(t));
        },
      });
      const uses = (p: ExtensionPoint) => plugin.uses.includes(p);
      const addedSources = shelf<PluginSource>('scheme');
      const addedSteps = shelf<PluginStep>('id');
      const addedProviders = shelf<AiProvider>('name');
      const addedDiagrams = shelf<PluginDiagram>('type');
      if (uses('storage')) points.storage = onShelf(addedBackends, backends, (b, _, t) => backendProblem(b, t));
      if (uses('commands')) points.commands = onShelf(addedCommands, commands, commandProblem);
      if (uses('panels'))
        points.panels = onShelf(addedPanels, panels, panelProblem, (c) => ({ ...c, render: c.render.bind(c) }));
      if (uses('sources')) points.sources = onShelf(addedSources, sources, (c, _, t) => sourceProblem(c, t));
      if (uses('steps')) points.steps = onShelf(addedSteps, steps, stepProblem);
      if (uses('ai')) points.ai = onShelf(addedProviders, providers, (c, _, t) => providerProblem(c, t));
      if (uses('diagrams')) points.diagrams = onShelf(addedDiagrams, diagrams, diagramProblem);
      if (given && typeof given !== 'string') points.host = given;
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
      keep(addedBackends, backends, plugin.id);
      keep(addedCommands, commands, plugin.id);
      keep(addedPanels, panels, plugin.id);
      keep(addedSources, sources, plugin.id);
      keep(addedSteps, steps, plugin.id);
      keep(addedProviders, providers, plugin.id);
      keep(addedDiagrams, diagrams, plugin.id);
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
    panels: () => panels.items.map((c) => ({ ...c })),
    showPanel(id, el) {
      const c = panels.items.find((x) => x.id === id);
      if (!c) return { ok: false, plugin: '', message: `No plug-in adds the panel "${id}".` };
      return guarded(panels.owner.get(id) ?? '', `The panel ${c.title}`, () => void c.render(el));
    },
    graphSources: () => sources.items.map((c) => ({ ...c })),
    async readGraph(scheme, target, levels) {
      const c = sources.items.find((x) => x.scheme === scheme);
      if (!c) return { ok: false, plugin: '', message: `No plug-in adds the source "${scheme}".` };
      const plugin = sources.owner.get(scheme) ?? '',
        what = `The source ${c.title}`;
      const r = await awaited(plugin, what, () => c.read(target));
      return heldGraph(plugin, what, r, `${scheme}:${target}`, [], levels);
    },
    graphSteps: () => steps.items.map((c) => ({ ...c })),
    async runStep(id, inputs, levels) {
      const c = steps.items.find((x) => x.id === id);
      if (!c) return { ok: false, plugin: '', message: `No plug-in adds the step "${id}".` };
      const plugin = steps.owner.get(id) ?? '',
        what = `The step ${c.title}`;
      const r = await awaited(plugin, what, () => c.run(stepInputs(inputs)));
      return heldGraph(plugin, what, r, `step ${id}`, inputs, levels);
    },
    aiProviders: () => providers.items.map((c) => ({ ...c })),
    aiProvider(name) {
      const c = providers.items.find((x) => x.name === name);
      return c && guardedProvider(c, providers.owner.get(name) ?? '', guarded);
    },
    diagramTypes: () => diagrams.items.map((c) => ({ ...c })),
    async drawDiagram(type, shape, space) {
      const c = diagrams.items.find((x) => x.type === type);
      if (!c) return { ok: false, plugin: '', message: `No plug-in adds the diagram type "${type}".` };
      return drawnDiagram(diagrams.owner.get(type) ?? '', c, shape, space, awaited);
    },
    stopped: () => [...stopped].map(([plugin, why]) => ({ plugin, why })),
  };
}
