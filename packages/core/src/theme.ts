// The drawing's colours and size, as graph_svg.py writes them (spec §3, "one style"; §11, "contrast"). Graphviz is given
// placeholder colours. Here they become the host's colours from the one table (palette.ts). Those are Obsidian's theme
// colours by default, written as inline styles. Each hue is blended with the theme's text colour. So labels reach 4.5:1
// and lines 3:1 in both themes (the reasons are in the style file). A port of graph_svg._themed and of the direction
// choice in graph_svg.render, proved against them by the theme tests.
import GraphLayout from '@thoughtknot/graph-spec/src/graph-layout.js';
import { STYLE } from './layout.ts';
import { PALETTES } from './palette.ts';
import type { Palette } from './palette.ts';

/**
 * A number with `digits` decimals, as Python's format() writes it: the exact binary value rounded, ties to even.
 * (toFixed rounds ties away from zero, so 0.125 would be 0.13 here and 0.12 in Python.)
 */
export function fixed(x: number, digits: number): string {
  const [whole = '0', frac = ''] = Math.abs(x).toFixed(100).replace(/0+$/, '').split('.');
  const keep = frac.slice(0, digits).padEnd(digits, '0'),
    rest = frac.slice(digits);
  const last = Number((digits ? keep : whole).slice(-1));
  const up = rest > '5' || (rest === '5' && last % 2 === 1);
  const n = (BigInt(whole + keep) + (up ? 1n : 0n)).toString().padStart(digits + 1, '0');
  const sign = x < 0 || Object.is(x, -0) ? '-' : '';
  return sign + (digits ? `${n.slice(0, -digits)}.${n.slice(-digits)}` : n);
}

const hex2 = (i: number) => i.toString(16).padStart(2, '0');

/**
 * The theme colour a named hue is drawn in, for a box's fill, a line or border, or a label. It uses the locked style's
 * own blends (fill_opacity, line_mix, label_mix). They give labels 4.5:1 and lines 3:1 in both themes. A kind, a
 * reading or a look in the style graph (style.ts) is drawn in a hue. Every such hue goes through this one function, so
 * styling keeps that contrast. In the host's colours from the one table (palette.ts), Obsidian's theme unless another
 * is given.
 */
export function hueColour(hue: string, part: 'fill' | 'line' | 'label', p: Palette = PALETTES.obsidian): string {
  if (part === 'fill') return p.fill(hue);
  return p.blend(hue, part === 'line' ? STYLE.line_mix : STYLE.label_mix);
}

/** The placeholder colours of a layout, each with the theme colour that replaces it. */
function colours(kinds: string[], readings: string[], p: Palette): Map<string, string> {
  const out = new Map<string, string>([
    ['#0000fd', p.text],
    ['#0000fe', p.muted],
    ['#0000fc', p.edge],
    ['#000000', p.edge],
  ]);
  const kh = GraphLayout.pick(kinds, STYLE.kind_hues, STYLE.kind_colours);
  kinds.forEach((k, i) => {
    out.set(`#0001${hex2(i)}`, hueColour(kh[k] ?? '', 'fill', p));
    out.set(`#0002${hex2(i)}`, hueColour(kh[k] ?? '', 'line', p));
  });
  const eh = GraphLayout.pick(readings, STYLE.edge_hues, STYLE.edge_colours);
  readings.forEach((r, i) => {
    out.set(`#0003${hex2(i)}`, hueColour(eh[r] ?? '', 'line', p));
    out.set(`#0004${hex2(i)}`, hueColour(eh[r] ?? '', 'label', p));
  });
  return out;
}

/**
 * The SVG Graphviz drew, with the host's colours (Obsidian's theme by default) and the kind captions tracked out. It is
 * sized to fit a note, as graph_svg._themed does. A palette with a page paints it behind the drawing.
 */
export function themed(svg: string, kinds: string[], readings: string[], palette: Palette = PALETTES.obsidian): string {
  const colour = colours(kinds, readings, palette);
  const ls = STYLE.caption_letter_spacing * STYLE.kind_font_size,
    spacing = `<text letter-spacing="${fixed(ls, 2)}" `;
  // the kind caption is in capitals: tracked out a little, as capitals need, and kept centred
  svg = svg.replace(/(<text[^>]*fill="#0000fe"[^>]*>)([^<]*)<\/text>/g, (_, open: string, caption: string) => {
    let tag = open;
    const n = [...caption].length;
    if (tag.includes('text-anchor="start"'))
      tag = tag.replace(/\sx="([\d.-]+)"/, (_m, x: string) => ` x="${fixed(parseFloat(x) - (n * ls) / 2, 2)}"`);
    return tag.replace('<text ', spacing) + caption + '</text>';
  });
  svg = svg.replace(/<(?:path|polygon|ellipse|polyline|text)\b[^>]*>/g, (tag) => {
    const style: string[] = [];
    for (const [attr, pattern] of PAINTS) {
      const a = pattern.exec(tag);
      const c = a ? colour.get(a[1] ?? '') : undefined;
      if (a && c !== undefined) {
        tag = tag.replaceAll(a[0], '');
        style.push(`${attr}:${c}`);
      }
    }
    return style.length ? tag.replace(' ', ` style="${style.join(';')}" `) : tag;
  });
  svg = svg.replace(/<\?xml[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<!--[\s\S]*?-->|<title>[\s\S]*?<\/title>/g, '');
  const m = /<svg width="([\d.]+)pt" height="([\d.]+)pt"/.exec(svg);
  if (m)
    svg = svg.replace(
      m[0],
      `<svg width="${fixed((parseFloat(m[1] ?? '0') * 4) / 3, 0)}" style="max-width:100%;height:auto;filter:none${palette.page ? `;background:${palette.page}` : ''}"`,
    );
  // a palette that carries its own colours puts its style sheet first inside the drawing, where every shape sees it
  if (palette.style) svg = svg.replace(/(<svg\b[^>]*>)/, `$1\n<style>${palette.style}</style>`);
  // an HTML block in Markdown ends at a blank line, and an indented line can read as code — so neither may appear
  return svg
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l)
    .join('\n');
}

/** The colour attributes a shape is painted by, each with the pattern that finds its placeholder colour. */
const PAINTS: [string, RegExp][] = [
  ['fill', /\sfill="(#[0-9a-f]{6})"/],
  ['stroke', /\sstroke="(#[0-9a-f]{6})"/],
];

/** One laid-out drawing, as choose() weighs it: its direction and size. */
export interface Laid {
  rankdir: string;
  /** Natural size in CSS pixels. */
  width: number;
  height: number;
}

/** The size Graphviz gave a drawing, in CSS pixels. */
export function sizeOf(svg: string): { width: number; height: number } {
  const m = /<svg width="([\d.]+)pt" height="([\d.]+)pt"/.exec(svg);
  return { width: (parseFloat(m?.[1] ?? '0') * 4) / 3, height: (parseFloat(m?.[2] ?? '0') * 4) / 3 };
}

/**
 * Of the drawings laid out in each direction, the one that shrinks least to fit the page, as graph_svg.render chooses.
 * One that would stand taller than the style allows loses a quarter. A later one must be clearly better to win.
 */
export function choose<T extends Laid>(laid: T[]): T {
  let best: [number, T] | null = null;
  for (const l of laid) {
    const fit =
      Math.min(1.0, STYLE.page_width / l.width) -
      (l.height > STYLE.max_height_ratio * Math.max(l.width, STYLE.page_width) ? 0.25 : 0);
    if (best === null || fit > best[0] + 0.02) best = [fit, l];
  }
  if (!best) throw new Error('nothing was laid out');
  return best[1];
}

/**
 * The drawing with each blend replaced by its plain theme hue, for where CSS color-mix() is not supported. That is iOS
 * before 16.2, where Obsidian still runs (it needs iOS 15). There a blend would be dropped and the shape drawn black;
 * the plain hue keeps every colour's meaning, at a little less contrast. The host uses it only where color-mix is
 * unsupported.
 */
export function withoutColorMix(svg: string): string {
  return svg.replace(/color-mix\(in srgb, (var\(--color-\w+\)) \d+%, var\(--text-normal\)\)/g, '$1');
}
