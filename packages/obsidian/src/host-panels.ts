// Obsidian's own panes, drawn through the plug-in interface as any plug-in's panels are (editor spec §43,
// plugin_interface). The edit pane and the details pane are each a panel of the built-in plug-in `thoughtknot.obsidian-panels`.
// Obsidian still owns each view and its state. What a view draws in its element is shown by the registry's panel.
import { PLUGIN_API, pluginRegistry, word } from '@thoughtknot/core';
import type { PluginPanel, PluginRegistry, ThoughtKnotPlugin } from '@thoughtknot/core';

/** The id of the built-in plug-in whose panels are Obsidian's own panes. */
export const OBSIDIAN_PANELS_ID = 'thoughtknot.obsidian-panels';

/** The panes, by the word each goes by in the registry. */
export type PaneName = 'edit' | 'details';

/** What each view draws in its own element, kept by the element. */
const drawers = new WeakMap<object, (el: HTMLElement) => void>();

/** The panel for a pane: it draws what the view of the element it is shown in gave. */
const panel = (id: PaneName, title: string): PluginPanel => ({
  id: `${OBSIDIAN_PANELS_ID}.${id}`,
  title,
  render: (el) => {
    drawers.get(el)?.(el as HTMLElement);
  },
});

/** The panels of the plug-in: Obsidian's edit pane and details pane. */
export function hostPanels(): PluginPanel[] {
  return [panel('edit', word('editor.pane-title')), panel('details', word('details.pane-title'))];
}

/** The built-in plug-in whose panels are Obsidian's own panes. */
export const OBSIDIAN_PANELS: ThoughtKnotPlugin = {
  id: OBSIDIAN_PANELS_ID,
  version: '1.0.0',
  api: PLUGIN_API,
  uses: ['panels'],
  register: (points) => {
    for (const p of hostPanels()) points.panels?.add(p);
  },
};

let held: PluginRegistry | undefined;
/** The registry the panes are drawn through, made on first use. */
export function panelRegistry(): PluginRegistry {
  if (!held) {
    held = pluginRegistry({ timeLimit: Infinity });
    held.register(OBSIDIAN_PANELS);
  }
  return held;
}

/** Draws the pane `id` into `el`, through its panel, by `draw`. What went wrong, if it did, in the reader's language. */
export function showPane(id: PaneName, el: HTMLElement, draw: (el: HTMLElement) => void): string | null {
  drawers.set(el, draw);
  const r = panelRegistry().showPanel(`${OBSIDIAN_PANELS_ID}.${id}`, el);
  return r.ok ? null : r.message;
}
