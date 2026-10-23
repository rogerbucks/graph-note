// A graph too large to draw, shown in its Obsidian card as its overview (editor spec §53, scale_massive_card). The
// overview is the display layer's (massive-view.ts). Obsidian gives it its colours, its layouts and each thing's
// properties, for the filters.
//
// It starts with the filter saved in the style graph (scale_filter_live). A filter chosen in edit mode is saved there;
// in reading view it is only tried. Saving draws the card again, so the overview starts again with that filter.
import { PALETTES, word } from '@thoughtknot/core';
import type { GraphDrawing, NoteReading, StoredGraph, StyleGraph } from '@thoughtknot/core';
import { massiveView } from '@thoughtknot/core/display/graph-view/massive-view';
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
 * Shows a graph from a note too big to read at once as its overview, from the local store (§53, scale_in_parts). Its
 * style graph is not read with it, so it starts with nothing filtered, and a filter chosen is only tried. A thing
 * chosen shows its properties under it, to change in the note's text (stored-edit.ts). Without `at`, they are not shown.
 */
export function showStoredMassive(
  plugin: ThoughtKnotPlugin,
  root: HTMLElement,
  stored: StoredGraph,
  at: StoredThing | null,
): void {
  massiveView(root, stored.drawing, {
    graph: stored.drawing.graph,
    palette: PALETTES.obsidian,
    layout: (part, by) => plugin.layout(part, by),
    props: stored.props,
    ...(at ? { picked: (key: string) => showStoredThing(plugin, root, at, key, stored.props(key)) } : {}),
  });
}
