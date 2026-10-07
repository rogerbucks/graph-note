// The layout source of a drawing — the Graphviz text it is laid out from — byte-identical to graph_svg.py's (spec §12),
// written by the graph library's own port of dot_source, with the locked style (spec §3, "one style").
import GraphLayout from '@graph-note/graph-spec/src/graph-layout.js';
// The locked style lives in the library beside graph_svg.py, its first reader: one file, read by both renderers.
import STYLE from '../../../python/graph_spec/src/graph_svg.style.json' with { type: 'json' };
import type { GraphDrawing } from './drawing.ts';

export type Style = typeof STYLE;
export { STYLE };

export interface LayoutSource {
  source: string;
  /** The kinds in order of first appearance, and the readings: their colours are chosen from these. */
  kinds: string[];
  readings: string[];
}

/** The Graphviz source for a drawing, laid out across (LR) or down (TB). */
export function layoutSource(d: GraphDrawing, rankdir: 'LR' | 'TB'): LayoutSource {
  const [source, kinds, readings] = GraphLayout.dotSource(
    d.boxes.map((b) => [b.key, b.kind, b.text]),
    d.links.map((l) => [l.from, l.reading, l.to]),
    rankdir,
    STYLE,
  );
  return { source, kinds, readings };
}
