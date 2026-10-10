// Nudges applied to the layout (editor spec §6): a step after the layout source is made, never a change to it, so the
// source stays byte-identical to the Python library's (spec §12) and, with no nudges, a drawing is laid out from exactly
// that source (no_nudges_layout_places). Beside puts two things on one rank, before orders them with a link never drawn,
// group draws its things in a labelled box, and direction sets the direction the drawing is laid out in.
import GraphLayout from '@graph-note/graph-spec/src/graph-layout.js';
import { STYLE } from './layout.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { Nudge, StyleGraph } from './style-graph.ts';

const id = (key: string) => `"${key}"`;

/**
 * The Graphviz source `dot` (from `layoutSource` or `drawingSource`) with the nudges written in before its last line:
 * each beside a `{rank=same; …}` line and each before an invisible link, in the order written, after every link drawn —
 * so Graphviz numbers the drawn links as before — then one box (a cluster) for each group label, in the order first
 * written, its label in the kind caption's size and colour. A nudge naming a thing not among `keys` (the boxes drawn
 * here, as in a view that leaves it out) is left out. With nothing to add, `dot` is returned unchanged.
 */
export function nudgedSource(dot: string, nudges: readonly Nudge[], keys: Iterable<string>): string {
  const drawn = new Set(keys),
    added: string[] = [],
    groups = new Map<string, string[]>();
  for (const n of nudges) {
    const things = [n.thing, n.other].filter((k): k is string => k !== undefined);
    if (!things.length || !things.every((k) => drawn.has(k))) continue;
    if (n.word === 'beside') added.push(`  {rank=same; ${things.map(id).join('; ')};}`);
    else if (n.word === 'before') added.push(`  ${id(things[0] ?? '')} -> ${id(things[1] ?? '')} [style=invis];`);
    else if (n.word === 'group' && n.group !== undefined)
      groups.set(n.group, [...(groups.get(n.group) ?? []), ...things]);
  }
  [...groups].forEach(([label, members], i) =>
    added.push(
      `  subgraph cluster_${i + 1} {label="${GraphLayout.escape(label)}"; fontname="${STYLE.font}"; ` +
        `fontsize=${STYLE.kind_font_size}; fontcolor="#0000fe"; color="#0000fe"; style="rounded"; ` +
        `${members.map((k) => `${id(k)}; `).join('')}}`,
    ),
  );
  if (!added.length) return dot;
  const end = dot.lastIndexOf('}');
  return `${dot.slice(0, end)}${added.join('\n')}\n${dot.slice(end)}`;
}

/** The drawing laid out in the direction its style's direction nudge sets; the same drawing when it sets none. */
export function nudgedDrawing(drawing: GraphDrawing, style: Pick<StyleGraph, 'direction'>): GraphDrawing {
  return style.direction ? { ...drawing, direction: style.direction } : drawing;
}
