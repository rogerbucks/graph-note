// The browser editor's page (spec §26): what loads when the pane opens the server's address. It installs the page's host
// under the shared display layer, takes the token out of the address, reads the settings and the note from the server,
// and shows the note: its Markdown rendered with raw HTML off, and its first graph drawn through the layout worker, its
// words beside it. Whatever goes wrong is said in words on the page; it is never left blank.
import { installHost } from '@graph-note/core/display/host';
import { installDomHelpers } from '@graph-note/core/display/dom-helpers';
import { browserHost } from './browser-host.ts';
import { showGraph } from './graph-section.ts';
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
    const [settings, opened] = await Promise.all([calls.settings(), calls.note(note)]);
    doc.documentElement.dataset.indent = settings.indent;
    const graph = doc.createElement('section');
    graph.setAttribute('class', 'gn-graph');
    const prose = doc.createElement('article');
    prose.setAttribute('class', 'gn-prose');
    root.replaceChildren(graph, prose);
    renderMarkdown(opened.text, prose);
    await showGraph(win, graph, opened.text, pageLayouts(win));
  } catch (e) {
    say(e instanceof Error ? e.message : String(e));
  }
}

void startPage(window);
