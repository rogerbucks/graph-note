// The changes view on the page (editor spec §41, changes_view): "Compare with…" asks the server for the note's earlier
// versions, the commits that changed it and the branches, only when pressed; the one picked is drawn with the note as
// it now is by the core's changes view, each thing and link added, removed or changed marked by its line as well as its
// hue in the scheme's own colours, and the same changes listed in words beside it. The repository's commit subjects are
// shown as text, never as markup.
import { changesView, markedChanges, NO_CHANGES } from '../../core/src/changes-view.ts';
import type { ChangesShown } from '../../core/src/changes-view.ts';
import type { GraphDrawing } from '../../core/src/note-reading.ts';
import { PALETTES } from '../../core/src/palette.ts';
import { word } from '../../core/src/words.ts';
import type { Drawn } from '../../core/src/render.ts';
import type { Refusal } from '../../core/src/layout-limits.ts';

/** One earlier version, as the server lists it. */
export interface PageVersion {
  commit: string;
  kind: 'commit' | 'branch';
  label: string;
}

/** What the section needs: the note now, the server's two calls, a layout in a fixed theme and the scheme. */
export interface ChangesDeps {
  text: () => string;
  versions: () => Promise<PageVersion[]>;
  textAt: (commit: string) => Promise<string>;
  layout: (d: GraphDrawing, theme: 'light' | 'dark') => Promise<Drawn | Refusal | null>;
  dark: () => boolean;
}

/** The id of the list of changes, which the drawing's image names as its description. */
export const CHANGES_LIST_ID = 'gn-changes-list';

/**
 * The changes of `shown` in graph `graph`, as parts to place: a drawing with every change marked by its line as well as
 * its hue, named `named` in its description, and the same changes listed in words under the id `listId`. `drawn` settles
 * once the drawing is made; each image's address is handed to `keep`, which revokes what it no longer shows.
 */
export function changesFigure(
  win: Window & typeof globalThis,
  graph: string,
  shown: ChangesShown,
  named: string,
  listId: string,
  deps: Pick<ChangesDeps, 'layout' | 'dark'>,
  keep: (url: string) => void,
): { parts: HTMLElement[]; drawn: Promise<void> } {
  const doc = win.document;
  const list = doc.createElement('ul');
  list.setAttribute('id', listId);
  if (!shown.changes.length) list.append(Object.assign(doc.createElement('li'), { textContent: NO_CHANGES }));
  for (const c of shown.changes) {
    const item = doc.createElement('li');
    item.setAttribute('class', `gn-change is-${c.mark}`);
    item.textContent = c.said;
    if (c.details.length) {
      const inner = doc.createElement('ul');
      for (const d of c.details) inner.append(Object.assign(doc.createElement('li'), { textContent: d }));
      item.append(inner);
    }
    list.append(item);
  }
  const picture = doc.createElement('div');
  picture.setAttribute('class', 'gn-drawing');
  const draw = async () => {
    const drawing = shown.reading.graphs.get(graph);
    if (!drawing) return;
    const theme = deps.dark() ? 'dark' : 'light';
    const drawn = await deps.layout(drawing, theme).catch(() => null);
    if (!drawn || 'reason' in drawn)
      return void picture.replaceChildren(
        Object.assign(doc.createElement('p'), { textContent: word('changes.not-drawn') }),
      );
    const svg = markedChanges(drawn.svg, shown, PALETTES[theme]);
    const url = win.URL.createObjectURL(new win.Blob([svg], { type: 'image/svg+xml' }));
    keep(url);
    const img = doc.createElement('img');
    img.src = url;
    img.setAttribute('alt', word('changes.alt', { name: named, count: shown.changes.length }));
    img.setAttribute('aria-describedby', listId);
    picture.replaceChildren(img);
  };
  return { parts: [picture, list], drawn: draw() };
}

/** The section's controls and result, under the graph `graph` of the note. */
export function changesSection(win: Window & typeof globalThis, graph: string, deps: ChangesDeps): HTMLElement {
  const doc = win.document;
  const section = doc.createElement('section');
  section.setAttribute('class', 'gn-changes');
  section.setAttribute('aria-label', word('changes.section'));
  const open = doc.createElement('button');
  open.setAttribute('type', 'button');
  open.textContent = word('changes.compare');
  const chooser = doc.createElement('div');
  chooser.setAttribute('class', 'gn-changes-pick');
  const result = doc.createElement('div');
  result.setAttribute('class', 'gn-changes-result');
  result.setAttribute('aria-live', 'polite');
  section.append(open, chooser, result);
  const say = (text: string) => result.replaceChildren(Object.assign(doc.createElement('p'), { textContent: text }));
  let shownUrl: string | null = null;

  const show = async (commit: string, label: string) => {
    say(word('changes.reading'));
    let shown: ChangesShown;
    try {
      shown = changesView(await deps.textAt(commit), deps.text(), graph);
    } catch (e) {
      return say(e instanceof Error ? e.message : String(e));
    }
    const heading = doc.createElement('h2');
    heading.textContent = word('changes.heading', { graph, label });
    const figure = changesFigure(
      win,
      graph,
      shown,
      word('changes.figure', { graph, label }),
      CHANGES_LIST_ID,
      deps,
      (url) => {
        if (shownUrl) win.URL.revokeObjectURL(shownUrl);
        shownUrl = url;
      },
    );
    result.replaceChildren(heading, ...figure.parts);
    await figure.drawn;
  };

  open.addEventListener('click', () => {
    void (async () => {
      say(word('changes.reading-versions'));
      let versions: PageVersion[];
      try {
        versions = await deps.versions();
      } catch (e) {
        return say(e instanceof Error ? e.message : String(e));
      }
      const label = doc.createElement('label');
      label.textContent = word('changes.version');
      const pick = doc.createElement('select');
      pick.setAttribute('id', 'gn-changes-pick');
      label.setAttribute('for', pick.id);
      for (const v of versions) {
        const option = doc.createElement('option');
        option.value = v.commit;
        option.textContent = v.label;
        pick.append(option);
      }
      const go = doc.createElement('button');
      go.setAttribute('type', 'button');
      go.textContent = word('changes.show');
      go.addEventListener('click', () => {
        const chosen = versions[pick.selectedIndex];
        if (chosen) void show(chosen.commit, chosen.label);
      });
      result.replaceChildren();
      chooser.replaceChildren(label, pick, go);
      pick.focus();
    })();
  });
  return section;
}
