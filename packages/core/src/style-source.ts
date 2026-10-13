// Nudges applied to the layout (editor spec §6): a step after the layout source is made, never a change to it, so the
// source stays byte-identical to the Python library's (spec §12) and, with no nudges, a drawing is laid out from exactly
// that source (no_nudges_layout_places). Beside puts two things on one rank, before orders them with a link never drawn,
// group draws its things in a labelled box, and direction sets the direction the drawing is laid out in.
import GraphLayout from '@graph-note/graph-spec/src/graph-layout.js';
import type { Graph } from '@graph-note/graph-spec';
import { arrowlessLinks } from './arrows.ts';
import { inlineRows } from './inline-properties.ts';
import { STYLE } from './layout.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { Nudge, StyleGraph } from './style-graph.ts';
import { diagramFor } from './types.ts';

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
  // the label as an HTML-like label, entity-escaped as the boxes' own are: a backslash or a quote is drawn as written
  [...groups].forEach(([label, members], i) =>
    added.push(
      `  subgraph cluster_${i + 1} {label=<${GraphLayout.escape(label)}>; fontname="${STYLE.font}"; ` +
        `fontsize=${STYLE.kind_font_size}; fontcolor="#0000fe"; color="#0000fe"; style="rounded"; ` +
        `${members.map((k) => `${id(k)}; `).join('')}}`,
    ),
  );
  if (!added.length) return dot;
  const end = dot.lastIndexOf('}');
  const nudged = `${dot.slice(0, end)}${added.join('\n')}\n${dot.slice(end)}`;
  // the layout source puts unlinked things of one kind on one rank; without newrank, Graphviz takes such things out of
  // a group's box without a word. Only when a group is written, so any other source stays the Python library's
  if (!groups.size) return nudged;
  const open = nudged.indexOf('{') + 1;
  return `${nudged.slice(0, open)}\n  newrank=true;${nudged.slice(open)}`;
}

/** The drawing laid out in the direction its style's direction nudge sets; the same drawing when it sets none. */
export function nudgedDrawing(drawing: GraphDrawing, style: Pick<StyleGraph, 'direction'>): GraphDrawing {
  return style.direction ? { ...drawing, direction: style.direction } : drawing;
}

/**
 * The drawing as its style graph draws it in `view` (none: the whole graph), as every host draws a graph, a view or an
 * export: in the direction its direction nudge sets, with its nudges (§6), the links it draws without their arrowheads
 * (§15), the properties it shows inline (§14), their values from `g`, the graph as read (none: no property shown), and
 * laid out as the diagram type it chooses while the data fits it (§15, types.ts); a network otherwise.
 */
export function styledDrawing(drawing: GraphDrawing, style: StyleGraph, g?: Graph, view?: string): GraphDrawing {
  const arrowless = arrowlessLinks(drawing, style, view),
    inline = g ? inlineRows(drawing, g, style, view) : undefined,
    { plan } = diagramFor(drawing, style, g, view);
  return {
    ...nudgedDrawing(drawing, style),
    nudges: style.nudges,
    ...(arrowless.length ? { arrowless } : {}),
    ...(inline && (inline.boxes.length || inline.links.length) ? { inline } : {}),
    ...(plan ? { diagram: plan } : {}),
  };
}
