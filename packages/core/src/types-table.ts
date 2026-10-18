// The table, a diagram type the host draws as a plain table rather than Graphviz (editor spec §15, diagram_type_set).
// Each thing is a row, with its kind and properties, and each link a row, in the order drawn. It also holds the way in
// to a graph too large for one drawing: the table, or a view (large_way_in). And it holds the types that, wide on a
// phone, scroll one way only (wide_types_phone). Host-free.
import type { Graph } from '@thoughtknot/graph-spec';
import { valueText } from './inline-properties.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { DiagramType } from './style-graph.ts';
import { LARGE_GRAPH } from './types.ts';
import { word } from './words.ts';

/** A graph as a table: its things' columns and rows, and its links' rows, each row known by its thing or link. */
export interface DiagramTable {
  /** Thing, Kind, then each property the things carry, in the order first written. */
  columns: string[];
  rows: { key: string; cells: string[] }[];
  /** Each link: from, its reading, to, and its properties as `name: value`, by name. */
  links: { index: number; cells: [string, string, string]; properties: string }[];
}

/** The properties that give a thing its text: the one that does is its Thing cell, not a column of its own. */
const TEXT_KEYS = ['name', 'title', 'text', 'label'];

/** The drawing as a table: each thing with its kind and properties (from `g`, the graph as read), and each link. */
export function tableOf(drawing: Pick<GraphDrawing, 'boxes' | 'links'>, g?: Graph): DiagramTable {
  const own = drawing.boxes.map((b) => {
    const p = g?.nodes.has(b.key) ? g.p(b.key) : {};
    const textKey = TEXT_KEYS.find((k) => p[k] === b.text);
    return new Map(Object.entries(p).filter(([k]) => k !== 'id' && k !== textKey));
  });
  const columns = [...new Set(own.flatMap((p) => [...p.keys()]))];
  const textOf = new Map(drawing.boxes.map((b) => [b.key, b.text]));
  const drawn = new Set(drawing.boxes.map((b) => b.key));
  // a link that says which written link it is (a view's) has that link's properties; otherwise, by its place
  const edges = g?.edges.filter(([s, , t]) => drawn.has(s) && drawn.has(t)) ?? [];
  return {
    columns: [word('table.thing'), word('table.kind'), ...columns],
    rows: drawing.boxes.map((b, i) => ({
      key: b.key,
      cells: [b.text, b.kind, ...columns.map((c) => (own[i]?.has(c) ? valueText(own[i]?.get(c)) : ''))],
    })),
    links: drawing.links.map((l, index) => {
      const props = (l.edge !== undefined ? g?.edges[l.edge] : edges[index])?.[3] ?? {};
      return {
        index,
        cells: [textOf.get(l.from) ?? l.from, l.reading, textOf.get(l.to) ?? l.to],
        properties: Object.entries(props)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, v]) => `${k}: ${valueText(v)}`)
          .join(', '),
      };
    }),
  };
}

/**
 * The way in to a graph of more than `LARGE_GRAPH` things (§15, large_way_in). One drawing of them all would be
 * crowded, so the table and a view are offered, in words. Null for a smaller graph.
 */
export function wayIn(things: number): { count: number; say: string } | null {
  if (things <= LARGE_GRAPH) return null;
  return {
    count: things,
    say: `This graph has ${things} things, too many to read in one drawing: open it as a table, or make a view of the part you need.`,
  };
}

/** The types that grow long one way, and on a phone, when wide, scroll in that one direction only (wide_types_phone). */
export const ONE_WAY_TYPES: readonly DiagramType[] = ['tree', 'flow', 'timeline'];

/**
 * Whether a drawing of `type`, `width` wide at natural size, scrolls one way only in a card `room` wide (§15,
 * wide_types_phone). That is on a phone, for a tree, a flow or a timeline wider than its card. It is fitted to its
 * height and scrolled across (zoom.ts, `Zoom`'s `across`), rather than shrunk to the card's width until it cannot be
 * read.
 */
export function scrollsOneWay(type: DiagramType, phone: boolean, width: number, room: number): boolean {
  return phone && ONE_WAY_TYPES.includes(type) && width > room;
}
