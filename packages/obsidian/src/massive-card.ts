// A graph too large to draw, shown in its Obsidian card as its overview (editor spec §53, scale_massive_card). The
// overview is the display layer's (massive-view.ts). Obsidian gives it its colours, its layouts and each thing's
// properties, for the filters.
import { PALETTES } from '@thoughtknot/core';
import type { GraphDrawing, NoteReading } from '@thoughtknot/core';
import { massiveView } from '@thoughtknot/core/display/graph-view/massive-view';
import type ThoughtKnotPlugin from './main';

/** Shows `drawing`, graph `graph` of `reading`, as its overview at the end of `root`. */
export function showMassive(
  plugin: ThoughtKnotPlugin,
  root: HTMLElement,
  drawing: GraphDrawing,
  graph: string,
  reading: NoteReading,
): void {
  massiveView(root, drawing, {
    graph,
    palette: PALETTES.obsidian,
    layout: (part, by) => plugin.layout(part, by),
    props: (key) => reading.world[graph]?.p(key) ?? {},
  });
}
