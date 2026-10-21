// A diagram type a plug-in from outside adds, drawn on a card (spec §15, plugin_diagram_type_named; §54). A style graph
// chooses it by its name, such as `example.sample.row`. A plug-in turned on that adds it is given the graph's shape and
// a space. The card shows the core's picture of the marks it gave back. Otherwise the graph is a network, and
// the strip says which plug-in draws it, or why it could not.
import { shapeOf } from '@thoughtknot/core';
import type { DiagramSpace, GraphDrawing, Nudge } from '@thoughtknot/core';
import type { NoteReading } from '@thoughtknot/core';
import type { DiagramShown } from '@thoughtknot/core/display/graph-view/type-strip';
import type { OutsidePlugins } from './outside-plugins';

/** The space a plug-in's diagram type is given to draw in, in pixels. */
export const PICTURE_SPACE: DiagramSpace = { width: 960, height: 540 };

/**
 * `diagram` with the picture of `drawing` by the plug-in type its style graph chooses, when a plug-in turned on draws
 * it. When that plug-in could not draw it, the strip says why instead. Any other `diagram` is given back as it is.
 */
export async function withPicture(
  outside: OutsidePlugins,
  diagram: DiagramShown,
  drawing: Pick<GraphDrawing, 'boxes' | 'links' | 'estimates'>,
  g: NoteReading['world'][string] | undefined,
  nudges: readonly Nudge[],
): Promise<DiagramShown> {
  const wanted = diagram.choice.plugin;
  if (!wanted) return diagram;
  const drawn = await outside.drawDiagram(wanted.type, shapeOf(drawing, g, nudges), PICTURE_SPACE);
  if (!drawn) return diagram;
  if ('why' in drawn) return { ...diagram, choice: { ...diagram.choice, plugin: { ...wanted, why: drawn.why } } };
  return { ...diagram, picture: { svg: drawn.svg, type: wanted.type, plugin: wanted.plugin, ...PICTURE_SPACE } };
}
