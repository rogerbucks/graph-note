// Diagram types (editor spec §15). This works out:
// - which of the seven types fit a graph, and why each that does not fit does not (type_only_when_fits, tree_fits,
//   timeline_fits);
// - a timeline's order and what it shows (timeline_order, timeline_show);
// - the type that fits best, suggested and never drawn unless chosen (suggest_type);
// - the type the style graph chooses, drawn only while the data fits it. Else the graph is drawn as a network, and the
//   nearest type that fits is offered (type_stops_fitting);
// - the plan Graphviz lays each type out by (graph-layout.js, `typedSource`).
// A table is drawn by the host, from types-table.ts. Host-free. The Python library judges and plans the same way
// (`graphspec/style/diagram_types.py`). It is held to this byte for byte (type_both_renderers).
import type { Graph } from '@thoughtknot/graph-spec';
import type { DiagramPlan, GraphDrawing } from './note-reading.ts';
import { DIAGRAM_TYPES, pluginTypeOf } from './style-graph.ts';
import type { Diagram, DiagramType, StyleGraph } from './style-graph.ts';
import { TIMELINE_ORDERS, TIMELINE_SHOWS, timelinePlan, timelineShown } from './timeline.ts';
import type { TimelineChoice, TimelineOrder, TimelineShow } from './timeline.ts';
import { centreOf, loopIn, shapeOf } from './types-shape.ts';
import type { GraphShape } from './types-shape.ts';
import { formatList } from './locale-formats.ts';
import { word } from './words.ts';

export { DIAGRAM_TYPES, TIMELINE_ORDERS, TIMELINE_SHOWS, pluginTypeOf, shapeOf };
export type { DiagramType, GraphShape, TimelineChoice, TimelineOrder, TimelineShow };

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
  /** When the type chosen is a plug-in's that nothing here draws: its name, its plug-in, and why it is a network. */
  plugin?: { type: string; plugin: string; why: string };
}

/**
 * More things than this are too many to read in one drawing (§15, large_way_in). It was 50, far too low (Roger, 22 Oct
 * 2026). A graph of up to 2,000 is drawn (layout-limits.ts), and past 1,000 the table and a view are offered beside it.
 */
export const LARGE_GRAPH = 1000;

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

/** Words joined as a sentence lists them, in the reader's language: "a, b and c". */
const andList = (xs: readonly string[]): string => formatList([...xs]);

/** Two names in the order a sort by name puts them, as JavaScript compares them (UTF-16 code units). */
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Why the links of `type` make no tree — a thing with a second parent, or a loop — or null when they make one. A parent
 * linked to a thing twice by the type is one parent.
 */
function treeAlong(shape: GraphShape, type: string, text: (k: string) => string): string | null {
  const links = shape.links.filter((l) => l.type === type);
  if (!links.length) return word('diagram.tree.no-link', { type });
  const parents = new Map<string, Set<string>>();
  for (const l of links) parents.set(l.to, (parents.get(l.to) ?? new Set()).add(l.from));
  for (const t of shape.things) {
    const ps = [...(parents.get(t.key) ?? [])];
    if (ps.length > 1)
      return ps.length === 2
        ? word('diagram.tree.two-parents', { thing: t.text, parents: andList(ps.map(text)) })
        : word('diagram.tree.parents', { thing: t.text, number: String(ps.length), parents: andList(ps.map(text)) });
  }
  const loop = loopIn(
    shape.things.map((t) => t.key),
    links,
  );
  return loop ? word('diagram.tree.loops', { loop: loop.map(text).join(' → ') }) : null;
}

const no = (type: DiagramType, why: string): TypeFit => ({ type, fits: false, why });
const yes = (type: DiagramType): TypeFit => ({ type, fits: true });

/** Whether a timeline fits (timeline_fits): it does while it has a thing to show. */
function timelineFit(shape: GraphShape, choice: TimelineChoice): TypeFit {
  if (timelineShown(shape, choice.show).length) return yes('timeline');
  return no('timeline', word(choice.show === 'dated' ? 'diagram.timeline.none-dated' : 'diagram.timeline.all-dated'));
}

/**
 * Whether a tree fits. It is judged along `relationship`, or, none chosen, along the type with the most links that
 * makes one. Of two with as many, the first by name wins, so the choice never hangs on the order written.
 */
function treeFit(shape: GraphShape, relationship: string | undefined, text: (k: string) => string): TypeFit {
  if (!shape.links.length) return no('tree', word('diagram.tree.no-links'));
  if (relationship !== undefined) {
    const why = treeAlong(shape, relationship, text);
    return why ? no('tree', word('diagram.tree.along', { relationship, why })) : { ...yes('tree'), relationship };
  }
  const count = (t: string) => shape.links.filter((l) => l.type === t).length;
  const types = [...new Set(shape.links.map((l) => l.type))].sort((a, b) => count(b) - count(a) || byName(a, b));
  const best = types.find((t) => treeAlong(shape, t, text) === null);
  if (best !== undefined) return { ...yes('tree'), relationship: best };
  const most = types[0] as string;
  return no('tree', word('diagram.tree.none', { relationship: most, why: treeAlong(shape, most, text) ?? '' }));
}

/**
 * Whether a radial drawing fits. It needs three things or more, every one joined to the centre, whichever way its links
 * run. No group may be written, as Graphviz's radial layout cannot draw a group's box.
 */
function radialFit(shape: GraphShape, text: (k: string) => string): TypeFit {
  if (shape.things.length < 3) return no('radial', word('diagram.radial.three'));
  const group = shape.groups?.[0];
  if (group) return no('radial', word('diagram.radial.group', { group: group[0] }));
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
  return lone ? no('radial', word('diagram.radial.joined', { centre: text(centre), thing: lone.text })) : yes('radial');
}

/** Whether lanes fit: every thing of one kind, every group's things of one kind, so it sits in one lane, and two kinds. */
function lanesFit(shape: GraphShape): TypeFit {
  for (const t of shape.things) {
    if (!t.kinds.length) return no('lanes', word('diagram.lanes.no-kind', { thing: t.text }));
    if (t.kinds.length > 1) {
      const values = { thing: t.text, number: String(t.kinds.length), kinds: andList(t.kinds) };
      return no('lanes', word(t.kinds.length === 2 ? 'diagram.lanes.two-kinds' : 'diagram.lanes.kinds', values));
    }
  }
  const kindOf = new Map(shape.things.map((t) => [t.key, t.kinds[0]]));
  for (const [label, keys] of shape.groups ?? [])
    if (new Set(keys.map((k) => kindOf.get(k))).size > 1)
      return no('lanes', word('diagram.lanes.group', { group: label }));
  return new Set(shape.things.map((t) => t.kinds[0])).size < 2 ? no('lanes', word('diagram.lanes.two')) : yes('lanes');
}

/**
 * Whether each type fits the shape (§15, type_only_when_fits), in the order of `DIAGRAM_TYPES`, each that does not with
 * why. A tree is judged along `relationship` when one is chosen (tree_fits). A timeline fits while it has a thing to
 * show, as `timeline` chooses (timeline_fits). A network fits every graph, and with nothing to draw only a network is
 * offered.
 */
export function typeFits(shape: GraphShape, relationship?: string, timeline: TimelineChoice = {}): TypeFit[] {
  if (!shape.things.length)
    return DIAGRAM_TYPES.map((t) => (t === 'network' ? yes(t) : no(t, word('diagram.nothing'))));
  const texts = new Map(shape.things.map((t) => [t.key, t.text]));
  const text = (k: string) => texts.get(k) ?? k;
  const loop = loopIn(
    shape.things.map((t) => t.key),
    shape.links,
  );
  return [
    yes('network'),
    treeFit(shape, relationship, text),
    !shape.links.length
      ? no('flow', word('diagram.flow.no-links'))
      : loop
        ? no('flow', word('diagram.flow.loops', { loop: loop.map(text).join(' → ') }))
        : yes('flow'),
    radialFit(shape, text),
    lanesFit(shape),
    timelineFit(shape, timeline),
    yes('table'),
  ];
}

/**
 * The type that best fits (§15, suggest_type), and why. The table comes first for a graph too large for one drawing
 * (large_way_in). Then a timeline when every thing carries a date, and a tree whose relationship reaches every thing.
 * Then a radial drawing of four things or more all linked to its centre, then lanes, a flow, and else a network. Only
 * suggested: nothing is drawn as it until it is chosen.
 */
export function suggestType(fits: readonly TypeFit[], shape: GraphShape): Suggestion {
  const fit = (t: DiagramType) => fits.find((f) => f.type === t && f.fits);
  const n = shape.things.length;
  if (n > LARGE_GRAPH && fit('table')) return { type: 'table', because: word('diagram.because.table', { count: n }) };
  if (fit('timeline') && shape.things.every((t) => t.date !== undefined))
    return { type: 'timeline', because: word('diagram.because.timeline') };
  const along = fit('tree')?.relationship;
  const touched = (type: string) => new Set(shape.links.filter((l) => l.type === type).flatMap((l) => [l.from, l.to]));
  if (along !== undefined && shape.things.every((t) => touched(along).has(t.key)))
    return { type: 'tree', because: word('diagram.because.tree', { relationship: along }) };
  const centre = centreOf(shape);
  const spokes = new Set(shape.links.flatMap((l) => (l.from === centre ? [l.to] : l.to === centre ? [l.from] : [])));
  if (fit('radial') && n >= 4 && shape.things.every((t) => t.key === centre || spokes.has(t.key)))
    return {
      type: 'radial',
      because: word('diagram.because.radial', { centre: shape.things.find((t) => t.key === centre)?.text ?? centre }),
    };
  if (fit('lanes'))
    return {
      type: 'lanes',
      because: word('diagram.because.lanes', { count: new Set(shape.things.map((t) => t.kinds[0])).size }),
    };
  if (fit('flow')) return { type: 'flow', because: word('diagram.because.flow') };
  return { type: 'network', because: word('diagram.because.network') };
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
function planOf(fit: TypeFit, shape: GraphShape, timeline: TimelineChoice): DiagramPlan | undefined {
  if (fit.type === 'tree')
    return { type: 'tree', tree: shape.links.flatMap((l, i) => (l.type === fit.relationship ? [i] : [])) };
  if (fit.type === 'flow') return { type: 'flow' };
  if (fit.type === 'radial') return { type: 'radial', centre: centreOf(shape) };
  if (fit.type === 'lanes') {
    const lanes = new Map<string, string[]>();
    for (const t of shape.things) lanes.set(t.kinds[0] as string, [...(lanes.get(t.kinds[0] as string) ?? []), t.key]);
    // each group is drawn inside its lane (graph-layout.js, typedSource), never as a box of its own
    return { type: 'lanes', lanes: [...lanes], ...(shape.groups ? { groups: shape.groups } : {}) };
  }
  if (fit.type === 'timeline') return timelinePlan(shape, timeline);
  return undefined;
}

/** What of a style graph the diagram types read: the types chosen, and the nudges, whose groups some types cannot draw. */
export type TypeStyle = Pick<StyleGraph, 'diagrams'> & Partial<Pick<StyleGraph, 'nudges'>>;

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
 * shape. It gives whether each type fits and why not (type_only_when_fits), and the suggestion (suggest_type). It gives
 * the type drawn, with why and the nearest that fits when the chosen one has stopped fitting (type_stops_fitting).
 */
export function diagramOffer(
  drawing: Pick<GraphDrawing, 'boxes' | 'links' | 'estimates'>,
  style: TypeStyle,
  g?: Graph,
  view?: string,
): DiagramOffer {
  const shape = shapeOf(drawing, g, style.nudges),
    chosen = chosenDiagram(style, view);
  return {
    fits: typeFits(shape, chosen?.relationship, chosen),
    suggested: suggestType(typeFits(shape), shape),
    choice: diagramFor(drawing, style, g, view),
  };
}

/**
 * The type `drawing` is drawn as in `view` (none: the whole graph), judged on what the drawing holds (§15). It is the
 * type its style graph chooses, while the data fits it. When it does not, it is a network, never the graph drawn
 * wrongly. Then it comes with why and the nearest type that fits, for the host to say and offer (type_stops_fitting).
 * With none chosen, a network. A suggestion is never drawn unless chosen (suggest_type).
 */
export function diagramFor(
  drawing: Pick<GraphDrawing, 'boxes' | 'links' | 'estimates'>,
  style: TypeStyle,
  g?: Graph,
  view?: string,
): DiagramChoice {
  const d = chosenDiagram(style, view);
  if (!d) return { drawn: 'network' };
  const own = d.plugin === undefined ? null : pluginTypeOf(d.plugin);
  if (d.plugin !== undefined && own) {
    const why = word('diagram.plugin-missing', { type: d.plugin, plugin: own.plugin });
    return { drawn: 'network', plugin: { type: d.plugin, plugin: own.plugin, why } };
  }
  const shape = shapeOf(drawing, g, style.nudges),
    fits = typeFits(shape, d.relationship, d),
    fit = fits.find((f) => f.type === d.type) as TypeFit;
  if (!fit.fits)
    return {
      chosen: d.type,
      drawn: 'network',
      stopped: { type: d.type, why: fit.why ?? '', nearest: nearestType(d.type, fits) },
    };
  const plan = planOf(fit, shape, d);
  return { chosen: d.type, drawn: d.type, ...(plan ? { plan } : {}) };
}
