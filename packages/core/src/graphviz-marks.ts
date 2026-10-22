// Graphviz's layout as drawing marks (editor spec §43, plugin_interface). The built-in diagram types are laid out by
// Graphviz. Read as JSON, its layout gives each shape, line and text it draws. This turns them into marks
// (drawing-marks.ts). Then the core can draw a built-in type as it draws a plug-in's.
// - Graphviz counts points from the bottom, in points. Marks count from the top, in CSS pixels: 4/3 of a point.
// - Each shape keeps the exact outline Graphviz drew, so a drawing made from the marks matches Graphviz's own.
// - Each id starts with what it marks, so no key can give another mark's id. A box is `t:` and the thing's key, a
//   group `g:` and its cluster's name. A link is `e:`, the keys it joins as JSON, and a count, so two links between the
//   same things keep their own ids. A label is `l:` and what it labels; its later lines `l1:`, `l2:` and on. An
//   arrowhead is `head:` or `tail:` and its link. Any other shape is `s1:`, `s2:` and on, and what it is part of.
// - How a mark looks is a style token, never a colour. The layout is written in stand-in colours that the theme swaps
//   for the host's (theme.ts). Each stand-in is read back as the token it stands for (`colourToken`).
import type { BoxShape, DrawMark, MarkOutline } from './drawing-marks.ts';
import { arrowhead, colourToken, known, shapeStyle } from './graphviz-json.ts';
import type { GraphvizEdge, GraphvizLayout, GraphvizOp } from './graphviz-json.ts';
import type { DiagramSpace, MarkPoint } from './plugin-diagrams.ts';

/** One part of Graphviz's own SVG: its tag, id, class and title, and its marks, in the order Graphviz writes them. */
export interface LaidPart {
  kind: 'graph' | 'cluster' | 'node' | 'edge';
  id: string;
  className: string;
  title: string;
  marks: string[];
}

/** A drawing as marks: the space it needs and the marks in it. */
export interface LaidMarks {
  space: DiagramSpace;
  marks: DrawMark[];
  /**
   * How Graphviz's own SVG holds the drawing. `pad` is the room round it, in CSS pixels. `origin` is where its top left
   * is, in Graphviz's points. `parts` are in the order Graphviz writes them. `lost` is set when the marks cannot give it back exactly: Graphviz's JSON
   * left a text out, as it does for some labels with a backslash and a quote, or a colour is no stand-in. Then only
   * Graphviz's own SVG draws it as written.
   */
  layout?: { pad: number; origin: MarkPoint; parts: LaidPart[]; lost?: true };
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
  point: 'ellipse',
  diamond: 'diamond',
  cylinder: 'cylinder',
  note: 'note',
  hexagon: 'hexagon',
};

const numbers = (s: string | undefined) => (s ?? '').split(',').map(Number);
const ANCHORS: Record<string, 'start' | 'middle' | 'end'> = { l: 'start', c: 'middle', r: 'end' };

/** The marks Graphviz's layout `g` gives, the space they need, and how Graphviz's own SVG holds them. */
export function layoutMarks(g: GraphvizLayout): LaidMarks {
  const pad = parseFloat(g.pad ?? '0.0555') * 72;
  // JSON gives the bounding box to five figures only. The page Graphviz fills is given to two places, so it is read
  // instead. The page holds the room round the drawing only when the graph sets its pad.
  const page = g._draw_?.find((d) => d.op === 'P' && d.points)?.points;
  const inset = g.pad === undefined ? 0 : pad;
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page
    ? [
        Math.min(...page.map((p) => p[0])) + inset,
        Math.min(...page.map((p) => p[1])) + inset,
        Math.max(...page.map((p) => p[0])) - inset,
        Math.max(...page.map((p) => p[1])) - inset,
      ]
    : numbers(g.bb);
  const space = { width: (x1 - x0) * PX, height: (y1 - y0) * PX };
  const exact = (x: number, y: number): MarkPoint => [(x - x0) * PX, (y1 - y) * PX];
  const at = (x: number, y: number): MarkPoint => {
    const [ex, ey] = exact(x, y);
    return [Math.min(space.width, Math.max(0, ex)), Math.min(space.height, Math.max(0, ey))];
  };
  // a shape can reach a little past Graphviz's bounding box, so each box is kept inside the space; its outline is exact
  const inside = (points: readonly MarkPoint[]) => {
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    const left = Math.min(Math.max(0, Math.min(...xs)), space.width),
      top = Math.min(Math.max(0, Math.min(...ys)), space.height);
    const w = Math.min(Math.max(...xs), space.width) - left,
      h = Math.min(Math.max(...ys), space.height) - top;
    return { x: left, y: top, width: Math.max(w, 0.01), height: Math.max(h, 0.01) };
  };
  const marks: DrawMark[] = [];
  let lost: true | undefined;
  /** How many shapes and lines each owner has had, so its later marks take the next numbers. */
  const counts = new Map<string, { shapes: number; lines: number }>();
  /** Each step of `ops` as marks, ids made from `owner`; the first shape is `first`'s, when given. Returns their ids. */
  const drawn = (ops: GraphvizOp[] | undefined, owner: string, of?: string, first?: (m: DrawMark) => DrawMark) => {
    const ids: string[] = [];
    if (ops?.some((o) => o.op === 'F') && !ops.some((o) => o.op === 'T')) lost = true;
    let pen: string | undefined,
      fill: string | undefined,
      dashed = false,
      width: number | undefined;
    let size = 14,
      face: string | undefined;
    const count = counts.get(owner) ?? { shapes: 0, lines: 0 };
    counts.set(owner, count);
    const extra = of === undefined ? {} : { of };
    const push = (m: DrawMark) => (marks.push(m), ids.push(m.id));
    for (const o of ops ?? []) {
      if ((o.op === 'c' || o.op === 'C') && !known(o.color)) lost = true;
      if (o.op === 'c') pen = o.color;
      else if (o.op === 'C') fill = o.color;
      else if (o.op === 'F') {
        size = o.size ?? size;
        face = o.face;
      } else if (o.op === 'S' && o.style === 'dashed') dashed = true;
      else if (o.op === 'S' && o.style === 'solid') dashed = false;
      else if (o.op === 'S') {
        const w = /^setlinewidth\(([\d.]+)\)$/.exec(o.style ?? '');
        if (w) width = parseFloat(w[1] ?? '1') === 1 ? undefined : parseFloat(w[1] ?? '1') * PX;
      } else if (o.op === 'T' && o.pt && o.text) {
        const [x, y] = at(o.pt[0], o.pt[1]);
        const id = count.lines++ === 0 ? `l:${owner}` : `l${count.lines - 1}:${owner}`;
        const anchor = ANCHORS[o.align ?? 'c'] ?? 'middle';
        const widest = o.width ? { maxWidth: o.width * PX } : {};
        const font = face ? { font: face } : {};
        push({
          id,
          style: colourToken(pen),
          kind: 'label',
          x,
          y,
          text: o.text,
          size: size * PX,
          anchor,
          ...widest,
          ...font,
          ...extra,
        });
      } else if ('PpBbEe'.includes(o.op) && (o.points || o.rect)) {
        const filled = o.op === o.op.toUpperCase();
        const curve = o.op === 'B' || o.op === 'b';
        const points: MarkPoint[] = o.rect
          ? [exact(o.rect[0] - o.rect[2], o.rect[1] + o.rect[3]), exact(o.rect[0] + o.rect[2], o.rect[1] - o.rect[3])]
          : (o.points ?? []).map(([x, y]) => exact(x, y));
        const outline: MarkOutline = { points, ...(curve && (points.length - 1) % 3 === 0 ? { curve: true } : {}) };
        const style = shapeStyle(filled ? fill : undefined, pen, dashed);
        const lineWidth = width === undefined ? {} : { lineWidth: width };
        const shape = o.rect ? { shape: 'ellipse' as const } : {};
        const id = count.shapes++ === 0 ? owner : `s${count.shapes - 1}:${owner}`;
        const box: DrawMark = { id, style, kind: 'box', ...inside(points), ...shape, outline, ...lineWidth, ...extra };
        push(count.shapes === 1 && first ? first(box) : box);
      }
    }
    return ids;
  };
  const parts: LaidPart[] = [];
  // Graphviz's own SVG fills the whole page, the room round the drawing too, unless its background is transparent
  const graphMarks: string[] = [];
  const background = colourToken(g.bgcolor === undefined ? '#ffffff' : g.bgcolor);
  if (background !== 'none') {
    const [l, t, r, b] = [-pad * PX, -pad * PX, space.width + pad * PX, space.height + pad * PX];
    const page: MarkPoint[] = [
      [l, b],
      [l, t],
      [r, t],
      [r, b],
    ];
    const outline = { points: page };
    marks.push({ id: 'background', style: background, kind: 'box', ...inside(page), outline });
    graphMarks.push('background');
  }
  graphMarks.push(...drawn(g._ldraw_, 'g:'));
  const title = g.name && !g.name.startsWith('%') ? g.name : '';
  parts.push({ kind: 'graph', id: '', className: '', title, marks: graphMarks });
  const objects = g.objects ?? [];
  const subgraphs = g._subgraph_cnt ?? objects.filter((o) => !o.pos).length;
  const invisible = (style: string | undefined) => /(^|,)\s*invis\s*(,|$)/.test(style ?? '');
  // Graphviz writes each cluster, then the clusters in it, numbered by their place among the subgraphs
  const inner = new Set(objects.slice(0, subgraphs).flatMap((o) => o.subgraphs ?? []));
  const cluster = (i: number) => {
    const o = objects[i];
    if (!o) return;
    if (o.name.startsWith('cluster') && o.bb) {
      const id = `g:${o.name}`;
      const pen = o._draw_?.find((d) => d.op === 'c')?.color;
      const dashed = !!o._draw_?.some((d) => d.op === 'S' && d.style === 'dashed');
      const style = colourToken(pen) + (dashed ? '.dashed' : '');
      const group = (m: DrawMark): DrawMark => (m.kind === 'box' ? { ...m, kind: 'group', style, role: 'group' } : m);
      const ids = [...drawn(o._draw_, id, undefined, group), ...drawn(o._ldraw_, id)];
      const cls = o.class ? `cluster ${o.class}` : 'cluster';
      parts.push({ kind: 'cluster', id: o.id ?? `clust${i + 1}`, className: cls, title: o.name, marks: ids });
    }
    for (const c of o.subgraphs ?? []) cluster(c);
  };
  for (let i = 0; i < subgraphs; i++) if (!inner.has(i)) cluster(i);
  const nodeParts = new Map<number, LaidPart>();
  objects.slice(subgraphs).forEach((o, n) => {
    if (invisible(o.style)) return;
    const id = `t:${o.name}`;
    const rounded = (o.style ?? '').includes('rounded');
    const shape = rounded ? 'round' : (SHAPES[o.shape ?? 'ellipse'] ?? 'rect');
    // a label of several lines is one T step a line: a screen reader says them all, as one name
    const lines = (o._ldraw_ ?? []).filter((d) => d.op === 'T' && d.text).map((d) => d.text);
    const name = lines.length ? { name: lines.join(' ') } : {};
    const thing = (m: DrawMark): DrawMark =>
      m.kind === 'box' ? { ...m, shape: m.shape === 'ellipse' ? 'ellipse' : shape, role: 'thing', ...name } : m;
    const ids = [...drawn(o._draw_, id, o.name, thing), ...drawn(o._ldraw_, id, o.name)];
    const cls = o.class ? `node ${o.class}` : 'node';
    nodeParts.set(subgraphs + n, {
      kind: 'node',
      id: o.id ?? `node${n + 1}`,
      className: cls,
      title: o.name,
      marks: ids,
    });
  });
  const seen = new Map<string, number>();
  const edgeParts: [number, number, number, LaidPart | null][] = [];
  (g.edges ?? []).forEach((e, n) => {
    const from = objects[e.tail]?.name ?? '',
      to = objects[e.head]?.name ?? '';
    const key = JSON.stringify([from, to]);
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    const id = `e:${key}#${count}`;
    // A link Graphviz draws no line for (style=invis) is left out on purpose, with its arrowheads and label. Its
    // count is used up all the same, so the links after it keep their ids.
    const line = e._draw_?.find((d) => (d.op === 'b' || d.op === 'L') && d.points);
    if (!line?.points || invisible(e.style)) return edgeParts.push([e._gvid ?? n, e.tail, e.head, null]);
    const ids = linkMarks(e, line, id, key, from, to);
    ids.push(...drawn(e._ldraw_, id, key));
    const title = `${from}${g.directed === false ? '--' : '->'}${to}`;
    const cls = e.class ? `edge ${e.class}` : 'edge';
    edgeParts.push([
      e._gvid ?? n,
      e.tail,
      e.head,
      { kind: 'edge', id: e.id ?? `edge${n + 1}`, className: cls, title, marks: ids },
    ]);
  });
  // Graphviz writes each thing, then for each of its links out the thing at the other end and then the link. A link
  // not drawn still writes the thing at its other end first.
  const written = new Set<number>();
  const writeNode = (i: number) => {
    const part = nodeParts.get(i);
    if (part && !written.has(i)) parts.push(part);
    written.add(i);
  };
  edgeParts.sort((a, b) => a[0] - b[0]);
  for (const i of [...Array(objects.length).keys()].slice(subgraphs)) {
    writeNode(i);
    for (const [, tail, head, part] of edgeParts)
      if (tail === i) {
        writeNode(head);
        if (part) parts.push(part);
      }
  }
  return { space, marks, layout: { pad: pad * PX, origin: [x0, y1], parts, ...(lost ? { lost } : {}) } };

  /** A link's line and arrowheads as marks: the tail's arrowhead drawn first, as Graphviz draws it. */
  function linkMarks(e: GraphvizEdge, line: GraphvizOp, id: string, key: string, from: string, to: string) {
    const ids: string[] = [];
    const raw = (line.points ?? []).map(([x, y]) => exact(x, y));
    const points = (line.points ?? []).map(([x, y]) => at(x, y));
    const curve = line.op === 'b' && (points.length - 1) % 3 === 0 ? { curve: true } : {};
    const moved = raw.some((p, i) => p[0] !== points[i]?.[0] || p[1] !== points[i]?.[1]);
    const outline = moved ? { outline: { points: raw, ...curve } } : {};
    const looks = drawn(e._draw_, `x:${id}`);
    const shown = marks.splice(marks.length - looks.length, looks.length)[0];
    const style = shown?.style.replace(/\.outline/, '') ?? 'link';
    const lineWidth = shown?.lineWidth === undefined ? {} : { lineWidth: shown.lineWidth };
    marks.push({
      id,
      of: key,
      from,
      to,
      style,
      kind: 'link',
      points,
      ...curve,
      ...outline,
      ...lineWidth,
      role: 'link',
    });
    ids.push(id);
    for (const [ops, end, near] of [
      [e._tdraw_, 'tail', points[0]],
      [e._hdraw_, 'head', points.at(-1)],
    ] as const) {
      const head = arrowhead(ops, at, near);
      if (!head) continue;
      const look = drawn(ops, `x:${end}:${id}`);
      const box = marks.splice(marks.length - look.length, look.length)[0];
      const exactOutline = box?.kind === 'box' && box.outline ? { outline: box.outline } : {};
      const width = box?.lineWidth === undefined ? {} : { lineWidth: box.lineWidth };
      const style = box?.style ?? 'link';
      marks.push({ id: `${end}:${id}`, of: key, style, kind: 'arrowhead', ...head, ...exactOutline, ...width });
      ids.push(`${end}:${id}`);
    }
    return ids;
  }
}
