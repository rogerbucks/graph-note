// The edit pane on the page (spec §4, §26; cc_editor_opens, cc_core_only). It is the display layer's block editor, the
// one the Obsidian pane runs, opened on the page's note.
// These are all the layer's:
// - its text field over the coloured picture, and the problems with their fixes;
// - suggestions, Undo, Redo and Lock the graph;
// - the picker of the note's graph blocks, and the draft banner;
// - the drawing beside it, with its details and its quick fixes.
// These are the page's: the note behind it (page-note.ts), the settings it reads by, and the layout worker.
// The drawing is laid out in that worker, in the host's own colours. The page's theme names them (theme-css.ts). So the
// drawing follows the system's scheme with no redraw. A graph too large to lay out is its overview, in the same colours.
// A filter chosen on it is saved in the note's style block, as the pane is where the note is edited (scale_filter_live).
// A block too large to read at once reads its saved filter from the note's whole text.
import { PALETTES, shownAsRead, styleEdit } from '@thoughtknot/core';
import type { Settings } from '@thoughtknot/core';
import { notice } from '@thoughtknot/core/display/host';
import { BlockEditor } from '@thoughtknot/core/display/editor/block-editor';
import { directed } from '@thoughtknot/core/display/editor/pane-drawing';
import type { PaneHost } from '@thoughtknot/core/display/editor/pane-drawing';
import type { LayoutRunner } from '../../core/src/layout-worker.ts';
import type { PageNote } from './page-note.ts';
import { word } from '../../core/src/words.ts';

/**
 * The pane's host: the settings as they are, read only, and a graph laid out by the page's worker under the core's
 * limits. With `note`, a filter chosen on an overview is written into it, and the page says whether it was.
 */
export function paneHost(settings: Settings, layouts: LayoutRunner, note?: PageNote): PaneHost {
  return {
    settings: () => settings,
    layout: (drawing, owner) => layouts.draw(directed(drawing, settings.direction), owner).then(shownAsRead),
    palette: PALETTES.system,
    ...(note && {
      noteText: () => note.text,
      saveFilter: (graph, keep) => {
        const r = styleEdit(note.text, graph, { filter: { keep } });
        if ('refused' in r) return notice(r.refused);
        void note.writeWhole(r.note).then((w) => notice(w.ok ? word('massive.filter-saved') : w.why));
      },
    }),
  };
}

/**
 * The block editor opened on `note` in `into`, loaded and ready. It opens the note's first graph block. When the note
 * has no graph, it opens none, and the pane says so in words. The caller unloads it to stop it.
 */
export async function openEditorPane(
  into: HTMLElement,
  note: PageNote,
  settings: Settings,
  layouts: LayoutRunner,
): Promise<BlockEditor> {
  const editor = new BlockEditor(paneHost(settings, layouts, note), 'pane', note);
  editor.load();
  editor.mount(into);
  await editor.open('', -1);
  return editor;
}
