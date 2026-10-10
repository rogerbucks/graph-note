// Drawing a graph (spec §3): laid out by the Graphviz engine in each direction the style lists, the better fit chosen and
// themed, as graph_svg.render does; and what tapping a box shows. The engine is Graphviz compiled to WebAssembly, bundled,
// so drawing needs no network on any device (spec §1).
import { instance } from '@viz-js/viz';
import type { GraphDrawing, NoteReading, Problem } from './note-reading.ts';
import { drawingSource, layoutSource, STYLE } from './layout.ts';
import type { LayoutSource } from './layout.ts';
import { themed, sizeOf, choose } from './theme.ts';

/** Graphviz: layout source in, SVG text out. Throws when it cannot lay the source out. */
export interface Engine {
  version: string;
  render(source: string): string;
}

/** Starts the bundled Graphviz engine. */
export async function loadEngine(): Promise<Engine> {
  const viz = await instance();
  return { version: viz.graphvizVersion, render: (source) => viz.renderString(source, { format: 'svg' }) };
}

/** A drawing ready to show: themed SVG text, the direction chosen, and its natural size in CSS pixels. */
export interface Drawn {
  svg: string;
  rankdir: string;
  width: number;
  height: number;
}

/** One direction to lay a drawing out in: the source handed to Graphviz, and the kinds and readings to theme it by. */
export interface Direction {
  rankdir: string;
  dot: string;
  src: LayoutSource;
}

/** What Graphviz is handed for a drawing: one source for each direction the style lists, in the style's order. */
export function directions(drawing: GraphDrawing): Direction[] {
  return STYLE.directions.map((rankdir) => ({
    rankdir,
    dot: drawingSource(drawing, rankdir as 'LR' | 'TB'),
    src: layoutSource(drawing, rankdir as 'LR' | 'TB'),
  }));
}

/** The drawing, from the SVG Graphviz drew for each direction (in the same order): the better fit, themed. */
export function chosen(laidOut: Direction[], svgs: string[]): Drawn {
  const laid = laidOut.map(({ rankdir, src }, i) => {
    const svg = svgs[i] ?? '';
    return { rankdir, ...sizeOf(svg), svg, src };
  });
  const best = choose(laid);
  return {
    svg: themed(best.svg, best.src.kinds, best.src.readings),
    rankdir: best.rankdir,
    width: best.width,
    height: best.height,
  };
}

/**
 * Lays a graph out in each direction the style lists and themes the one that fits the note best. Graphviz numbers the
 * boxes node1, node2… and the links edge1, edge2… in the drawing's order, so each can be found again by its place.
 * The layout worker (layout-worker.ts) draws through the same two steps, so a drawing is the same wherever it is laid out.
 */
export function draw(drawing: GraphDrawing, engine: Engine): Drawn {
  const laid = directions(drawing);
  return chosen(
    laid,
    laid.map((d) => engine.render(d.dot)),
  );
}

/** One link in or out of a box, as its details list it. */
export interface LinkDetail {
  reading: string;
  key: string;
  text: string;
}

/** What tapping a box shows: its text, its kind, its links in and out with the thing at the other end, and its problems. */
export interface Details {
  key: string;
  text: string;
  kind: string;
  out: LinkDetail[];
  in: LinkDetail[];
  problems: Problem[];
  /** For a thing written without a name and drawn under the one suggested (spec §4): the warning, whose fix writes it. */
  suggested?: Problem;
}

const names = (line: string, key: string) =>
  new RegExp(`(^|[^A-Za-z0-9_])${key.replace(/[^A-Za-z0-9_]/g, '\\$&')}([^A-Za-z0-9_]|$)`).test(
    line.replace(/\/\/.*$/, ''),
  );

/** What tapping a box shows: its text, kind, links in and out, and any problem on it; null if it is not drawn. */
export function details(reading: NoteReading, graph: string, key: string): Details | null {
  const d = reading.graphs.get(graph),
    box = d?.boxes.find((b) => b.key === key);
  if (!d || !box) return null;
  const textOf = (k: string) => d.boxes.find((b) => b.key === k)?.text ?? k;
  // a thing drawn under a suggested name is not written by it: its warning is found by the name it suggests
  const suggested = box.suggested
    ? reading.problems.find((p) => p.graph === graph && p.suggested === key && p.block === box.suggested?.block)
    : undefined;
  return {
    key,
    text: box.text,
    kind: box.kind,
    out: d.links.filter((l) => l.from === key).map((l) => ({ reading: l.reading, key: l.to, text: textOf(l.to) })),
    in: d.links.filter((l) => l.to === key).map((l) => ({ reading: l.reading, key: l.from, text: textOf(l.from) })),
    problems: reading.problems.filter(
      (p) =>
        p === suggested || (p.graph === graph && names(reading.texts[p.block]?.split('\n')[p.line - 1] ?? '', key)),
    ),
    ...(suggested ? { suggested } : {}),
  };
}

/** What tapping a link shows: its type and reading, the things at either end, its properties, and its problems. */
export interface LinkDetails {
  index: number;
  type: string;
  reading: string;
  from: { key: string; text: string };
  to: { key: string; text: string };
  /** Each property as [name, value in words], by name. */
  properties: [string, string][];
  problems: Problem[];
}

const said = (v: unknown): string => (v && typeof v === 'object' && 's' in v ? String(v.s) : String(v));

/** The details of the drawing's `index`-th link (in the order written), or null when there is none. */
export function linkDetails(reading: NoteReading, graph: string, index: number): LinkDetails | null {
  const d = reading.graphs.get(graph),
    l = d?.links[index],
    g = reading.world[graph];
  if (!d || !l || !g) return null;
  const drawn = new Set(d.boxes.map((b) => b.key)),
    textOf = (k: string) => d.boxes.find((b) => b.key === k)?.text ?? k;
  const props = g.edges.filter(([s, , t]) => drawn.has(s) && drawn.has(t))[index]?.[3] ?? {};
  return {
    index,
    type: l.type,
    reading: l.reading,
    from: { key: l.from, text: textOf(l.from) },
    to: { key: l.to, text: textOf(l.to) },
    properties: Object.entries(props)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, said(v)]),
    problems: reading.problems.filter((p) => {
      const line = reading.texts[p.block]?.split('\n')[p.line - 1] ?? '';
      return p.graph === graph && names(line, l.from) && names(line, l.to) && names(line, l.type);
    }),
  };
}
