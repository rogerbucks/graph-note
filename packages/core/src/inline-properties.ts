// Properties shown inline (editor spec §14): which properties of each box and link a drawing shows, as its style graph
// switches them on or off for a kind, a thing or a relationship type, in the whole graph or a view (properties_switch,
// properties_remembered); and those rows written into the layout source below the text of their box or the reading of
// their link, at the kind caption's size — the smallest the locked style draws — in the box's text colour or the link's
// label colour, so they keep the locked contrast (properties_readable). A box or link that would be crowded shows whole
// properties up to `INLINE_ROWS` rows and says how many are hidden, never more (crowded_properties). The Python library
// shows them the same way (`graphspec/style/inline.py`), held to this byte for byte.
import GraphLayout from '@thoughtknot/graph-spec/src/graph-layout.js';
import type { Graph } from '@thoughtknot/graph-spec';
import { LINK_LINE, linkTypes } from './arrows.ts';
import { STYLE } from './layout.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { Show, StyleGraph } from './style-graph.ts';

/** The most rows of properties a box or link shows, the row saying how many are hidden among them. */
export const INLINE_ROWS = 4;

/** One property shown: its name, and its value in words. */
export type PropertyRow = [string, string];

/** The properties a drawing shows inline: for each box (by key) and each link (by index) that shows any, its rows. */
export interface InlineProperties {
  boxes: [string, PropertyRow[]][];
  links: [number, PropertyRow[]][];
}

/**
 * A value as it is said inline: text as written, a number as JavaScript writes it, true or false, and a date or an
 * instant as the reader keeps it (its ISO day, or its UTC time).
 */
export function valueText(v: unknown): string {
  if (v && typeof v === 'object' && 's' in v) return String(v.s);
  return String(v);
}

/** What a property of a box or link is shown by: a Show for it, in scope, and how particular that Show is. */
type Target = { key: string; kinds: string[] } | { type: string };

const fits = (s: Show, t: Target): boolean =>
  'type' in t
    ? s.type === t.type
    : s.thing !== undefined
      ? s.thing === t.key
      : s.kind !== undefined && t.kinds.includes(s.kind);

/**
 * The rows a box or link shows in `view`: for each property a Show in scope names, in the order first named, the most
 * particular such Show decides — one for the view over one for the whole graph, then one for the thing over one for its
 * kind, the first written when two are as particular — and it is shown when that Show is on and the value is there.
 */
function rowsFor(shows: readonly Show[], view: string | undefined, target: Target, props: Record<string, unknown>) {
  const chosen = new Map<string, { on: boolean; rank: number }>();
  for (const s of shows) {
    if ((s.view !== undefined && s.view !== view) || !fits(s, target)) continue;
    const rank = (s.view !== undefined ? 2 : 0) + (s.thing !== undefined ? 1 : 0),
      was = chosen.get(s.property);
    if (!was || rank > was.rank) chosen.set(s.property, { on: s.inline === 'on', rank });
  }
  return [...chosen].flatMap(([p, c]): PropertyRow[] =>
    c.on && props[p] !== undefined ? [[p, valueText(props[p])]] : [],
  );
}

/** The properties of the drawing's `index`-th link: of the link it says it is (a view's), else of its place. */
function linkProps(drawing: Pick<GraphDrawing, 'boxes' | 'links'>, g: Graph, index: number): Record<string, unknown> {
  const l = drawing.links[index];
  if (l?.edge !== undefined) return g.edges[l.edge]?.[3] ?? {};
  const drawn = new Set(drawing.boxes.map((b) => b.key));
  return g.edges.filter(([s, , t]) => drawn.has(s) && drawn.has(t))[index]?.[3] ?? {};
}

/**
 * The properties `drawing` shows inline in `view` (none: the whole graph), with their values from `g`, the graph as read;
 * empty when its style graph switches none on.
 */
export function inlineRows(
  drawing: Pick<GraphDrawing, 'boxes' | 'links' | 'estimates'>,
  g: Graph,
  style: Pick<StyleGraph, 'shows'>,
  view?: string,
): InlineProperties {
  const out: InlineProperties = { boxes: [], links: [] };
  if (!style.shows.length) return out;
  for (const b of drawing.boxes) {
    const rows = rowsFor(style.shows, view, { key: b.key, kinds: b.kind ? b.kind.split(' · ') : [] }, g.p(b.key));
    if (rows.length) out.boxes.push([b.key, rows]);
  }
  // a link guessed from a near miss of its type goes by the type it is taken for, as its arrowhead does (arrows.ts)
  linkTypes(drawing).forEach((type, i) => {
    const rows = rowsFor(style.shows, view, { type }, linkProps(drawing, g, i));
    if (rows.length) out.links.push([i, rows]);
  });
  return out;
}

/**
 * One property's lines, never more than fit with the row saying how many are hidden (`INLINE_ROWS` less one): a value too
 * long for them is cut short at the last, which ends with an ellipsis, so it is shown in part rather than hidden. Its
 * length is counted in code points, as the wrapping counts it.
 */
function cutShort(lines: string[]): string[] {
  if (lines.length < INLINE_ROWS) return lines;
  const kept = lines.slice(0, INLINE_ROWS - 1),
    last = [...(kept.at(-1) ?? '')].slice(0, STYLE.wrap_chars - 1).join('');
  return [...kept.slice(0, -1), `${last.replace(/ +$/, '')}…`];
}

/**
 * The table rows for a box's or link's properties: a gap as the kind caption has, then each property as `name: value`
 * wrapped as a box's text is, a long one cut short; when they would take more than `INLINE_ROWS` rows, the whole properties that fit in one
 * fewer, then how many are hidden.
 */
function tableRows(rows: PropertyRow[]): string {
  const wrapped = rows.map(([name, value]) => {
    const lines = GraphLayout.wrap(`${name}: ${value}`, STYLE.wrap_chars);
    return cutShort(lines.length ? lines : ['']);
  });
  let lines = wrapped.flat();
  if (lines.length > INLINE_ROWS) {
    const kept: string[] = [];
    let shown = 0;
    for (const w of wrapped) {
      if (kept.length + w.length > INLINE_ROWS - 1) break;
      kept.push(...w);
      shown++;
    }
    const hidden = rows.length - shown;
    lines = [...kept, `${hidden} ${hidden === 1 ? 'property' : 'properties'} hidden`];
  }
  const cell = (line: string) =>
    `<tr><td cellpadding="0"><font point-size="${STYLE.kind_font_size}">${GraphLayout.escape(line)}</font></td></tr>`;
  return `<tr><td cellpadding="0" height="${STYLE.caption_gap}"></td></tr>${lines.map(cell).join('')}`;
}

/** How a box's line opens its label, a table: `  "<key>" [label=<<table `. */
const BOX_LABEL = '[label=<<table ';

/**
 * The Graphviz source `dot` with the properties of `inline` shown: a box's rows at the foot of its label's table, below
 * its text; a link's label made a table of its reading and, below it, its rows (its link line by index, in order). With
 * nothing to show, `dot` unchanged.
 */
export function inlineSource(dot: string, inline: InlineProperties | undefined): string {
  if (!inline || (!inline.boxes.length && !inline.links.length)) return dot;
  const boxes = new Map(inline.boxes.map(([key, rows]) => [`  "${key}" ${BOX_LABEL}`, rows]));
  const links = new Map(inline.links);
  let n = -1;
  return dot
    .split('\n')
    .map((line) => {
      if (LINK_LINE.test(line)) {
        const rows = links.get(++n);
        return rows
          ? line.replace(
              /\[label="([^"]*)"/,
              (_, reading: string) =>
                `[label=<<table border="0" cellborder="0" cellspacing="0" cellpadding="0"><tr><td>${reading}</td></tr>${tableRows(rows)}</table>>`,
            )
          : line;
      }
      const at = line.indexOf(BOX_LABEL);
      const rows = at < 0 ? undefined : boxes.get(line.slice(0, at + BOX_LABEL.length));
      if (!rows) return line;
      const end = line.indexOf('</table>>');
      return `${line.slice(0, end)}${tableRows(rows)}${line.slice(end)}`;
    })
    .join('\n');
}
