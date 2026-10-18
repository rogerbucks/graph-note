// Arrowheads hidden or shown (editor spec §15). This says which links a drawing draws without their arrowheads. Its
// style graph chooses that for the whole graph, a view or a relationship type (arrows_switchable). The choice is
// written into the layout source. A link keeps its arrowhead unless the style graph hides it
// (arrows_shown_unless_hidden). Only the arrowhead changes: each link is laid out from the same ends. So the drawing
// reads the same way and its links keep their reading (direction_never_lost). The Python library hides them the same
// way (`graphspec/style/arrows.py`, arrows_both_renderers).
import type { GraphDrawing } from './note-reading.ts';
import type { StyleGraph } from './style-graph.ts';

/**
 * Whether links of `type` are drawn with their arrowheads in `view` (none: the whole graph). The most particular choice
 * the style graph makes for them says so. One for the view goes over one for the whole graph. Then one for the type
 * goes over one for every link. The first written wins when two are as particular. Shown when it makes none.
 */
export function arrowsShown(style: Pick<StyleGraph, 'arrows'>, view: string | undefined, type: string): boolean {
  let chosen: { hide: boolean; rank: number } | undefined;
  for (const a of style.arrows) {
    if ((a.view !== undefined && a.view !== view) || (a.type !== undefined && a.type !== type)) continue;
    const rank = (a.view !== undefined ? 2 : 0) + (a.type !== undefined ? 1 : 0);
    if (!chosen || rank > chosen.rank) chosen = { hide: a.arrowheads === 'hide', rank };
  }
  return !chosen?.hide;
}

/**
 * The links of a drawing drawn without their arrowheads in `view`, as indexes in the order the layout source draws
 * them. That order is its links, then the links guessed from a near miss of a name (`drawingSource` adds them after).
 * Each goes by its type. A link guessed from a near miss of its type is one of the links, and goes by the type it is
 * taken for.
 */
export function arrowlessLinks(
  drawing: Pick<GraphDrawing, 'links' | 'estimates'>,
  style: Pick<StyleGraph, 'arrows'>,
  view?: string,
): number[] {
  const types = [...linkTypes(drawing), ...drawing.estimates.filter((e) => e.kind === 'name').map((e) => e.type)];
  return types.flatMap((type, i) => (arrowsShown(style, view, type) ? [] : [i]));
}

/**
 * The relationship type each of a drawing's links is styled by. That is its own, or the type it is taken for when it is
 * a link guessed from a near miss of its type. So its arrowhead and the properties shown with it go by that type
 * (inline-properties.ts).
 */
export function linkTypes(drawing: Pick<GraphDrawing, 'links' | 'estimates'>): string[] {
  const taken = new Map(drawing.estimates.filter((e) => e.kind === 'type').map((e) => [e.index, e.type]));
  return drawing.links.map((l, i) => taken.get(i) ?? l.type);
}

/** A line of a layout source that draws a link (never one of the nudges' invisible links). */
export const LINK_LINE = /^ {2}"[^"]*" -> "[^"]*" \[label=/;

/**
 * The Graphviz source `dot` with each link of `arrowless` drawn without its arrowhead. `arrowless` holds indexes of its
 * link lines, in order. It writes `dir=none`, in place of the `dir=back` of a link laid out from its far end. With
 * none, `dot` unchanged.
 */
export function arrowlessSource(dot: string, arrowless: readonly number[]): string {
  if (!arrowless.length) return dot;
  const hidden = new Set(arrowless);
  let n = -1;
  return dot
    .split('\n')
    .map((line) => {
      if (!LINK_LINE.test(line) || !hidden.has(++n)) return line;
      return line.endsWith(', dir=back];')
        ? `${line.slice(0, -'dir=back];'.length)}dir=none];`
        : `${line.slice(0, -2)}, dir=none];`;
    })
    .join('\n');
}
