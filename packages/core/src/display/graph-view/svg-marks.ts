// The marks of a drawing already on screen (editor spec §53, scale_space_view), read from its SVG as Graphviz wrote it.
// The 3D view lifts these into depth (space-view-panel.ts), so it lays nothing out. Each box, group and link keeps
// the colours the theme gave it. So the 3D view looks like the card, in light and dark.
// A group holds the things inside its box. A link names its two ends by its title, as Graphviz writes `a->b`. The
// plugin's own drawing has no titles: a thing is named by its data-key, and a link is joined to the things it touches.
import type { DrawMark } from '../../drawing-marks.ts';
import type { Paint, Paints } from './mark-painter.ts';

/** How many points a link's curve is read at. */
const LINK_STEPS = 16;

/** The marks of a drawing on screen, read from its SVG, and the colours each took from the theme. */
export function marksOfSvg(svg: SVGSVGElement): { marks: DrawMark[]; paints: Paints } {
  const tokens = new Map<string, string>(),
    table = new Map<string, Paint>();
  const styled = (shape: Element | null, text: Element | null): string => {
    const view = svg.ownerDocument.defaultView;
    const look = shape && view ? view.getComputedStyle(shape) : null,
      words = text && view ? view.getComputedStyle(text) : null;
    const paint: Paint = {};
    if (look && look.fill !== 'none') paint.fill = look.fill;
    if (look && look.stroke !== 'none') paint.line = look.stroke;
    if (words && words.fill !== 'none') paint.text = words.fill;
    const key = `${paint.fill ?? ''}|${paint.line ?? ''}|${paint.text ?? ''}`;
    let token = tokens.get(key);
    if (!token) {
      token = `svg.${tokens.size}`;
      tokens.set(key, token);
      table.set(token, paint);
    }
    return token;
  };
  const marks: DrawMark[] = [];
  const titleOf = (g: Element) => g.querySelector(':scope > title')?.textContent?.trim() ?? '';
  const boxOf = (shape: Element) => (shape as SVGGraphicsElement).getBBox();
  const clusters: { id: string; x: number; y: number; width: number; height: number }[] = [];
  for (const g of Array.from(svg.querySelectorAll('g.cluster'))) {
    const shape = g.querySelector(':scope > polygon, :scope > path');
    if (!shape) continue;
    const { x, y, width, height } = boxOf(shape);
    const id = `g:${titleOf(g) || clusters.length}`;
    clusters.push({ id, x, y, width, height });
    marks.push({ id, kind: 'group', style: styled(shape, g.querySelector('text')), x, y, width, height });
  }
  /** The smallest group holding the box from (`x`, `y`), `width` by `height`. */
  const holding = (x: number, y: number, width: number, height: number, not = '') => {
    let best: (typeof clusters)[number] | undefined;
    for (const c of clusters)
      if (c.id !== not && c.x <= x && c.y <= y && c.x + c.width >= x + width && c.y + c.height >= y + height)
        if (!best || c.width * c.height < best.width * best.height) best = c;
    return best?.id;
  };
  for (const m of marks) {
    if (m.kind !== 'group') continue;
    const around = holding(m.x, m.y, m.width, m.height, m.id);
    if (around) m.group = around;
  }
  const keys = new Set<string>();
  const boxes: Placed[] = [];
  for (const g of Array.from(svg.querySelectorAll('g.node'))) {
    const shape = g.querySelector(
      ':scope > polygon, :scope > ellipse, :scope > path, :scope > a polygon, :scope > a path',
    );
    if (!shape) continue;
    // the plugin's own drawing names a thing by data-key and drops Graphviz's titles; a plain Graphviz SVG has titles
    const key = g.getAttribute('data-key') ?? (titleOf(g) || g.id);
    const name = g.getAttribute('aria-label');
    const { x, y, width, height } = boxOf(shape);
    const text = nameOf(g);
    const group = holding(x, y, width, height);
    const style = styled(shape, text);
    keys.add(key);
    boxes.push({ key, x, y, width, height });
    marks.push({
      id: `t:${key}`,
      kind: 'box',
      style,
      of: key,
      x,
      y,
      width,
      height,
      ...(group ? { group } : {}),
      ...(name ? { name } : {}),
    });
    if (text?.textContent) {
      const size = sizeOf(text);
      marks.push({
        id: `l:${key}`,
        kind: 'label',
        style,
        of: key,
        x: x + width / 2,
        y: y + height / 2,
        text: text.textContent,
        size,
        anchor: 'middle',
      });
    }
  }
  for (const g of Array.from(svg.querySelectorAll('g.edge'))) {
    const path = g.querySelector<SVGPathElement>('path');
    if (!path || typeof path.getTotalLength !== 'function') continue;
    const length = path.getTotalLength();
    const points = Array.from({ length: LINK_STEPS + 1 }, (_, i) => {
      const p = path.getPointAtLength((length * i) / LINK_STEPS);
      return [p.x, p.y] as [number, number];
    });
    const title = endsOf(titleOf(g), keys);
    // a link with no title is joined to the things its two ends touch
    let ends = title.from !== undefined ? title : touching(points, boxes);
    // the arrowhead shows which way it points: a link drawn backwards (dir=back) has it at its first point
    if (ends.from !== undefined && ends.to !== undefined && headFirst(g, points)) {
      ends = { from: ends.to, to: ends.from };
      points.reverse();
    }
    const words = Array.from(g.querySelectorAll(':scope > text, :scope > a text, :scope > g text'))
      .map((t) => t.textContent?.trim() ?? '')
      .filter((t) => t)
      .join(' ');
    marks.push({
      id: `e:${g.id || marks.length}`,
      kind: 'link',
      style: styled(path, null),
      points,
      ...ends,
      ...(words ? { name: words } : {}),
    });
  }
  return { marks, paints: (style) => table.get(style) ?? {} };
}

/** Whether the arrowhead of the link drawn in `g` sits nearer its first point than its last. */
function headFirst(g: Element, points: readonly (readonly [number, number])[]): boolean {
  const head = g.querySelector(':scope > polygon, :scope > a polygon');
  const first = points[0],
    last = points[points.length - 1];
  if (!head || !first || !last || typeof (head as SVGGraphicsElement).getBBox !== 'function') return false;
  const box = (head as SVGGraphicsElement).getBBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  return Math.hypot(x - first[0], y - first[1]) < Math.hypot(x - last[0], y - last[1]);
}

/** A thing's box on the page, by its key. */
interface Placed {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How far a link's end may stop from a thing's box, in pixels, and still be its end: room for an arrowhead. */
const END_REACH = 24;

/** The keys of the things nearest a link's first and last points, each within END_REACH. None when either has none. */
function touching(
  points: readonly (readonly [number, number])[],
  boxes: readonly Placed[],
): { from?: string; to?: string } {
  const nearest = (p: readonly [number, number] | undefined) => {
    let best: string | undefined,
      bestGap = END_REACH;
    if (p)
      for (const b of boxes) {
        const gap = Math.hypot(
          Math.max(b.x - p[0], 0, p[0] - b.x - b.width),
          Math.max(b.y - p[1], 0, p[1] - b.y - b.height),
        );
        if (gap <= bestGap) {
          best = b.key;
          bestGap = gap;
        }
      }
    return best;
  };
  const from = nearest(points[0]),
    to = nearest(points[points.length - 1]);
  return from !== undefined && to !== undefined ? { from, to } : {};
}

/** The size of `text`'s letters, as Graphviz writes them; 14 when it says none. */
const sizeOf = (text: Element) => Number.parseFloat(text.getAttribute('font-size') ?? '') || 14;

/**
 * The words naming a thing: the largest in its box. A thing may show its kind in small letters above its name, and
 * the name is what a label should say (Roger, 23 Oct 2026). The first of the largest wins.
 */
function nameOf(g: Element): Element | null {
  let best: Element | null = null;
  for (const t of Array.from(g.querySelectorAll('text')))
    if (t.textContent?.trim() && (!best || sizeOf(t) > sizeOf(best))) best = t;
  return best;
}

/**
 * A link's two ends from its title, `a->b` or `a--b`, each a key drawn. A key may hold `->` itself, so each place the
 * title could be cut is tried. A port after a colon, as in `a:n->b`, is left off. None when no cut gives two keys.
 */
function endsOf(title: string, keys: ReadonlySet<string>): { from?: string; to?: string } {
  const key = (part: string) =>
    keys.has(part) ? part : keys.has(part.replace(/:[^:]*$/, '')) ? part.replace(/:[^:]*$/, '') : null;
  for (const cut of title.matchAll(/->|--/g)) {
    const from = key(title.slice(0, cut.index)),
      to = key(title.slice(cut.index + 2));
    if (from !== null && to !== null) return { from, to };
  }
  return {};
}
