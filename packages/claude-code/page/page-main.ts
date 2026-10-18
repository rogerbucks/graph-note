// The browser editor's page (spec §26): what loads when the pane opens the server's address. It installs the page's host
// under the shared display layer, takes the token out of the address, reads the settings and the note from the server,
// and shows the note: its Markdown rendered with raw HTML off, and, beside it, the edit pane of the Obsidian host (the
// layer's block editor: the drawing with its details, the text, the problems, Undo, Redo and Lock the graph). What Claude has
// proposed for the note is a card under the graph, for the user to accept or reject; the page follows the note's changes,
// so a proposal appears as it lands. Whatever goes wrong is said in words on the page; it is never left blank.
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
import { focusCards, showCards } from './proposal-card.ts';
import type { Decide } from './proposal-card.ts';
import { decide, proposalsIn } from './proposal-review.ts';
import { serverCalls, takeFragment } from './server-calls.ts';

/** Starts the page in `win`: its host, then the note. */
export async function startPage(win: Window & typeof globalThis): Promise<void> {
  const doc = win.document;
  installDomHelpers(win);
  installHost(browserHost(win));
  // the whole page reads in the browser's language's direction, so its own parts mirror with the shared ones (rtl_mirrors)
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
  if (!token || !note) return say('Open this page from the link Claude Code gave: it carries what the editor needs.');
  try {
    const calls = serverCalls(token, win.fetch.bind(win));
    const exports = exportCalls(token, win.fetch.bind(win));
    const notes = noteCalls(token, win.fetch.bind(win));
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
    prose.setAttribute('aria-label', 'The note');
    root.replaceChildren(graph, cards, prose);
    const layouts = pageLayouts(win);
    const status = doc.getElementById('gn-notices');
    // a decision or a refusal is said in the page's status region, which a screen reader announces
    const announce = (text: string) => void (status && (status.textContent = text));
    // the note as the page has it: the editor's, so that what is typed, a decision and a change on disk all write against one version
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
    // the graph as plain-English sentences, under the editor, made again with the note (cc_text_version)
    let words: HTMLElement | null = null;
    const addTextVersion = () => {
      words?.remove();
      const first = readNote(gqlBlocks(page.text).map((b) => b.text))
        .graphs.values()
        .next().value;
      words = first ? graph.appendChild(textVersionSection(doc, first)) : null;
    };
    // everything but the editor, which draws itself from what is typed and from the changes the note tells it of; the
    // keyboard stays on the control it was on when a change on disk draws the page again
    const draw = () =>
      keepFocus(root, () => {
        renderMarkdown(page.text, prose);
        showCards(cards, proposalsIn(page.text), decideOn, announce);
        addExportBar();
        addTextVersion();
        return Promise.resolve();
      });
    // the user's accept or reject: the core's review on the note, written by the page's own version-checked write
    const decideOn: Decide = async (id, action, which, staleSeen) => {
      const done = decide(page.text, id, action, which, settings.decider, staleSeen);
      if (!done.ok) return `Nothing was written: ${done.reason}`;
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
          return announce(`The note is no longer shown: ${line.gone}`);
        }
        if (line.version === page.version) return;
        page.feed(line);
        announce('The note changed, and is shown again as it now is.');
      })
      .catch(() => announce('The editor stopped sending changes to the note.'));
  } catch (e) {
    say(e instanceof Error ? e.message : String(e));
  }
}

void startPage(window);
