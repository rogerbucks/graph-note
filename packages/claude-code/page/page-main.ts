// The browser editor's page (spec §26): what loads when the pane opens the server's address. It installs the page's host
// under the shared display layer, takes the token out of the address, reads the settings and the note from the server,
// and shows the note: its Markdown rendered with raw HTML off, and its first graph drawn through the layout worker, its
// words beside it. What Claude has proposed for the note is a card under the graph, for the user to accept or reject;
// the page follows the note's changes, so a proposal appears as it lands. Whatever goes wrong is said in words on the
// page; it is never left blank.
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
import { noteCalls } from './note-calls.ts';
import { focusCards, showCards } from './proposal-card.ts';
import type { Decide } from './proposal-card.ts';
import { decide, proposalsIn } from './proposal-review.ts';
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
    const cards = doc.createElement('div');
    cards.setAttribute('class', 'gn-cards');
    const prose = doc.createElement('article');
    prose.setAttribute('class', 'gn-prose');
    root.replaceChildren(graph, cards, prose);
    const layouts = pageLayouts(win);
    const status = doc.getElementById('gn-notices');
    // a decision or a refusal is said in the page's status region, which a screen reader announces
    const announce = (text: string) => void (status && (status.textContent = text));
    let current = { text: opened.text, version: opened.version };
    // the export bar sits in the graph's section, which is drawn again with the graph, so it is made again with it
    const addExportBar = () => {
      const first = readNote(gqlBlocks(current.text).map((b) => b.text))
        .graphs.values()
        .next().value;
      if (!first || !target) return;
      const dark = win.matchMedia(DARK);
      const exporting = exportingOf(
        {
          note: target.note,
          text: current.text,
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
    };
    const draw = async () => {
      renderMarkdown(current.text, prose);
      showCards(cards, proposalsIn(current.text), decideOn, announce);
      await showGraph(win, graph, current.text, layouts);
      addExportBar();
    };
    // the user's accept or reject: the core's review on the note, written by the page's own version-checked write
    const decideOn: Decide = async (id, action, which, staleSeen) => {
      const done = decide(current.text, id, action, which, settings.decider, staleSeen);
      if (!done.ok) return `Nothing was written: ${done.reason}`;
      const w = await notes.write(note, done.note, current.version);
      if (!w.ok) {
        const now = await calls.note(note);
        current = { text: now.text, version: now.version };
        await draw();
        return w.why;
      }
      current = { text: done.note, version: w.version };
      await draw();
      focusCards(cards);
      const n = done.ids.length;
      return `${action === 'accept' ? 'Accepted' : 'Rejected'} ${n} ${n === 1 ? 'change' : 'changes'}.`;
    };
    const notes = noteCalls(token, win.fetch.bind(win));
    await draw();
    // a proposal that lands, or any other change on disk, is drawn when the server sends it
    void notes
      .follow(note, (line) => {
        if ('gone' in line) return announce(`The note is no longer shown: ${line.gone}`);
        if (line.version === current.version) return;
        current = line;
        void draw().then(() => announce('The note changed, and is shown again as it now is.'));
      })
      .catch(() => announce('The editor stopped sending changes to the note.'));
  } catch (e) {
    say(e instanceof Error ? e.message : String(e));
  }
}

void startPage(window);
