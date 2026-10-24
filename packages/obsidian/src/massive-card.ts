// A graph too large to draw, shown in its Obsidian card as its overview (editor spec §53, scale_massive_card). The
// overview is the display layer's (massive-view.ts). Obsidian gives it its colours, its layouts and each thing's
// properties, for the filters.
//
// It starts with the filter saved in the style graph (scale_filter_live). A filter chosen in edit mode is saved there;
// in reading view it is only tried. Saving draws the card again, so the overview starts again with that filter.
import { PALETTES, storedStyle, word } from '@thoughtknot/core';
import type { GraphDrawing, NoteReading, StoredGraph, StyleGraph } from '@thoughtknot/core';
import { massiveView } from '@thoughtknot/core/display/graph-view/massive-view';
import type { MassiveOptions } from '@thoughtknot/core/display/graph-view/massive-view';
import type ThoughtKnotPlugin from './main';
import { showStoredThing } from './stored-edit';
import type { StoredThing } from './stored-edit';
import { writeStyle } from './view-block';

/** Where the overview is drawn from: the note's file and graph, its reading and style, and if the card is read only. */
export interface MassiveCard {
  path: string;
  graph: string;
  reading: NoteReading;
  styling: { style: StyleGraph };
  readOnly: (card: HTMLElement) => boolean;
}

/** Shows `drawing` as its overview at the end of `root`. */
export function showMassive(plugin: ThoughtKnotPlugin, root: HTMLElement, drawing: GraphDrawing, c: MassiveCard): void {
  const { path, graph, reading } = c;
  massiveView(root, drawing, {
    graph,
    palette: PALETTES.obsidian,
    layout: (part, by) => plugin.layout(part, by),
    props: (key) => reading.world[graph]?.p(key) ?? {},
    // the Filter for the whole graph: a view's own is for when views are drawn as overviews
    chosen: c.styling.style.filters.find((f) => f.view === undefined)?.keep,
    chose: (keep) => {
      if (!c.readOnly(root)) void writeStyle(plugin, path, graph, { filter: { keep } }, word('massive.filter-saved'));
    },
  });
}

/**
 * Shows a graph from a note too big to read at once as its overview, from the local store (§53, scale_in_parts). It
 * starts with the filter saved in its style block, read against the store (storedStyle). A thing chosen shows its
 * properties under it, to change in the note's text (stored-edit.ts). In edit mode a filter chosen is saved, as for
 * any overview. A problem in the style block is said under it. Without `at`, nothing is read from the note or written to it.
 */
export function showStoredMassive(
  plugin: ThoughtKnotPlugin,
  root: HTMLElement,
  stored: StoredGraph,
  at: StoredThing | null,
): void {
  const graph = stored.drawing.graph;
  // the Filter for the whole graph: a view's own is for when views are drawn as overviews
  const read = at && storedStyle(at.note, stored);
  const saved = read?.style.filters.find((f) => f.view === undefined)?.keep;
  massiveView(root, stored.drawing, {
    graph,
    palette: PALETTES.obsidian,
    layout: (part, by) => plugin.layout(part, by),
    props: stored.props,
    ...(saved ? { chosen: saved } : {}),
    ...(at
      ? {
          picked: (key: string) => showStoredThing(plugin, root, at, key, stored.props(key)),
          chose: (keep: Parameters<NonNullable<MassiveOptions['chose']>>[0]) => {
            if (!at.readOnly)
              void writeStyle(plugin, at.path, graph, { filter: { keep } }, word('massive.filter-saved'));
          },
        }
      : {}),
  });
  // a misspelt name in the style block, said here, as the card says it for a note read whole
  for (const p of read?.problems ?? [])
    root.createEl('p', {
      cls: 'thoughtknot-hint thoughtknot-style-problem',
      text: word('massive.style-problem', { why: p.message }),
    });
}
