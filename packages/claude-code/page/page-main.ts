// The browser editor's page (spec §26): what loads when the pane opens the server's address. It:
// - installs the page's host under the shared display layer;
// - takes the token out of the address;
// - reads the settings and the note from the server;
// - shows the note's Markdown, rendered with raw HTML off;
// - shows the edit pane of the Obsidian host beside it. That is the layer's block editor: the drawing with its details,
//   the text, the problems, Undo, Redo and Lock the graph.
// The plug-ins turned on in Obsidian run here too, sealed, and may draw the note's graph (page-plugins.ts).
// What Claude has proposed for the note is a card under the graph, for the user to accept or reject. The page follows
// the note's changes, so a proposal appears as it lands. Whatever goes wrong is said in words on the page. It is never
// blank.
import { installDomHelpers } from '@thoughtknot/core/display/dom-helpers';
import { installHost, notice, readInHostDirection } from '@thoughtknot/core/display/host';
import { toggleExportForm } from '@thoughtknot/core/display/export/export-form';
import { button } from '@thoughtknot/core/display/graph-view/view-bar';
import { gqlBlocks } from '../../core/src/blocks.ts';
import { word } from '../../core/src/words.ts';
import { readNote } from '../../core/src/drawing.ts';
import { browserHost, PHONE_WIDTH } from './browser-host.ts';
import { openEditorPane } from './editor-pane.ts';
import { exportCalls } from './export-calls.ts';
import { exportingOf, localDay } from './export-run.ts';
import { DARK, showGraph } from './graph-section.ts';
import { changesSection } from './changes-section.ts';
import { reviewSection } from './review-section.ts';
import { keepFocus, skipLink } from './keyboard.ts';
import { PNG_PIXEL_LIMIT, rasterise } from './png.ts';
import { pageLayouts } from './layout-runner.ts';
import { textVersionSection } from './text-version.ts';
import { renderMarkdown } from './markdown.ts';
import { noteCalls } from './note-calls.ts';
import { PageNote } from './page-note.ts';
import { pluginSection, startPlugins } from './page-plugins.ts';
import { focusCards, showCards } from './proposal-card.ts';
import type { Decide } from './proposal-card.ts';
import { decide, proposalsIn } from './proposal-review.ts';
import { serverCalls, takeFragment } from './server-calls.ts';

/** Starts the page in `win`: its host, then the note. */
export async function startPage(win: Window & typeof globalThis): Promise<void> {
  const doc = win.document;
  installDomHelpers(win);
  installHost(browserHost(win));
  // the whole page reads in the browser's language's direction, so its own parts mirror with the shared ones
  // (rtl_mirrors)
  readInHostDirection(doc.documentElement);
  doc.title = word('page.title');
  const title = doc.querySelector('.gn-title');
  if (title) title.textContent = word('page.title');
  const root = doc.getElementById('gn-page');
  if (!root) return;
  const skip = doc.querySelector<HTMLElement>('.gn-skip');
  if (skip) skipLink(doc, skip);
  const say = (text: string) => root.replaceChildren(Object.assign(doc.createElement('p'), { textContent: text }));
  const { token, note } = takeFragment(win);
  if (!token || !note) return say(word('page.open-from-link'));
  try {
    const calls = serverCalls(token, win.fetch.bind(win));
    const exports = exportCalls(token, win.fetch.bind(win));
    const notes = noteCalls(token, win.fetch.bind(win));
    const [settings, opened, target, listed] = await Promise.all([
      calls.settings(),
      calls.note(note),
      exports.target(note).catch(() => null),
      calls.plugins().catch(() => []),
    ]);
    doc.documentElement.dataset.indent = settings.indent;
    const graph = doc.createElement('section');
    graph.setAttribute('class', 'gn-graph');
    const cards = doc.createElement('div');
    cards.setAttribute('class', 'gn-cards');
    const prose = doc.createElement('article');
    prose.setAttribute('class', 'gn-prose');
    prose.setAttribute('aria-label', word('page.note'));
    root.replaceChildren(graph, cards, prose);
    const layouts = pageLayouts(win);
    const status = doc.getElementById('gn-notices');
    // a decision or a refusal is said in the page's status region, which a screen reader announces
    const announce = (text: string) => void (status && (status.textContent = text));
    // the note as the page has it: the editor's. So what is typed, a decision and a change on disk all write against
    // one version
    const page = new PageNote(
      note,
      { read: calls.note, write: notes.write, keepDraft: notes.keepDraft },
      settings,
      opened,
    );
    // the export bar sits under the editor and is made again when the note changes, as its text is the note's
    let bar: HTMLElement | null = null;
    const addExportBar = () => {
      bar?.remove();
      bar = null;
      const first = readNote(gqlBlocks(page.text).map((b) => b.text))
        .graphs.values()
        .next().value;
      if (!first || !target) return;
      const dark = win.matchMedia(DARK);
      const exporting = exportingOf(
        {
          note: target.note,
          text: page.text,
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
      bar = doc.createElement('div');
      bar.setAttribute('class', 'thoughtknot-bar gn-export-bar');
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', word('bar.name', { graph: first.graph }));
      graph.append(bar);
      button(bar, word('bar.export'), 'download', () => toggleExportForm(graph, exporting), word('bar.export'));
    };
    // the graph as plain-language sentences, under the editor, made again with the note (cc_text_version)
    let words: HTMLElement | null = null;
    const addTextVersion = () => {
      words?.remove();
      const first = readNote(gqlBlocks(page.text).map((b) => b.text))
        .graphs.values()
        .next().value;
      words = first ? graph.appendChild(textVersionSection(doc, first)) : null;
    };
    // the plug-ins turned on in Obsidian, each in its own sealed worker, and the note's graph by a type one adds
    // (plugin_outside_page)
    const plugins = await startPlugins(win, listed);
    let pluginPart: HTMLElement | null = null;
    const addPlugins = async () => {
      const next = await pluginSection(win, plugins, page.text);
      const shown = pluginPart?.querySelector('img')?.src;
      if (shown) win.URL.revokeObjectURL(shown);
      pluginPart?.remove();
      pluginPart = next && graph.appendChild(next);
    };
    // everything but the editor, which draws itself from what is typed and from the changes the note tells it of. The
    // keyboard stays on the control it was on when a change on disk draws the page again
    const draw = () =>
      keepFocus(root, () => {
        renderMarkdown(page.text, prose);
        showCards(cards, proposalsIn(page.text), decideOn, announce);
        addExportBar();
        addTextVersion();
        return addPlugins();
      });
    // the user's accept or reject: the core's review on the note, written by the page's own version-checked write
    const decideOn: Decide = async (id, action, which, staleSeen) => {
      const done = decide(page.text, id, action, which, settings.decider, staleSeen);
      if (!done.ok) return word('page.not-written', { why: done.reason });
      const w = await page.writeWhole(done.note);
      if (!w.ok) {
        if (!w.theirs) {
          const now = await calls.note(note);
          page.feed({ text: now.text, version: now.version });
        }
        return w.why;
      }
      focusCards(cards);
      const n = done.ids.length;
      return `${action === 'accept' ? 'Accepted' : 'Rejected'} ${n} ${n === 1 ? 'change' : 'changes'}.`;
    };
    page.onSeen = () => void draw();
    const pane = doc.createElement('div');
    pane.setAttribute('class', 'gn-pane');
    graph.append(pane);
    await openEditorPane(pane, page, settings, layouts);
    if (!page.session) await showGraph(win, pane, page.text, layouts);
    // the changes view: the note now against an earlier version the user picks, read only when asked (changes_view)
    const shownGraph = readNote(gqlBlocks(page.text).map((b) => b.text))
      .graphs.values()
      .next().value;
    if (shownGraph)
      graph.append(
        changesSection(win, shownGraph.graph, {
          text: () => page.text,
          versions: () => calls.versions(note),
          textAt: (commit) => calls.textAt(note, commit),
          layout: (d, theme) => layouts.draw(d, undefined, theme),
          dark: () => win.matchMedia(DARK).matches,
        }),
      );
    // the repository's pull requests, merges and commits, read from GitHub only when asked (github_review_items)
    graph.append(
      reviewSection(win, {
        items: () => calls.reviews(note),
        files: (item) => calls.review(note, item),
        layout: (d, theme) => layouts.draw(d, undefined, theme),
        dark: () => win.matchMedia(DARK).matches,
      }),
    );
    await draw();
    // a proposal that lands, or any other change on disk, is drawn when the server sends it
    void notes
      .follow(note, (line) => {
        if ('gone' in line) {
          page.feed(line);
          return announce(word('page.note-gone', { why: line.gone }));
        }
        if (line.version === page.version) return;
        page.feed(line);
        announce(word('page.note-changed'));
      })
      .catch(() => announce(word('page.follow-stopped')));
  } catch (e) {
    say(e instanceof Error ? e.message : String(e));
  }
}

void startPage(window);
