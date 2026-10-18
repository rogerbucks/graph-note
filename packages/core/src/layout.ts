// The layout source of a drawing — the Graphviz text it is laid out from — byte-identical to graph_svg.py's (spec §12),
// written by the graph library's own port of dot_source, with the locked style (spec §3, "one style").
import GraphLayout from '@thoughtknot/graph-spec/src/graph-layout.js';
// The locked style lives in the library beside graph_svg.py, its first reader: one file, read by both renderers.
import STYLE from '../../../python/graph_spec/src/graph_svg.style.json' with { type: 'json' };
import type { GraphDrawing } from './note-reading.ts';

/** The drawing's style: the same settings file the Python library draws with. */
export type Style = typeof STYLE;
export { STYLE };

/** What is handed to Graphviz for one direction: the DOT source, and the kinds and readings to colour it by. */
export interface LayoutSource {
  source: string;
  /** The kinds in order of first appearance, and the readings: their colours are chosen from these. */
  kinds: string[];
  readings: string[];
}

/**
 * The Graphviz source for a drawing, laid out across (LR) or down (TB). A box drawn under a suggested name (spec §4) is
 * dashed and labelled as suggested here, as graph_svg.py marks it, so every reader draws it alike.
 */
export function layoutSource(d: GraphDrawing, rankdir: 'LR' | 'TB'): LayoutSource {
  const [source, kinds, readings] = GraphLayout.dotSource(
    d.boxes.map((b) => [b.key, b.kind, b.text]),
    d.links.map((l) => [l.from, l.reading, l.to]),
    rankdir,
    STYLE,
    d.boxes.filter((b) => b.suggested).map((b) => b.key),
  );
  return { source, kinds, readings };
}

/**
 * The source the drawing is laid out from: the layout source, with estimated links (spec §3) drawn dashed and marked with
 * a warning sign and the word "estimated" — so a guess is never shown by line style alone. With no estimates it is the
 * layout source exactly, as graph_svg.py writes it.
 */
export function drawingSource(d: GraphDrawing, rankdir: 'LR' | 'TB'): string {
  const lines = layoutSource(d, rankdir).source.split('\n');
  const estimates = d.estimates ?? [];
  if (!estimates.length) return lines.join('\n');
  const guess = (reading: string) =>
    `label="⚠ ${GraphLayout.escape(reading)} (estimated)", color="#0000fc", fontcolor="#0000fe", style="dashed"`;
  const edgeLines = lines.flatMap((l, i) => (/^ {2}"[^"]*" -> "[^"]*" \[label=/.test(l) ? [i] : []));
  for (const e of estimates) {
    if (e.kind !== 'type' || e.index === undefined) continue;
    const at = edgeLines[e.index];
    if (at === undefined) continue;
    lines[at] = (lines[at] ?? '').replace(
      /label="[^"]*", color="#0003[0-9a-f]{2}", fontcolor="#0004[0-9a-f]{2}"/,
      guess(e.reading),
    );
  }
  const added = estimates
    .filter((e) => e.kind === 'name')
    .map((e) => `  "${e.from}" -> "${e.to}" [${guess(e.reading)}];`);
  lines.splice(lines.length - 1, 0, ...added);
  return lines.join('\n');
}
