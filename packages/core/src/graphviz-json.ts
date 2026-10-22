// Graphviz's layout, as its JSON gives it (editor spec §43, plugin_interface). It holds the steps Graphviz draws. It
// also holds the style token each stand-in colour stands for. graphviz-marks.ts reads a layout as marks with these, and graphviz-svg.ts
// writes the colours back from the tokens.
import type { MarkPoint } from './plugin-diagrams.ts';

/** One drawing step of Graphviz's JSON: a shape, a line, text, or a change of font, colour or line style. */
export interface GraphvizOp {
  op: string;
  points?: [number, number][];
  rect?: [number, number, number, number];
  pt?: [number, number];
  text?: string;
  align?: string;
  width?: number;
  size?: number;
  face?: string;
  color?: string;
  style?: string;
}

/** A node, a cluster or another subgraph, as Graphviz's JSON gives it. */
export interface GraphvizObject {
  name: string;
  id?: string;
  class?: string;
  /** For a subgraph, the places of the subgraphs in it. */
  subgraphs?: number[];
  pos?: string;
  width?: string;
  height?: string;
  shape?: string;
  style?: string;
  bb?: string;
  _draw_?: GraphvizOp[];
  _ldraw_?: GraphvizOp[];
}

/** A link, as Graphviz's JSON gives it: the objects it joins by place, and how it is drawn. */
export interface GraphvizEdge {
  tail: number;
  head: number;
  /** The order Graphviz writes it in: each thing's links out, thing by thing. */
  _gvid?: number;
  id?: string;
  class?: string;
  style?: string;
  _draw_?: GraphvizOp[];
  _hdraw_?: GraphvizOp[];
  _tdraw_?: GraphvizOp[];
  _ldraw_?: GraphvizOp[];
}

/** A whole layout, as Graphviz gives it with the `json` format. */
export interface GraphvizLayout {
  bb: string;
  name?: string;
  bgcolor?: string;
  directed?: boolean;
  pad?: string;
  _subgraph_cnt?: number;
  _draw_?: GraphvizOp[];
  _ldraw_?: GraphvizOp[];
  objects?: GraphvizObject[];
  edges?: GraphvizEdge[];
}

/** The layout's stand-in colours, by the token each stands for. A kind's and a reading's are worked out. */
export const COLOUR_TOKENS: Record<string, string> = {
  '#0000fd': 'text',
  '#0000fe': 'text.muted',
  '#0000fc': 'link',
  '#0005fe': 'picture',
  '#000000': 'line',
  '#ffffff': 'background',
};

/** The style token a stand-in colour stands for: a kind's (`kind.2`), a reading's (`reading.0`), or a fixed one. */
export function colourToken(colour: string | undefined): string {
  const c = (colour ?? '').toLowerCase();
  if (!c || c === 'transparent' || c === 'none' || /^#[0-9a-f]{6}00$/.test(c)) return 'none';
  const fixed = COLOUR_TOKENS[c];
  if (fixed) return fixed;
  const m = /^#000([1-4])([0-9a-f]{2})$/.exec(c);
  if (!m) return 'line';
  const i = parseInt(m[2] ?? '0', 16);
  return m[1] === '1' || m[1] === '2' ? `kind.${i}` : m[1] === '3' ? `reading.${i}` : `reading.${i}.label`;
}

/** The colour a fill implies for its line: a kind's own line, none for the background and pictures, else the same. */
export function impliedLine(fill: string): string {
  if (fill.startsWith('kind.')) return fill;
  return fill === 'background' || fill === 'picture' ? 'none' : fill;
}

/**
 * A shape's style token. A filled shape's is its fill's token; then `.line.` and its line's, when that is not the one
 * its fill implies. An outline's is its line's token and `.outline`. A dashed one ends `.dashed`.
 */
export function shapeStyle(fill: string | undefined, pen: string | undefined, dashed: boolean): string {
  const line = colourToken(pen);
  const ways = dashed ? '.dashed' : '';
  if (fill === undefined) return `${line}.outline${ways}`;
  const f = colourToken(fill);
  return `${f}${impliedLine(f) === line ? '' : `.line.${line}`}${ways}`;
}

/** Whether a colour is one the layout's stand-ins, black, white or none: one a style token gives back exactly. */
export const known = (colour: string | undefined) =>
  /^#(000[0-4][0-9a-f]{2}|0005fe|ffffff|[0-9a-f]{6}00)$/i.test(colour ?? '') || colour === 'transparent';

/** Where an arrowhead's tip is, its angle and its size, from the shape Graphviz draws for it; or null for none. */
export function arrowhead(
  ops: readonly GraphvizOp[] | undefined,
  at: (x: number, y: number) => MarkPoint,
  near: MarkPoint | undefined,
): { x: number; y: number; angle: number; size: number } | null {
  const shape = ops?.find((d) => (d.op === 'P' || d.op === 'p') && d.points && d.points.length >= 3);
  if (!shape?.points || !near) return null;
  const corners = shape.points.map(([x, y]) => at(x, y));
  const far = (p: MarkPoint) => Math.hypot(p[0] - near[0], p[1] - near[1]);
  const tip = corners.reduce((a, b) => (far(b) > far(a) ? b : a));
  const base = corners.filter((p) => p !== tip);
  const mid: MarkPoint = [
    base.reduce((s, p) => s + p[0], 0) / base.length,
    base.reduce((s, p) => s + p[1], 0) / base.length,
  ];
  const angle = (Math.atan2(tip[1] - mid[1], tip[0] - mid[0]) * 180) / Math.PI;
  const size = Math.max(Math.hypot(tip[0] - mid[0], tip[1] - mid[1]), 1);
  return { x: tip[0], y: tip[1], angle: Math.round(angle * 100) / 100, size };
}
