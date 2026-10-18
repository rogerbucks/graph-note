// The shape a diagram type is judged on (editor spec §15): the things drawn, with their kinds and first dates, their
// written links, and the groups the style graph's nudges draw them in; and what types.ts reads from it — the first loop
// the links make, and the thing with the most links. Host-free. The Python library reads the same shape
// (`graphspec/style/diagram_types.py`, `shape_of`).
import type { Graph } from '@thoughtknot/graph-spec';
import { linkTypes } from './arrows.ts';
import { valueText } from './inline-properties.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { Nudge } from './style-graph.ts';

/** A thing as a type judges it: its key, its text, its kinds, and the first date it carries, said as inline. */
export interface ShapeThing {
  key: string;
  text: string;
  kinds: string[];
  date?: string;
}

/** A link as a type judges it: its two ends and the relationship type it is styled by. */
export interface ShapeLink {
  from: string;
  type: string;
  to: string;
}

/** What a type is judged on: the things drawn and their written links, in the order drawn, and the groups drawn. */
export interface GraphShape {
  things: ShapeThing[];
  links: ShapeLink[];
  /** Each group a nudge draws (§6), by its label, with its things drawn here, in the order first written. */
  groups?: [string, string[]][];
}

/** A date or an instant as the reader keeps it. */
const isDate = (v: unknown): boolean =>
  !!v && typeof v === 'object' && 'kind' in v && 's' in v && (v.kind === 'date' || v.kind === 'datetime');

/** The day of a date as the reader keeps it (an instant's in UTC): its first ten characters, YYYY-MM-DD. */
export const dayOf = (date: string): string => date.slice(0, 10);

/**
 * The shape of a drawing: its boxes, with their kinds and the first date each carries (from `g`, the graph as read), its
 * written links, each by the type it is styled by (a guessed type's link by the type it is taken for), and the groups its
 * `nudges` draw, of the things drawn, as the layout source draws them (style-source.ts, `nudgedSource`).
 */
export function shapeOf(
  drawing: Pick<GraphDrawing, 'boxes' | 'links' | 'estimates'>,
  g?: Graph,
  nudges: readonly Nudge[] = [],
): GraphShape {
  const types = linkTypes(drawing),
    drawn = new Set(drawing.boxes.map((b) => b.key)),
    groups = new Map<string, string[]>();
  for (const n of nudges)
    if (n.word === 'group' && n.group !== undefined && n.thing !== undefined && drawn.has(n.thing)) {
      const keys = groups.get(n.group) ?? [];
      if (!keys.includes(n.thing)) groups.set(n.group, [...keys, n.thing]);
    }
  return {
    things: drawing.boxes.map((b) => {
      const date = Object.values(g?.nodes.has(b.key) ? g.p(b.key) : {}).find(isDate);
      return {
        key: b.key,
        text: b.text,
        kinds: b.kind ? b.kind.split(' · ') : [],
        ...(date === undefined ? {} : { date: valueText(date) }),
      };
    }),
    links: drawing.links.map((l, i) => ({ from: l.from, type: types[i] ?? l.type, to: l.to })),
    ...(groups.size ? { groups: [...groups] } : {}),
  };
}

/** The first loop the links make, followed from each thing in turn: the things around it, back to where it starts. */
export function loopIn(things: readonly string[], links: readonly ShapeLink[]): string[] | null {
  const out = new Map<string, string[]>();
  for (const l of links) out.set(l.from, [...(out.get(l.from) ?? []), l.to]);
  const state = new Map<string, 'open' | 'done'>();
  for (const start of things) {
    if (state.has(start)) continue;
    const path = [start],
      next = [0];
    state.set(start, 'open');
    while (path.length) {
      const at = path.length - 1,
        k = path[at] as string,
        i = next[at] as number,
        ends = out.get(k) ?? [];
      if (i >= ends.length) {
        state.set(k, 'done');
        path.pop();
        next.pop();
        continue;
      }
      next[at] = i + 1;
      const n = ends[i] as string;
      if (state.get(n) === 'open') return [...path.slice(path.indexOf(n)), n];
      if (!state.has(n)) {
        state.set(n, 'open');
        path.push(n);
        next.push(0);
      }
    }
  }
  return null;
}

/** The thing with the most links, the first drawn when two have as many: a radial drawing's centre. */
export function centreOf(shape: GraphShape): string {
  const degree = new Map<string, number>();
  for (const l of shape.links) for (const k of [l.from, l.to]) degree.set(k, (degree.get(k) ?? 0) + 1);
  let best = shape.things[0]?.key ?? '';
  for (const t of shape.things) if ((degree.get(t.key) ?? 0) > (degree.get(best) ?? 0)) best = t.key;
  return best;
}
