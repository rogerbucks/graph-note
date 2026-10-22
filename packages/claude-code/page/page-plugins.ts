// The plug-ins from outside on the page (spec §54, plugin_outside_page; API-10). The page runs the ones the person turned
// on in Obsidian, which the server lists and serves (server/page-plugins.ts). It turns none on and none off.
// - Each runs in a worker of its own, started from the file the server serves at `/plugins/<its SHA-256>.js`. That file
//   seals the worker before the plug-in's first line runs. Its policy keeps it off the network.
// - What it adds goes into a registry of its own, through the core's checks, as in Obsidian.
// - Its own colours join the page as a sheet of their own, light and dark (plugin_theme_tokens).
// - A diagram type it adds draws the note's graph when the graph's style graph chooses that type. The page shows the
//   core's picture of the marks it gave, as an image that runs nothing. Otherwise it says why in words.
// - A plug-in left out, or one that could not start, is said by its name, with why.
import { gqlBlocks } from '../../core/src/blocks.ts';
import { adoptTokens } from '../../core/src/display/plugin-tokens.ts';
import { readNote } from '../../core/src/drawing.ts';
import { isolatedPlugin } from '../../core/src/plugin-isolated.ts';
import type { PluginPort } from '../../core/src/plugin-isolated.ts';
import { pluginRegistry } from '../../core/src/plugins.ts';
import type { PluginRegistry } from '../../core/src/plugins.ts';
import { readStyle } from '../../core/src/style.ts';
import { diagramFor, shapeOf } from '../../core/src/types.ts';
import { PICTURE_SPACE } from '../../core/src/display/graph-view/type-strip.ts';
import { word } from '../../core/src/words.ts';

/** A plug-in as the server lists it: one it serves, by its SHA-256, or one it left out, and why. */
export type ListedPlugin = { name: string; sha: string } | { name: string; why: string };

/** The plug-ins running on the page, and what is said of those that are not. */
export interface PagePlugins {
  registries: PluginRegistry[];
  said: string[];
}

const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A port to the worker the server serves for the plug-in with SHA-256 `sha`. */
function pluginPort(win: Window & { Worker: typeof Worker }, sha: string): PluginPort {
  const worker = new win.Worker(`/plugins/${sha}.js`);
  const port: PluginPort = {
    onmessage: null,
    onerror: null,
    postMessage: (m) => worker.postMessage(m),
    terminate: () => worker.terminate(),
  };
  worker.onmessage = (e: MessageEvent) => port.onmessage?.(e as Parameters<NonNullable<PluginPort['onmessage']>>[0]);
  worker.onerror = (e) => port.onerror?.(e.message || e);
  return port;
}

/** Starts each plug-in in `list` the server serves, each in its own worker and registry. */
export async function startPlugins(
  win: Window & typeof globalThis,
  list: readonly ListedPlugin[],
): Promise<PagePlugins> {
  const registries: PluginRegistry[] = [];
  const told: string[] = [];
  const clock = {
    setTimeout: (run: () => void, ms: number) => win.setTimeout(run, ms),
    clearTimeout: (t: unknown) => win.clearTimeout(t as number),
  };
  for (const p of list) {
    if ('why' in p) {
      told.push(word('page.plugin-left', { name: p.name, why: p.why }));
      continue;
    }
    try {
      const iso = await isolatedPlugin(pluginPort(win, p.sha), { clock });
      const registry = pluginRegistry();
      try {
        registry.register(iso.plugin);
      } catch (e) {
        iso.stop();
        throw e;
      }
      adoptTokens(win.document, registry.themeTokens());
      registries.push(registry);
    } catch (e) {
      told.push(word('page.plugin-not-started', { name: p.name, why: said(e) }));
    }
  }
  return { registries, said: told };
}

/** The SVG the core drew of the marks of `type`, or why not; null when no plug-in running adds `type`. */
async function drawnBy(
  registries: readonly PluginRegistry[],
  type: string,
  shape: ReturnType<typeof shapeOf>,
): Promise<{ svg: string } | { why: string } | null> {
  for (const registry of registries) {
    if (!registry.diagramTypes().some((d) => d.type === type)) continue;
    const r = await registry.drawDiagram(type, shape, PICTURE_SPACE);
    return r.ok ? { svg: r.value } : { why: r.message };
  }
  return null;
}

/** The picture of a graph of `shape` by the plug-in type `wanted`, with what it is; or why it is not drawn. */
async function pictured(
  win: Window & typeof globalThis,
  plugins: PagePlugins,
  wanted: { type: string; plugin: string; why: string },
  shape: ReturnType<typeof shapeOf>,
): Promise<HTMLElement[]> {
  const doc = win.document;
  const line = (text: string) => Object.assign(doc.createElement('p'), { textContent: text });
  const drawn = await drawnBy(plugins.registries, wanted.type, shape);
  if (!drawn) return [line(wanted.why)];
  if ('why' in drawn) return [line(drawn.why)];
  const say = word('type.drawn-plugin', { type: wanted.type, plugin: wanted.plugin });
  const img = doc.createElement('img');
  img.src = win.URL.createObjectURL(new win.Blob([drawn.svg], { type: 'image/svg+xml' }));
  img.setAttribute('alt', say);
  return [img, line(say)];
}

/**
 * The page's plug-in section for the note `text`, or null when it has nothing to say. It holds the picture of the
 * note's first graph by the plug-in type its style graph chooses, or why that is not drawn. It also holds what is said
 * of the plug-ins not running.
 */
export async function pluginSection(
  win: Window & typeof globalThis,
  plugins: PagePlugins,
  text: string,
): Promise<HTMLElement | null> {
  const doc = win.document;
  const texts = gqlBlocks(text).map((b) => b.text);
  const reading = readNote(texts);
  const [graph] = reading.graphs.keys();
  const plain = graph === undefined ? undefined : reading.graphs.get(graph);
  const lines: HTMLElement[] = plugins.said.map((s) => Object.assign(doc.createElement('p'), { textContent: s }));
  if (graph !== undefined && plain) {
    const style = readStyle(texts, graph, reading).style;
    const wanted = diagramFor(plain, style, reading.world[graph]).plugin;
    if (wanted)
      lines.unshift(...(await pictured(win, plugins, wanted, shapeOf(plain, reading.world[graph], style.nudges))));
  }
  if (!lines.length) return null;
  const section = doc.createElement('section');
  section.setAttribute('class', 'gn-plugins');
  section.setAttribute('aria-label', word('page.plugins'));
  section.replaceChildren(...lines);
  return section;
}
