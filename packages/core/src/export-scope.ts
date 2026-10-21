// What an export holds (editor spec §16, export_two_scopes, view_export_stays_view, empty_export): the whole diagram,
// or a view. A view's export holds only the things in the view and the links between them, so nothing outside it can be
// read from the image. With the faded context asked for, it holds the whole graph and says what is outside the view,
// for the image to fade. A graph or view with nothing in it is `empty`, with the reason, and is never drawn as a blank.
import type { Estimate } from './estimates.ts';
import type { GraphDrawing, NoteReading } from './note-reading.ts';
import { evaluate } from './view-evaluate.ts';
import type { ViewSpec } from './view-profile.ts';
import { sourceReadingOf } from './views.ts';
import { word } from './words.ts';

/** What is asked to be exported: a graph, whole, or one of its views, with or without the faded context. */
export interface ExportRequest {
  graph: string;
  /** A view of the graph by its name and what it asks; without one, the whole diagram is exported. */
  view?: { name: string; spec: ViewSpec };
  /** For a view: also draw what is outside it, faded. It means nothing for the whole diagram. */
  context?: boolean;
}

/** What an export holds, ready to be drawn. */
export interface ExportScope {
  kind: 'diagram' | 'view';
  graph: string;
  /** The view's name, for a view. */
  view?: string;
  /** The view in plain language, for a view. */
  reading?: string;
  /** Whether the faded context is drawn: only ever for a view. */
  context: boolean;
  /** What is laid out: the whole graph, or the view's things and the links between them. */
  drawing: GraphDrawing;
  /**
   * What the image fades: the things outside the view by key, and the links outside it by edge number. The count takes
   * the drawing's links in order, then its estimated links to a near-miss name. Empty unless the context is drawn.
   */
  faded: { things: string[]; links: number[] };
  /**
   * For a view drawn without its context: each link it holds, by its number among the whole drawing's links. So the
   * data export finds the link as written (export-data.ts). Unset when the drawing holds every link of the graph.
   */
  linksAt?: number[];
  /** Set when there is nothing to export: `why` then says so and what to change. */
  empty: boolean;
  why?: string;
}

const noDrawing = (graph: string): GraphDrawing => ({ graph, boxes: [], links: [], estimates: [] });

/** The estimates that are still true of the links kept: a guessed type at its new place, a guessed name with both ends kept. */
function keptEstimates(estimates: Estimate[], things: ReadonlySet<string>, placed: ReadonlyMap<number, number>) {
  return estimates.flatMap((e): Estimate[] => {
    if (e.kind === 'name') return things.has(e.from) && things.has(e.to) ? [e] : [];
    const at = e.index === undefined ? undefined : placed.get(e.index);
    return at === undefined ? [] : [{ ...e, index: at }];
  });
}

/**
 * What an export of `request` holds, from the note as read. A view is put to the graph as `evaluate` puts it, so the
 * image shows what the view shows. The links of a view keep their order in the graph. A guess (an estimated link)
 * inside the view stays a guess, so it is never drawn as a fact.
 */
export function exportScope(reading: NoteReading, request: ExportRequest): ExportScope {
  const { graph, view } = request;
  const base = reading.graphs.get(graph);
  const empty = (why: string): ExportScope => ({
    kind: view ? 'view' : 'diagram',
    graph,
    ...(view ? { view: view.name } : {}),
    context: false,
    drawing: noDrawing(graph),
    faded: { things: [], links: [] },
    empty: true,
    why,
  });
  if (!view) {
    if (!base || !base.boxes.length) return empty(word('export.scope.graph-empty', { graph }));
    return { kind: 'diagram', graph, context: false, drawing: base, faded: { things: [], links: [] }, empty: false };
  }
  const result = evaluate(view.spec, reading, graph);
  // why there is nothing is said to the person, in their language. The view's reading below goes into the export's bytes
  if (result.empty || !base)
    return empty(
      result.why
        ? word('export.scope.view-empty', { view: view.name, why: result.why })
        : word('export.scope.view-empty-plain', { view: view.name }),
    );
  const things = new Set(result.things),
    links = new Set(result.links),
    text = new Map(base.boxes.map((b) => [b.key, b.text]));
  const said = sourceReadingOf(view.spec, (id) => text.get(id) ?? id);
  const scope = { kind: 'view' as const, graph, view: view.name, reading: said, empty: false };
  if (request.context) {
    const guessed = base.estimates.filter((e) => e.kind === 'name');
    return {
      ...scope,
      context: true,
      drawing: base,
      faded: {
        things: base.boxes.map((b) => b.key).filter((k) => !things.has(k)),
        links: [
          ...base.links.flatMap((_, i) => (links.has(i) ? [] : [i])),
          ...guessed.flatMap((e, k) => (things.has(e.from) && things.has(e.to) ? [] : [base.links.length + k])),
        ],
      },
    };
  }
  const kept = base.links.flatMap((_, i) => (links.has(i) ? [i] : []));
  const placed = new Map(kept.map((old, now) => [old, now]));
  // each link kept says which written link it is (`edge`), as a view's drawing does. So what is drawn with it, its
  // properties shown inline, is its own, never the link's now at its place
  const g = reading.world[graph],
    drawnKeys = new Set(base.boxes.map((b) => b.key));
  const written = g?.edges.flatMap((e, at) => (drawnKeys.has(e[0]) && drawnKeys.has(e[2]) ? [at] : [])) ?? [];
  return {
    ...scope,
    context: false,
    drawing: {
      ...base,
      boxes: base.boxes.filter((b) => things.has(b.key)),
      links: kept.flatMap((i) => {
        const l = base.links[i],
          edge = l?.edge ?? written[i];
        return l ? [edge === undefined ? l : { ...l, edge }] : [];
      }),
      estimates: keptEstimates(base.estimates, things, placed),
    },
    faded: { things: [], links: [] },
    linksAt: kept,
  };
}
