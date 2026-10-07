// The drawing's colours and size, as graph_svg.py writes them (spec §3, "one style"; §11, "contrast"). Graphviz is given
// placeholder colours; here they become Obsidian theme colours, written as inline styles, each hue blended with the
// theme's text colour so labels reach 4.5:1 and lines 3:1 in both themes (the reasons are in the style file). A port of
// graph_svg._themed and of the direction choice in graph_svg.render, proved against them by the theme tests.
import GraphLayout from '@graph-note/graph-spec/src/graph-layout.js';
import { STYLE } from './layout.ts';

/**
 * A number with `digits` decimals, as Python's format() writes it: the exact binary value rounded, ties to even.
 * (toFixed rounds ties away from zero, so 0.125 would be 0.13 here and 0.12 in Python.)
 */
export function fixed(x: number, digits: number): string {
  const [whole = '0', frac = ''] = Math.abs(x).toFixed(100).replace(/0+$/, '').split('.');
  const keep = frac.slice(0, digits).padEnd(digits, '0'), rest = frac.slice(digits);
  const last = Number((digits ? keep : whole).slice(-1));
  const up = rest > '5' || (rest === '5' && last % 2 === 1);
  const n = (BigInt(whole + keep) + (up ? 1n : 0n)).toString().padStart(digits + 1, '0');
  const sign = x < 0 || Object.is(x, -0) ? '-' : '';
  return sign + (digits ? `${n.slice(0, -digits)}.${n.slice(-digits)}` : n);
}

const hex2 = (i: number) => i.toString(16).padStart(2, '0');
const blend = (hue: string, pct: number) => `color-mix(in srgb, var(--color-${hue}) ${pct}%, var(--text-normal))`;

/** The placeholder colours of a layout, each with the theme colour that replaces it. */
function colours(kinds: string[], readings: string[]): Map<string, string> {
  const S = STYLE, out = new Map<string, string>([['#0000fd', S.text], ['#0000fe', S.muted], ['#0000fc', S.edge], ['#000000', S.edge]]);
  const kh = GraphLayout.pick(kinds, S.kind_hues, S.kind_colours);
  kinds.forEach((k, i) => {
    out.set(`#0001${hex2(i)}`, `rgba(var(--color-${kh[k]}-rgb), ${S.fill_opacity})`);
    out.set(`#0002${hex2(i)}`, blend(kh[k] ?? '', S.line_mix));
  });
  const eh = GraphLayout.pick(readings, S.edge_hues, S.edge_colours);
  readings.forEach((r, i) => {
    out.set(`#0003${hex2(i)}`, blend(eh[r] ?? '', S.line_mix));
    out.set(`#0004${hex2(i)}`, blend(eh[r] ?? '', S.label_mix));
  });
  return out;
}

/** The SVG Graphviz drew, with theme colours, the kind captions tracked out, and sized to fit a note — as graph_svg._themed. */
export function themed(svg: string, kinds: string[], readings: string[]): string {
  const S = STYLE, colour = colours(kinds, readings);
  const ls = S.caption_letter_spacing * S.kind_font_size;
  // the kind caption is in capitals: tracked out a little, as capitals need, and kept centred
  svg = svg.replace(/(<text[^>]*fill="#0000fe"[^>]*>)([^<]*)<\/text>/g, (_, open: string, caption: string) => {
    let tag = open;
    const n = [...caption].length;
    if (tag.includes('text-anchor="start"')) tag = tag.replace(/\sx="([\d.-]+)"/, (_m, x: string) => ` x="${fixed(parseFloat(x) - (n * ls) / 2, 2)}"`);
    return tag.replace('<text ', `<text letter-spacing="${fixed(ls, 2)}" `) + caption + '</text>';
  });
  svg = svg.replace(/<(?:path|polygon|ellipse|polyline|text)\b[^>]*>/g, (tag) => {
    const style: string[] = [];
    for (const attr of ['fill', 'stroke']) {
      const a = new RegExp(`\\s${attr}="(#[0-9a-f]{6})"`).exec(tag);
      const c = a ? colour.get(a[1] ?? '') : undefined;
      if (a && c !== undefined) { tag = tag.split(a[0]).join(''); style.push(`${attr}:${c}`); }
    }
    return style.length ? tag.replace(' ', ` style="${style.join(';')}" `) : tag;
  });
  svg = svg.replace(/<\?xml[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<!--[\s\S]*?-->|<title>[\s\S]*?<\/title>/g, '');
  const m = /<svg width="([\d.]+)pt" height="([\d.]+)pt"/.exec(svg);
  if (m) svg = svg.replace(m[0], `<svg width="${fixed((parseFloat(m[1] ?? '0') * 4) / 3, 0)}" style="max-width:100%;height:auto;filter:none"`);
  // an HTML block in Markdown ends at a blank line, and an indented line can read as code — so neither may appear
  return svg.split(/\r\n|\r|\n/).map((l) => l.trim()).filter((l) => l).join('\n');
}

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
 * Of the drawings laid out in each direction, the one that shrinks least to fit the page, as graph_svg.render chooses:
 * one that would stand taller than the style allows loses a quarter, and a later one must be clearly better to win.
 */
export function choose<T extends Laid>(laid: T[]): T {
  let best: [number, T] | null = null;
  for (const l of laid) {
    const fit = Math.min(1.0, STYLE.page_width / l.width) - (l.height > STYLE.max_height_ratio * Math.max(l.width, STYLE.page_width) ? 0.25 : 0);
    if (best === null || fit > best[0] + 0.02) best = [fit, l];
  }
  if (!best) throw new Error('nothing was laid out');
  return best[1];
}

/**
 * The drawing with each blend replaced by its plain theme hue, for where CSS color-mix() is not supported — iOS before
 * 16.2, where Obsidian still runs (it needs iOS 15). There a blend would be dropped and the shape drawn black; the plain hue
 * keeps every colour's meaning, at a little less contrast. The host uses it only where color-mix is unsupported.
 */
export function withoutColorMix(svg: string): string {
  return svg.replace(/color-mix\(in srgb, (var\(--color-\w+\)) \d+%, var\(--text-normal\)\)/g, '$1');
}
