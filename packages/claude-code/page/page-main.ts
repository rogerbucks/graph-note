// The browser editor's page (spec §26): what loads when the pane opens the server's address. It installs the page's host
// under the shared display layer, takes the token out of the address, reads the settings and the note from the server,
// and shows the note: its Markdown rendered with raw HTML off, and its first graph drawn through the layout worker, its
// words beside it. Whatever goes wrong is said in words on the page; it is never left blank.
import { installDomHelpers } from '@graph-note/core/display/dom-helpers';
import { installHost, notice } from '@graph-note/core/display/host';
import { toggleExportForm } from '@graph-note/core/display/export/export-form';
import { button } from '@graph-note/core/display/graph-view/view-bar';
import { gqlBlocks } from '../../core/src/blocks.ts';
import { readNote } from '../../core/src/drawing.ts';
import { browserHost, PHONE_WIDTH } from './browser-host.ts';
import { exportCalls } from './export-calls.ts';
import { exportingOf, localDay } from './export-run.ts';
import { DARK, showGraph } from './graph-section.ts';
import { PNG_PIXEL_LIMIT, rasterise } from './png.ts';
import { pageLayouts } from './layout-runner.ts';
import { renderMarkdown } from './markdown.ts';
import { serverCalls, takeFragment } from './server-calls.ts';

/** Starts the page in `win`: its host, then the note. */
export async function startPage(win: Window & typeof globalThis): Promise<void> {
  const doc = win.document;
  installDomHelpers(win);
  installHost(browserHost(win));
  const root = doc.getElementById('gn-page');
  if (!root) return;
  const say = (text: string) => root.replaceChildren(Object.assign(doc.createElement('p'), { textContent: text }));
  const { token, note } = takeFragment(win);
  if (!token || !note) return say('Open this page from the link Claude Code gave: it carries what the editor needs.');
  try {
    const calls = serverCalls(token, win.fetch.bind(win));
    const exports = exportCalls(token, win.fetch.bind(win));
    const [settings, opened, target] = await Promise.all([
      calls.settings(),
      calls.note(note),
      exports.target(note).catch(() => null),
    ]);
    doc.documentElement.dataset.indent = settings.indent;
    const graph = doc.createElement('section');
    graph.setAttribute('class', 'gn-graph');
    const prose = doc.createElement('article');
    prose.setAttribute('class', 'gn-prose');
    root.replaceChildren(graph, prose);
    renderMarkdown(opened.text, prose);
    const layouts = pageLayouts(win);
    await showGraph(win, graph, opened.text, layouts);
    const first = readNote(gqlBlocks(opened.text).map((b) => b.text))
      .graphs.values()
      .next().value;
    if (first && target) {
      const dark = win.matchMedia(DARK);
      const exporting = exportingOf(
        {
          note: target.note,
          text: opened.text,
          settings,
          folder: target.folder,
          layout: (d, theme) => layouts.draw(d, undefined, theme),
          rasterise: (svg, size) => rasterise(win, svg, size),
          save: (files) => exports.save(note, files),
          pixelLimit: PNG_PIXEL_LIMIT,
          device: win.matchMedia(PHONE_WIDTH).matches ? 'phone' : 'desktop',
          today: () => localDay(),
          notify: notice,
        },
        first.graph,
        dark.matches ? 'dark' : 'light',
      );
      const bar = doc.createElement('div');
      bar.setAttribute('class', 'graph-note-bar');
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', `Graph ${first.graph}`);
      graph.append(bar);
      button(bar, 'Export', 'download', () => toggleExportForm(graph, exporting), 'Export');
    }
  } catch (e) {
    say(e instanceof Error ? e.message : String(e));
  }
}

void startPage(window);
