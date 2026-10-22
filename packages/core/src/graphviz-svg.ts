// A built-in drawing's SVG, written by the core from its marks (editor spec §43, plugin_interface). Graphviz lays the
// drawing out. The core reads that layout as marks (graphviz-marks.ts) and draws them itself here.
// - The SVG is the one Graphviz writes: the same parts, ids, classes, order, outlines and numbers. So the view, the
//   theme and every host read it as they read Graphviz's.
// - Colours are written as the layout's stand-ins, from each mark's style token, so theme.ts swaps them as before.
// - Every text is escaped as Graphviz escapes it, so markup in a label is drawn as text.
import type { DrawMark } from './drawing-marks.ts';
import { COLOUR_TOKENS, impliedLine } from './graphviz-json.ts';
import type { LaidMarks } from './graphviz-marks.ts';
import type { MarkPoint } from './plugin-diagrams.ts';

/** Graphviz's points in one CSS pixel. */
const PT = 3 / 4;
/** How round a rounded box's corners are, in points, when a mark gives no outline. */
const CORNER = 6;
/** How wide an arrowhead is beside its length, when a mark gives no outline. */
const ARROW_WIDTH = 0.35;
/** The font families Graphviz writes for the fonts it was given. */
const FAMILIES: Record<string, string> = { Helvetica: 'Helvetica,sans-Serif', 'Times-Roman': 'Times,serif' };
/** The colour names Graphviz writes in place of a colour. */
const NAMES: Record<string, string> = { '#000000': 'black', '#ffffff': 'white' };
const HEADER =
  '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"\n' +
  ' "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n';

const num = (x: number) => String(Math.round(x * 100) / 100 || 0);

/** Text as Graphviz escapes it: markup, quotes and dashes, and each space after a space in a label. */
function escaped(s: string, label = false): string {
  let out = '';
  let last = '';
  for (const [i, c] of [...s].entries()) {
    if (c === '&') out += label || !/^&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(s.slice(i)) ? '&amp;' : '&';
    else if (c === '<') out += '&lt;';
    else if (c === '>') out += '&gt;';
    else if (c === '"') out += '&quot;';
    else if (c === "'") out += '&#39;';
    else if (c === '-') out += '&#45;';
    else if (c === ' ' && last === ' ' && label) out += '&#160;';
    else out += c;
    last = c;
  }
  return out;
}

const HEX = Object.fromEntries(Object.entries(COLOUR_TOKENS).map(([hex, token]) => [token, hex]));

/** The stand-in colour a token is written in, as a fill or as a line. */
function colourOf(token: string, line: boolean): string {
  if (token === 'none') return 'none';
  const hex = (n: string | undefined) =>
    parseInt(n ?? '0', 10)
      .toString(16)
      .padStart(2, '0');
  const parts = token.split('.');
  const c =
    parts[0] === 'kind'
      ? `#000${line ? 2 : 1}${hex(parts[1])}`
      : parts[0] === 'reading'
        ? `#000${parts[2] === 'label' ? 4 : 3}${hex(parts[1])}`
        : (HEX[token] ?? '#000000');
  return NAMES[c] ?? c;
}

/** How a style token paints: its fill (none for an outline) and line, and whether the line is dashed. */
function paintOf(style: string): { fill: string; line: string; dashed: boolean } {
  let s = style;
  const dashed = s.endsWith('.dashed');
  if (dashed) s = s.slice(0, -'.dashed'.length);
  if (s.endsWith('.outline')) {
    const line = s.slice(0, -'.outline'.length);
    return { fill: 'none', line: colourOf(line, true), dashed };
  }
  const split = s.indexOf('.line.');
  const fill = split < 0 ? s : s.slice(0, split);
  const line = split < 0 ? impliedLine(fill) : s.slice(split + '.line.'.length);
  return { fill: colourOf(fill, false), line: colourOf(line, true), dashed };
}

/** A drawing's marks as Graphviz's SVG, from its layout: its size, room round it, and parts in order. */
export function layoutSvg(laid: LaidMarks): string {
  const { pad: padPx = 0, origin = [0, laid.space.height * PT], parts = [] } = laid.layout ?? {};
  const pad = padPx * PT;
  const [left, top] = origin;
  // as Graphviz rounds, to whole points: a half is rounded down, as every drawing the tests make shows
  const whole = (x: number) => Math.ceil(Number(x.toFixed(2)) - 0.5);
  const width = whole(laid.space.width * PT + 2 * pad),
    height = whole(laid.space.height * PT + 2 * pad);
  const gx = (x: number) => x * PT + left,
    gy = (y: number) => y * PT - top;
  const pt = ([x, y]: MarkPoint) => `${num(gx(x))},${num(gy(y))}`;
  const byId = new Map(laid.marks.map((m) => [m.id, m]));
  const lineAttrs = (m: DrawMark, dashed: boolean) =>
    `${m.lineWidth === undefined ? '' : ` stroke-width="${num(m.lineWidth * PT)}"`}${dashed ? ' stroke-dasharray="5,2"' : ''}`;
  const markSvg = (m: DrawMark): string => {
    const p = paintOf(m.style);
    if (m.kind === 'label') {
      const at = `x="${num(gx(m.x))}" y="${num(gy(m.y))}"`;
      const family = FAMILIES[m.font ?? 'Times-Roman'] ?? m.font;
      const fill = p.fill === 'black' ? '' : ` fill="${p.fill}"`;
      const font = `font-family="${family}" font-size="${(m.size * PT).toFixed(2)}"`;
      return `<text xml:space="preserve" text-anchor="${m.anchor}" ${at} ${font}${fill}>${escaped(m.text, true)}</text>`;
    }
    if (m.kind === 'link') {
      const points = m.outline?.points ?? m.points;
      const [first, ...rest] = points;
      const d = `M${pt(first ?? [0, 0])}${m.curve ? 'C' : 'L'}${rest.map(pt).join(' ')}`;
      return `<path fill="none" stroke="${p.line}"${lineAttrs(m, p.dashed)} d="${d}"/>`;
    }
    const fill = m.kind === 'group' ? 'none' : p.fill;
    const paint = ` fill="${fill}" stroke="${m.kind === 'group' ? colourOf(m.style.replace(/\.dashed$/, ''), true) : p.line}"${lineAttrs(m, p.dashed)}`;
    const outline = 'outline' in m ? m.outline : undefined;
    if (outline) {
      const ps = outline.points;
      if (m.kind === 'box' && m.shape === 'ellipse' && ps.length === 2) {
        const [[ax, ay], [bx, by]] = ps as [MarkPoint, MarkPoint];
        const c = `cx="${num(gx((ax + bx) / 2))}" cy="${num(gy((ay + by) / 2))}"`;
        return `<ellipse${paint} ${c} rx="${num((Math.abs(bx - ax) / 2) * PT)}" ry="${num((Math.abs(by - ay) / 2) * PT)}"/>`;
      }
      if (outline.curve) {
        const [first, ...rest] = ps;
        return `<path${paint} d="M${pt(first ?? [0, 0])}C${rest.map(pt).join(' ')}"/>`;
      }
      return `<polygon${paint} points="${[...ps, ps[0] ?? [0, 0]].map(pt).join(' ')}"/>`;
    }
    if (m.kind === 'arrowhead') return arrowSvg(m, paint, pt);
    return shapeSvg(m, paint, pt);
  };
  const out: string[] = [];
  for (const part of parts) {
    const drawn = part.marks
      .map((id) => byId.get(id))
      .filter((m) => m !== undefined)
      .map(markSvg);
    if (part.kind === 'graph') {
      if (part.title) out.push(`<title>${escaped(part.title)}</title>`);
      out.push(...drawn);
      continue;
    }
    out.push(
      `<g id="${escaped(part.id)}" class="${escaped(part.className)}">`,
      `<title>${escaped(part.title)}</title>`,
    );
    out.push(...drawn, '</g>');
  }
  return (
    `${HEADER}<svg width="${width}pt" height="${height}pt"\n viewBox="0.00 0.00 ${width}.00 ${height}.00" ` +
    `xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n` +
    `<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(${num(pad - left)} ${num(top + pad)})">\n` +
    `${out.join('\n')}\n</g>\n</svg>\n`
  );
}

/** A box or group with no outline given, drawn from its shape and box. */
function shapeSvg(
  m: Extract<DrawMark, { kind: 'box' | 'group' | 'item' | 'fold' }>,
  paint: string,
  pt: (p: MarkPoint) => string,
) {
  const { x, y, width: w, height: hh } = m;
  const shape = m.kind === 'box' ? (m.shape ?? 'rect') : m.kind === 'group' ? 'round' : 'rect';
  const corners = (ps: MarkPoint[]) => `<polygon${paint} points="${[...ps, ps[0] ?? [0, 0]].map(pt).join(' ')}"/>`;
  if (shape === 'ellipse') {
    const [cx, cy] = pt([x + w / 2, y + hh / 2]).split(',');
    return `<ellipse${paint} cx="${cx}" cy="${cy}" rx="${num((w / 2) * PT)}" ry="${num((hh / 2) * PT)}"/>`;
  }
  if (shape === 'diamond')
    return corners([
      [x + w / 2, y],
      [x + w, y + hh / 2],
      [x + w / 2, y + hh],
      [x, y + hh / 2],
    ]);
  if (shape !== 'round')
    return corners([
      [x + w, y],
      [x, y],
      [x, y + hh],
      [x + w, y + hh],
    ]);
  const r = Math.min(CORNER / PT, w / 2, hh / 2);
  const d =
    `M${pt([x + r, y])}C${pt([x + r, y])} ${pt([x + w - r, y])} ${pt([x + w - r, y])} ` +
    `${pt([x + w, y])} ${pt([x + w, y])} ${pt([x + w, y + r])} ${pt([x + w, y + r])} ${pt([x + w, y + hh - r])} ` +
    `${pt([x + w, y + hh - r])} ${pt([x + w, y + hh])} ${pt([x + w, y + hh])} ${pt([x + w - r, y + hh])} ` +
    `${pt([x + w - r, y + hh])} ${pt([x + r, y + hh])} ${pt([x + r, y + hh])} ${pt([x, y + hh])} ${pt([x, y + hh])} ` +
    `${pt([x, y + hh - r])} ${pt([x, y + hh - r])} ${pt([x, y + r])} ${pt([x, y + r])} ${pt([x, y])} ${pt([x, y])} ` +
    `${pt([x + r, y])}`;
  return `<path${paint} d="${d}"/>`;
}

/** An arrowhead with no outline given, drawn as a triangle from its tip, angle and size. */
function arrowSvg(m: Extract<DrawMark, { kind: 'arrowhead' }>, paint: string, pt: (p: MarkPoint) => string) {
  const a = (m.angle * Math.PI) / 180,
    half = m.size * ARROW_WIDTH;
  const tip: MarkPoint = [m.x, m.y];
  const base: MarkPoint = [m.x - m.size * Math.cos(a), m.y - m.size * Math.sin(a)];
  const side: MarkPoint = [-Math.sin(a) * half, Math.cos(a) * half];
  const ps: MarkPoint[] = [[base[0] + side[0], base[1] + side[1]], tip, [base[0] - side[0], base[1] - side[1]]];
  return `<polygon${paint} points="${[...ps, ps[0] ?? tip].map(pt).join(' ')}"/>`;
}
