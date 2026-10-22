// Graphviz's layout as drawing marks (editor spec §43, plugin_interface). The built-in diagram types are laid out by
// Graphviz. Read as JSON, its layout gives where each box, link, label and group goes. This turns it into marks
// (drawing-marks.ts). Then the core can draw a built-in type as it draws a plug-in's.
// - Graphviz counts points from the bottom, in points. Marks count from the top, in CSS pixels: 4/3 of a point.
// - Each id starts with what it marks, so no key can give another mark's id. A box is `t:` and the thing's key, a
//   group `g:` and its cluster's name. A link is `e:`, the keys it joins as JSON, and a count, so two links between the
//   same things keep their own ids. A label is `l:` and what it labels; its later lines `l1:`, `l2:` and on. An
//   arrowhead is `head:` or `tail:` and its link.
// - Nothing reads colour from the layout: how a mark looks is a style token, set by the theme.
import type { BoxShape, DrawMark } from './drawing-marks.ts';
import type { DiagramSpace, MarkPoint } from './plugin-diagrams.ts';

/** One drawing step of Graphviz's JSON: a shape, a line, text, or a change of font or colour. */
export interface GraphvizOp {
  op: string;
  points?: [number, number][];
  rect?: [number, number, number, number];
  pt?: [number, number];
  text?: string;
  align?: string;
  width?: number;
  size?: number;
}

/** A node or a cluster, as Graphviz's JSON gives it. */
export interface GraphvizObject {
  name: string;
  pos?: string;
  width?: string;
  height?: string;
  shape?: string;
  style?: string;
  bb?: string;
  _ldraw_?: GraphvizOp[];
}

/** A link, as Graphviz's JSON gives it: the objects it joins by place, and how it is drawn. */
export interface GraphvizEdge {
  tail: number;
  head: number;
  _draw_?: GraphvizOp[];
  _hdraw_?: GraphvizOp[];
  _tdraw_?: GraphvizOp[];
  _ldraw_?: GraphvizOp[];
}

/** A whole layout, as Graphviz gives it with the `json` format. */
export interface GraphvizLayout {
  bb: string;
  objects?: GraphvizObject[];
  edges?: GraphvizEdge[];
}

/** A drawing as marks: the space it needs and the marks in it. */
export interface LaidMarks {
  space: DiagramSpace;
  marks: DrawMark[];
}

/** CSS pixels in one of Graphviz's points. */
const PX = 4 / 3;

/** Graphviz's shapes, by the outline the core draws for each. Any other is drawn as a plain box. */
const SHAPES: Record<string, BoxShape> = {
  box: 'rect',
  rect: 'rect',
  rectangle: 'rect',
  square: 'rect',
  ellipse: 'ellipse',
  oval: 'ellipse',
  circle: 'ellipse',
  diamond: 'diamond',
  cylinder: 'cylinder',
  note: 'note',
  hexagon: 'hexagon',
};

const numbers = (s: string | undefined) => (s ?? '').split(',').map(Number);
const ANCHORS: Record<string, 'start' | 'middle' | 'end'> = { l: 'start', c: 'middle', r: 'end' };

/** The marks Graphviz's layout `g` gives, and the space they need. */
export function layoutMarks(g: GraphvizLayout): LaidMarks {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = numbers(g.bb);
  const space = { width: (x1 - x0) * PX, height: (y1 - y0) * PX };
  const at = (x: number, y: number): MarkPoint => [
    Math.min(space.width, Math.max(0, (x - x0) * PX)),
    Math.min(space.height, Math.max(0, (y1 - y) * PX)),
  ];
  // Graphviz's bounding box can sit a little inside a shape's edge, so each box is kept inside the space
  const inside = (x: number, y: number, width: number, height: number) => {
    const left = Math.min(Math.max(0, x), space.width),
      top = Math.min(Math.max(0, y), space.height);
    const w = Math.min(x + width, space.width) - left,
      h = Math.min(y + height, space.height) - top;
    return { x: left, y: top, width: Math.max(w, 0.01), height: Math.max(h, 0.01) };
  };
  const marks: DrawMark[] = [];
  const labels = (ops: GraphvizOp[] | undefined, id: string, style: string, of?: string) => {
    let size = 14;
    let n = 0;
    for (const o of ops ?? []) {
      if (o.op === 'F' && o.size) size = o.size;
      if (o.op !== 'T' || !o.pt || !o.text) continue;
      const [x, y] = at(o.pt[0], o.pt[1]);
      const anchor = ANCHORS[o.align ?? 'c'] ?? 'middle';
      const width = o.width ? { maxWidth: o.width * PX } : {};
      const extra = of === undefined ? {} : { of };
      const labelId = n++ === 0 ? `l:${id}` : `l${n - 1}:${id}`;
      marks.push({
        id: labelId,
        style,
        kind: 'label',
        x,
        y,
        text: o.text,
        size: size * PX,
        anchor,
        ...width,
        ...extra,
      });
    }
  };
  const objects = g.objects ?? [];
  for (const o of objects) {
    if (o.name.startsWith('cluster') && o.bb) {
      const [bx0 = 0, by0 = 0, bx1 = 0, by1 = 0] = numbers(o.bb);
      const [x, y] = at(bx0, by1);
      const box = inside(x, y, (bx1 - bx0) * PX, (by1 - by0) * PX);
      marks.push({ id: `g:${o.name}`, style: 'group', kind: 'group', ...box, role: 'group' });
      labels(o._ldraw_, `g:${o.name}`, 'group.label');
    } else if (o.pos) {
      const [px = 0, py = 0] = numbers(o.pos);
      const width = Number(o.width) * 72 * PX,
        height = Number(o.height) * 72 * PX;
      const [cx, cy] = at(px, py);
      const rounded = (o.style ?? '').includes('rounded');
      const shape = rounded ? 'round' : (SHAPES[o.shape ?? 'ellipse'] ?? 'rect');
      const box = inside(cx - width / 2, cy - height / 2, width, height);
      // a label of several lines is one T step a line: a screen reader says them all, as one name
      const lines = (o._ldraw_ ?? []).filter((d) => d.op === 'T' && d.text).map((d) => d.text);
      const name = lines.length ? { name: lines.join(' ') } : {};
      marks.push({ id: `t:${o.name}`, of: o.name, style: 'thing', kind: 'box', ...box, shape, role: 'thing', ...name });
      labels(o._ldraw_, `t:${o.name}`, 'thing.label', o.name);
    }
  }
  const seen = new Map<string, number>();
  for (const e of g.edges ?? []) {
    const from = objects[e.tail]?.name ?? '',
      to = objects[e.head]?.name ?? '';
    const key = JSON.stringify([from, to]);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const id = `e:${key}#${n}`;
    const line = e._draw_?.find((d) => (d.op === 'b' || d.op === 'L') && d.points);
    // A link Graphviz draws no line for (style=invis) is left out on purpose, with its arrowheads and label. Its
    // count is used up all the same, so the links after it keep their ids.
    if (!line?.points) continue;
    const points = line.points.map(([x, y]) => at(x, y));
    const curve = line.op === 'b' && (points.length - 1) % 3 === 0 ? { curve: true } : {};
    marks.push({ id, of: key, from, to, style: 'link', kind: 'link', points, ...curve, role: 'link' });
    for (const [ops, end, near] of [
      [e._hdraw_, 'head', points.at(-1)],
      [e._tdraw_, 'tail', points[0]],
    ] as const) {
      const head = arrowhead(ops, at, near);
      if (head) marks.push({ id: `${end}:${id}`, of: key, style: 'link', kind: 'arrowhead', ...head });
    }
    labels(e._ldraw_, id, 'link.label', key);
  }
  return { space, marks };
}

/** Where an arrowhead's tip is, its angle and its size, from the shape Graphviz draws for it; or null for none. */
function arrowhead(
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
