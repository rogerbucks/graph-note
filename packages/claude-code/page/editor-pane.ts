// The edit pane on the page (spec §4, §26; cc_editor_opens, cc_core_only): the display layer's block editor, the one the
// Obsidian pane runs, opened on the page's note. Its text field over the coloured picture, the problems with their fixes,
// suggestions, Undo, Redo and Lock the graph, the picker of the note's graph blocks, the draft banner and the drawing beside
// it, with its details and its quick fixes, are all the layer's; what is the page's is the note behind it (page-note.ts),
// the settings it reads by, and the layout worker the drawing is laid out in. The drawing is laid out in the host's own
// colours, which the page's theme names (theme-css.ts), so it follows the system's scheme with no redraw.
import { shownAsRead } from '@thoughtknot/core';
import type { Settings } from '@thoughtknot/core';
import { BlockEditor } from '@thoughtknot/core/display/editor/block-editor';
import { directed } from '@thoughtknot/core/display/editor/pane-drawing';
import type { PaneHost } from '@thoughtknot/core/display/editor/pane-drawing';
import type { LayoutRunner } from '../../core/src/layout-worker.ts';
import type { PageNote } from './page-note.ts';

/** The pane's host: the settings as they are, read only, and a graph laid out by the page's worker under the core's limits. */
export function paneHost(settings: Settings, layouts: LayoutRunner): PaneHost {
  return {
    settings: () => settings,
    layout: (drawing, owner) => layouts.draw(directed(drawing, settings.direction), owner).then(shownAsRead),
  };
}

/**
 * The block editor opened on `note` in `into`, loaded and ready: the note's first graph block, or none when it has no
 * graph, in which case the pane says so in words. The caller unloads it to stop it.
 */
export async function openEditorPane(
  into: HTMLElement,
  note: PageNote,
  settings: Settings,
  layouts: LayoutRunner,
): Promise<BlockEditor> {
  const editor = new BlockEditor(paneHost(settings, layouts), 'pane', note);
  editor.load();
  editor.mount(into);
  await editor.open('', -1);
  return editor;
}
