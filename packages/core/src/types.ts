// Diagram types (editor spec §15): which of the seven types fit a graph, and why each that does not fit does not
// (type_only_when_fits, tree_fits, timeline_fits); the type that fits best, suggested and never drawn unless chosen
// (suggest_type); the type the style graph chooses, drawn only while the data fits it — else the graph is drawn as a
// network, and the nearest type that fits is offered (type_stops_fitting); and the plan Graphviz lays each type out by
// (graph-layout.js, `typedSource`). A table is drawn by the host, from types-table.ts. Host-free. The Python library
// judges and plans the same way (`graphspec/style/diagram_types.py`), held to this byte for byte (type_both_renderers).
import type { Graph } from '@graph-note/graph-spec';
import { linkTypes } from './arrows.ts';
import { valueText } from './inline-properties.ts';
import type { DiagramPlan, GraphDrawing } from './note-reading.ts';
import { DIAGRAM_TYPES } from './style-graph.ts';
import type { Diagram, DiagramType, StyleGraph } from './style-graph.ts';

export { DIAGRAM_TYPES };
export type { DiagramType };

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

/** What a type is judged on: the things drawn and their written links, in the order drawn. */
export interface GraphShape {
  things: ShapeThing[];
  links: ShapeLink[];
}

/** Whether a type fits, and, when it does not, why, in words naming the things at fault. */
export interface TypeFit {
  type: DiagramType;
  fits: boolean;
  /** Why it does not fit; only when it does not. */
  why?: string;
  /** For a tree that fits: the relationship it follows. */
  relationship?: string;
}

/** The type suggested, and why, in words. */
export interface Suggestion {
  type: DiagramType;
  because: string;
}

/** The type a drawing is drawn as: the one chosen, when it fits; else a network, with why and the nearest that fits. */
export interface DiagramChoice {
  /** The type the style graph chooses here, if any. */
  chosen?: DiagramType;
  drawn: DiagramType;
  /** When the chosen type no longer fits: which, why, and the nearest type that fits, to offer. */
  stopped?: { type: DiagramType; why: string; nearest: DiagramType };
  /** How Graphviz lays the drawn type out; none for a network or a table. */
  plan?: DiagramPlan;
}

/** More things than this are too many to read in one drawing (§15, large_way_in). */
export const LARGE_GRAPH = 50;

const NOTHING = 'there is nothing here to draw';

/** The types tried, in order, when the chosen one stops fitting; the network fits always, so it is the last resort. */
const NEAREST: Record<DiagramType, DiagramType[]> = {
  network: [],
  tree: ['flow', 'radial'],
  flow: ['tree', 'lanes'],
  radial: ['tree', 'flow'],
  lanes: ['flow'],
  timeline: ['flow', 'table'],
  table: [],
};

/** Words joined as a sentence lists them: "a, b and c". */
const andList = (xs: readonly string[]): string =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
const counted = (n: number) => (n === 2 ? 'two' : String(n));

/** A date or an instant as the reader keeps it. */
const isDate = (v: unknown): boolean =>
  !!v && typeof v === 'object' && 'kind' in v && 's' in v && (v.kind === 'date' || v.kind === 'datetime');

/**
 * The shape of a drawing: its boxes, with their kinds and the first date each carries (from `g`, the graph as read), and
 * its written links, each by the type it is styled by (a guessed type's link by the type it is taken for).
 */
export function shapeOf(drawing: Pick<GraphDrawing, 'boxes' | 'links' | 'estimates'>, g?: Graph): GraphShape {
  const types = linkTypes(drawing);
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
  };
}

/** The first loop the links make, followed from each thing in turn: the things around it, back to where it starts. */
function loopIn(things: readonly string[], links: readonly ShapeLink[]): string[] | null {
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
function centreOf(shape: GraphShape): string {
  const degree = new Map<string, number>();
  for (const l of shape.links) for (const k of [l.from, l.to]) degree.set(k, (degree.get(k) ?? 0) + 1);
  let best = shape.things[0]?.key ?? '';
  for (const t of shape.things) if ((degree.get(t.key) ?? 0) > (degree.get(best) ?? 0)) best = t.key;
  return best;
}

/** Why the links of `type` make no tree — a thing with a second parent, or a loop — or null when they make one. */
function treeAlong(shape: GraphShape, type: string, text: (k: string) => string): string | null {
  const links = shape.links.filter((l) => l.type === type);
  if (!links.length) return `there is no ${type} link here`;
  const parents = new Map<string, string[]>();
  for (const l of links) parents.set(l.to, [...(parents.get(l.to) ?? []), l.from]);
  for (const t of shape.things) {
    const ps = parents.get(t.key) ?? [];
    if (ps.length > 1) return `${t.text} has ${counted(ps.length)} parents, ${andList(ps.map(text))}`;
  }
  const loop = loopIn(
    shape.things.map((t) => t.key),
    links,
  );
  return loop ? `it loops back: ${loop.map(text).join(' → ')}` : null;
}

const no = (type: DiagramType, why: string): TypeFit => ({ type, fits: false, why });
const yes = (type: DiagramType): TypeFit => ({ type, fits: true });

/** Whether a tree fits: along `relationship`, or, none chosen, along the type with the most links that makes one. */
function treeFit(shape: GraphShape, relationship: string | undefined, text: (k: string) => string): TypeFit {
  if (!shape.links.length) return no('tree', 'a tree needs links, and there are none');
  if (relationship !== undefined) {
    const why = treeAlong(shape, relationship, text);
    return why ? no('tree', `along ${relationship}, ${why}`) : { ...yes('tree'), relationship };
  }
  const count = (t: string) => shape.links.filter((l) => l.type === t).length;
  const types = [...new Set(shape.links.map((l) => l.type))].sort((a, b) => count(b) - count(a));
  const best = types.find((t) => treeAlong(shape, t, text) === null);
  if (best !== undefined) return { ...yes('tree'), relationship: best };
  const most = types[0] as string;
  return no('tree', `no relationship makes a tree: along ${most}, ${treeAlong(shape, most, text)}`);
}

/** Whether a radial drawing fits: three things or more, every one joined to the centre, whichever way its links run. */
function radialFit(shape: GraphShape, text: (k: string) => string): TypeFit {
  if (shape.things.length < 3) return no('radial', 'a radial drawing needs three things or more');
  const centre = centreOf(shape),
    near = new Map<string, string[]>();
  for (const l of shape.links) {
    near.set(l.from, [...(near.get(l.from) ?? []), l.to]);
    near.set(l.to, [...(near.get(l.to) ?? []), l.from]);
  }
  const reached = new Set([centre]),
    queue = [centre];
  for (let i = 0; i < queue.length; i++)
    for (const n of near.get(queue[i] as string) ?? [])
      if (!reached.has(n)) {
        reached.add(n);
        queue.push(n);
      }
  const lone = shape.things.find((t) => !reached.has(t.key));
  return lone
    ? no('radial', `a radial drawing needs every thing joined to the centre, ${text(centre)}, and ${lone.text} is not`)
    : yes('radial');
}

/** Whether lanes fit: every thing of one kind, and two kinds or more. */
function lanesFit(shape: GraphShape): TypeFit {
  for (const t of shape.things) {
    if (!t.kinds.length) return no('lanes', `${t.text} has no kind, so it has no lane`);
    if (t.kinds.length > 1)
      return no(
        'lanes',
        `${t.text} is of ${counted(t.kinds.length)} kinds, ${andList(t.kinds)}, so it cannot sit in one lane`,
      );
  }
  return new Set(shape.things.map((t) => t.kinds[0])).size < 2
    ? no('lanes', 'lanes need things of two kinds or more')
    : yes('lanes');
}

/**
 * Whether each type fits the shape (§15, type_only_when_fits), in the order of `DIAGRAM_TYPES`, each that does not with
 * why. A tree is judged along `relationship` when one is chosen (tree_fits); a timeline needs every thing to carry a date
 * (timeline_fits); a network fits every graph, and with nothing to draw only a network is offered.
 */
export function typeFits(shape: GraphShape, relationship?: string): TypeFit[] {
  if (!shape.things.length) return DIAGRAM_TYPES.map((t) => (t === 'network' ? yes(t) : no(t, NOTHING)));
  const texts = new Map(shape.things.map((t) => [t.key, t.text]));
  const text = (k: string) => texts.get(k) ?? k;
  const loop = loopIn(
    shape.things.map((t) => t.key),
    shape.links,
  );
  const undated = shape.things.find((t) => t.date === undefined);
  return [
    yes('network'),
    treeFit(shape, relationship, text),
    !shape.links.length
      ? no('flow', 'a flow needs links, and there are none')
      : loop
        ? no('flow', `a flow runs one way, and this loops back: ${loop.map(text).join(' → ')}`)
        : yes('flow'),
    radialFit(shape, text),
    lanesFit(shape),
    undated
      ? no('timeline', `a timeline needs every thing to carry a date, and ${undated.text} carries none`)
      : yes('timeline'),
    yes('table'),
  ];
}

/**
 * The type that best fits (§15, suggest_type), and why: the table first for a graph too large for one drawing
 * (large_way_in); then a timeline when every thing carries a date; a tree whose relationship reaches every thing; a
 * radial drawing of four things or more all linked to its centre; lanes; a flow; and else a network. Only suggested:
 * nothing is drawn as it until it is chosen.
 */
export function suggestType(fits: readonly TypeFit[], shape: GraphShape): Suggestion {
  const fit = (t: DiagramType) => fits.find((f) => f.type === t && f.fits);
  const n = shape.things.length;
  if (n > LARGE_GRAPH && fit('table'))
    return { type: 'table', because: `a graph of ${n} things reads best as a table first` };
  if (fit('timeline')) return { type: 'timeline', because: 'every thing carries a date' };
  const along = fit('tree')?.relationship;
  const touched = (type: string) => new Set(shape.links.filter((l) => l.type === type).flatMap((l) => [l.from, l.to]));
  if (along !== undefined && shape.things.every((t) => touched(along).has(t.key)))
    return { type: 'tree', because: `each thing has at most one parent along ${along}` };
  const centre = centreOf(shape);
  const spokes = new Set(shape.links.flatMap((l) => (l.from === centre ? [l.to] : l.to === centre ? [l.from] : [])));
  if (fit('radial') && n >= 4 && shape.things.every((t) => t.key === centre || spokes.has(t.key)))
    return {
      type: 'radial',
      because: `every thing links to ${shape.things.find((t) => t.key === centre)?.text ?? centre}`,
    };
  if (fit('lanes'))
    return { type: 'lanes', because: `its things are of ${new Set(shape.things.map((t) => t.kinds[0])).size} kinds` };
  if (fit('flow')) return { type: 'flow', because: 'the links run one way' };
  return { type: 'network', because: 'a network fits any graph' };
}

/** The type to offer when `type` stops fitting (type_stops_fitting): the first of its neighbours that fits, else a network. */
export function nearestType(type: DiagramType, fits: readonly Pick<TypeFit, 'type' | 'fits'>[]): DiagramType {
  return NEAREST[type].find((t) => fits.some((f) => f.type === t && f.fits)) ?? 'network';
}

/** The diagram type the style graph chooses in `view` (none: the whole graph): the view's own over the whole graph's. */
export function chosenDiagram(style: Pick<StyleGraph, 'diagrams'>, view?: string): Diagram | undefined {
  return (
    (view !== undefined ? style.diagrams.find((d) => d.view === view) : undefined) ??
    style.diagrams.find((d) => d.view === undefined)
  );
}

/** How Graphviz lays a fitting type out (graph-layout.js, `typedSource`); none for a network or a table. */
function planOf(fit: TypeFit, shape: GraphShape): DiagramPlan | undefined {
  if (fit.type === 'tree')
    return { type: 'tree', tree: shape.links.flatMap((l, i) => (l.type === fit.relationship ? [i] : [])) };
  if (fit.type === 'flow') return { type: 'flow' };
  if (fit.type === 'radial') return { type: 'radial', centre: centreOf(shape) };
  if (fit.type === 'lanes') {
    const lanes = new Map<string, string[]>();
    for (const t of shape.things) lanes.set(t.kinds[0] as string, [...(lanes.get(t.kinds[0] as string) ?? []), t.key]);
    return { type: 'lanes', lanes: [...lanes] };
  }
  if (fit.type === 'timeline') {
    const dates = [...new Set(shape.things.map((t) => t.date as string))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return { type: 'timeline', dates: dates.map((d) => shape.things.filter((t) => t.date === d).map((t) => t.key)) };
  }
  return undefined;
}

/** What a host offers of the diagram types for a drawing: each type and whether it fits, the suggestion, the type drawn. */
export interface DiagramOffer {
  /** Whether each type fits, and why not; a tree judged along the relationship chosen for it, if any. */
  fits: TypeFit[];
  /** The data's best fit, whatever is chosen. */
  suggested: Suggestion;
  choice: DiagramChoice;
}

/**
 * Everything a host offers of the diagram types for `drawing` in `view` (none: the whole graph), from one reading of its
 * shape: whether each type fits and why not (type_only_when_fits), the suggestion (suggest_type), and the type drawn,
 * with why and the nearest that fits when the chosen one has stopped fitting (type_stops_fitting).
 */
export function diagramOffer(
  drawing: Pick<GraphDrawing, 'boxes' | 'links' | 'estimates'>,
  style: Pick<StyleGraph, 'diagrams'>,
  g?: Graph,
  view?: string,
): DiagramOffer {
  const shape = shapeOf(drawing, g);
  return {
    fits: typeFits(shape, chosenDiagram(style, view)?.relationship),
    suggested: suggestType(typeFits(shape), shape),
    choice: diagramFor(drawing, style, g, view),
  };
}

/**
 * The type `drawing` is drawn as in `view` (none: the whole graph), judged on what the drawing holds (§15): the type its
 * style graph chooses, while the data fits it; when it does not, a network — never the graph drawn wrongly — with why and
 * the nearest type that fits, for the host to say and offer (type_stops_fitting). With none chosen, a network: a
 * suggestion is never drawn unless chosen (suggest_type).
 */
export function diagramFor(
  drawing: Pick<GraphDrawing, 'boxes' | 'links' | 'estimates'>,
  style: Pick<StyleGraph, 'diagrams'>,
  g?: Graph,
  view?: string,
): DiagramChoice {
  const d = chosenDiagram(style, view);
  if (!d) return { drawn: 'network' };
  const shape = shapeOf(drawing, g),
    fits = typeFits(shape, d.relationship),
    fit = fits.find((f) => f.type === d.type) as TypeFit;
  if (!fit.fits)
    return {
      chosen: d.type,
      drawn: 'network',
      stopped: { type: d.type, why: fit.why ?? '', nearest: nearestType(d.type, fits) },
    };
  const plan = planOf(fit, shape);
  return { chosen: d.type, drawn: d.type, ...(plan ? { plan } : {}) };
}
