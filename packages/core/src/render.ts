// Drawing a graph (spec §3): laid out by the Graphviz engine in each direction the style lists, the better fit chosen and
// themed, as graph_svg.render does; and what tapping a box shows. The engine is Graphviz compiled to WebAssembly, bundled,
// so drawing needs no network on any device (spec §1).
import { instance } from '@viz-js/viz';
import type { GraphDrawing, NoteReading, Problem } from './drawing.ts';
import { layoutSource, STYLE } from './layout.ts';
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

/**
 * Lays a graph out in each direction the style lists and themes the one that fits the note best. Graphviz numbers the
 * boxes node1, node2… and the links edge1, edge2… in the drawing's order, so each can be found again by its place.
 */
export function draw(drawing: GraphDrawing, engine: Engine): Drawn {
  const laid = STYLE.directions.map((rankdir) => {
    const src = layoutSource(drawing, rankdir as 'LR' | 'TB'), svg = engine.render(src.source);
    return { rankdir, ...sizeOf(svg), svg, src };
  });
  const best = choose(laid);
  return { svg: themed(best.svg, best.src.kinds, best.src.readings), rankdir: best.rankdir, width: best.width, height: best.height };
}

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
}

const names = (line: string, key: string) => new RegExp(`(^|[^A-Za-z0-9_])${key.replace(/[^A-Za-z0-9_]/g, '\\$&')}([^A-Za-z0-9_]|$)`).test(line.replace(/\/\/.*$/, ''));

export function details(reading: NoteReading, graph: string, key: string): Details | null {
  const d = reading.graphs.get(graph), box = d?.boxes.find((b) => b.key === key);
  if (!d || !box) return null;
  const textOf = (k: string) => d.boxes.find((b) => b.key === k)?.text ?? k;
  return {
    key, text: box.text, kind: box.kind,
    out: d.links.filter((l) => l.from === key).map((l) => ({ reading: l.reading, key: l.to, text: textOf(l.to) })),
    in: d.links.filter((l) => l.to === key).map((l) => ({ reading: l.reading, key: l.from, text: textOf(l.from) })),
    problems: reading.problems.filter((p) => p.graph === graph && names(reading.texts[p.block]?.split('\n')[p.line - 1] ?? '', key)),
  };
}
