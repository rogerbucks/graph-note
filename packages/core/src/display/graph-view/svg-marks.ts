// The marks of a drawing already on screen (editor spec §53, scale_space_view), read from its SVG as Graphviz wrote it.
// The 3D view lifts these into depth (space-view-panel.ts), so it lays nothing out. Each box, group and link keeps
// the colours the theme gave it. So the 3D view looks like the card, in light and dark.
// A group holds the things inside its box; a link names its two ends by its title, as Graphviz writes `a->b`.
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
  for (const g of Array.from(svg.querySelectorAll('g.node'))) {
    const shape = g.querySelector(
      ':scope > polygon, :scope > ellipse, :scope > path, :scope > a polygon, :scope > a path',
    );
    if (!shape) continue;
    const key = titleOf(g);
    const { x, y, width, height } = boxOf(shape);
    const text = g.querySelector('text');
    const group = holding(x, y, width, height);
    const style = styled(shape, text);
    keys.add(key);
    marks.push({ id: `t:${key}`, kind: 'box', style, of: key, x, y, width, height, ...(group ? { group } : {}) });
    if (text?.textContent) {
      const size = Number.parseFloat(text.getAttribute('font-size') ?? '') || 14;
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
    const ends = endsOf(titleOf(g), keys);
    marks.push({ id: `e:${g.id || marks.length}`, kind: 'link', style: styled(path, null), points, ...ends });
  }
  return { marks, paints: (style) => table.get(style) ?? {} };
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
