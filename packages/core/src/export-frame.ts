// The frame round an exported image (editor spec §16, export_self_explaining, export_fixed_theme). It has a background
// of its own, a title and what the image shows in plain language, and the legend. A footer says which note it came from
// and when, so the image explains itself outside Obsidian. The text is in the locked style's font and sizes, in the
// palette's fixed colours. The title is at the font size, the reading and legend at the edge-label size, and the footer
// at the caption size. The drawing is nested inside, untouched, at its natural size. Widths of text are estimated, as
// an SVG cannot measure its own. So long lines are wrapped a little early rather than run out of the frame.
import { STYLE } from './layout.ts';
import type { Palette } from './palette.ts';
import { fixed } from './theme.ts';
import { isolated } from './bidi.ts';

/** The least width of a frame in CSS pixels, so a small drawing still has room for its title and legend. */
export const FRAME_MIN_WIDTH = 360;

/** One row of the legend: what it means, and the colours of its swatch. */
export interface LegendItem {
  label: string;
  fill: string;
  stroke: string;
}

/** What the frame says: the title, an optional reading beneath it, the legend, and the footer. */
export interface FrameText {
  title: string;
  subtitle?: string;
  legend: LegendItem[];
  footer: string;
}

/** A drawing to put in the frame: its SVG as theme.ts gives it, and its natural size in CSS pixels. */
export interface Inner {
  svg: string;
  width: number;
  height: number;
}

const PAD = 16;
const SWATCH = 14;
const FONT = `${STYLE.font},sans-Serif`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// the locked style's sizes are in points; the image is in CSS pixels
const TITLE = (STYLE.font_size * 4) / 3;
const BODY = (STYLE.edge_font_size * 4) / 3;
const SMALL = (STYLE.kind_font_size * 4) / 3;
const LEAD = STYLE.line_height;

/** A day as `11 Oct 2026` from `2026-10-11`; anything that is not a day is returned as it was given. */
export function saidDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = Number(m?.[2]),
    day = Number(m?.[3]);
  return m && month >= 1 && month <= 12 && day >= 1 && day <= 31 ? `${day} ${MONTHS[month - 1]} ${m[1]}` : iso;
}

const escaped = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const num = (x: number) => String(Math.round(x * 100) / 100);

/** Whether a character is drawn about one em wide: East Asian wide and full-width characters, and emoji and symbols. */
function isWide(c: string): boolean {
  const code = c.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2600 && code <= 0x27bf) || // symbols and dingbats, mostly drawn as emoji
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK radicals, kana, ideographs, Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK compatibility ideographs
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK compatibility forms
    (code >= 0xff00 && code <= 0xff60) || // full-width forms
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f000 && code <= 0x1faff) || // emoji
    (code >= 0x20000 && code <= 0x3fffd) // CJK extensions
  );
}

/**
 * The width of `text` at `size`, estimated. Helvetica's average letter is about 0.56 em, bold about 0.6. A wide
 * character (East Asian, full-width, emoji) is about 1 em, as it is drawn in the font that has it.
 */
const widthOf = (text: string, size: number, bold = false) =>
  [...text].reduce((sum, c) => sum + size * (isWide(c) ? 1 : bold ? 0.6 : 0.56), 0);

/** `text` broken into lines of at most `most` pixels, at spaces where it can be and inside a word where it cannot. */
function wrapped(text: string, most: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  let line = '';
  const fits = (s: string) => widthOf(s, size, bold) <= most;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const joined = line ? `${line} ${word}` : word;
    if (fits(joined)) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    // the word on a line of its own, broken inside when it is longer than a line
    for (const c of word) {
      if (line && !fits(line + c)) {
        lines.push(line);
        line = '';
      }
      line += c;
    }
  }
  return line || !lines.length ? [...lines, line] : lines;
}

/** Lines of text as one element: the first at `y`, the others a line lower each. */
function block(lines: string[], x: number, y: number, size: number, fill: string, bold = false): string {
  const tspans = lines.map(
    (l, i) => `<tspan x="${num(x)}"${i ? ` dy="${num(size * LEAD)}"` : ''}>${isolated(escaped(l))}</tspan>`,
  );
  const weight = bold ? ' font-weight="bold"' : '';
  return `<text x="${num(x)}" y="${num(y)}" font-family="${FONT}" font-size="${fixed(size, 2)}"${weight} fill="${fill}">${tspans.join('')}</text>`;
}

/** The legend laid out in rows that fill the width: its markup, and the height it takes. */
function legendRows(items: LegendItem[], x: number, y: number, wide: number, p: Palette) {
  const line = BODY * LEAD,
    gap = 18,
    mostLabel = wide - SWATCH - 6;
  const out: string[] = [];
  let at = x,
    top = y,
    rowHeight = 0;
  for (const item of items) {
    const lines = wrapped(item.label, mostLabel, BODY),
      width = SWATCH + 6 + Math.max(...lines.map((l) => widthOf(l, BODY)));
    if (at > x && at + width > x + wide) {
      top += rowHeight + 6;
      at = x;
      rowHeight = 0;
    }
    out.push(
      `<rect class="legend-swatch" x="${num(at)}" y="${num(top)}" width="${SWATCH}" height="${SWATCH}" rx="3" fill="${item.fill}" stroke="${item.stroke}" stroke-width="1.2"/>`,
      block(lines, at + SWATCH + 6, top + BODY * 0.9, BODY, p.text),
    );
    rowHeight = Math.max(rowHeight, lines.length * line, SWATCH);
    at += width + gap;
  }
  return { svg: out.join(''), height: items.length ? top + rowHeight - y : 0 };
}

/**
 * The drawing in its frame, as one self-contained SVG with its width and height in CSS pixels. The palette must be a
 * fixed one that paints its own page (palettes.ts `light` or `dark`). So the image reads the same wherever it is
 * opened.
 */
export function framed(
  inner: Inner,
  text: FrameText,
  palette: Palette,
): { svg: string; width: number; height: number } {
  const page = palette.page;
  if (!page) throw new Error('an export needs a fixed palette, one that paints its own page');
  const open = /^<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/.exec(inner.svg);
  if (!open) throw new Error('the drawing is not an SVG');
  const viewBox =
    /viewBox="([^"]*)"/.exec(open[1] ?? '')?.[1] ?? `0 0 ${num((inner.width * 3) / 4)} ${num((inner.height * 3) / 4)}`;
  const width = Math.ceil(Math.max(FRAME_MIN_WIDTH, inner.width + 2 * PAD)),
    wide = width - 2 * PAD;
  const parts: string[] = [];
  let y = PAD;
  const say = (lines: string[], size: number, fill: string, bold = false) => {
    parts.push(block(lines, PAD, y + size, size, fill, bold));
    y += size + (lines.length - 1) * size * LEAD + size * 0.4;
  };
  say(wrapped(text.title, wide, TITLE, true), TITLE, palette.text, true);
  if (text.subtitle) say(wrapped(text.subtitle, wide, BODY), BODY, palette.muted);
  if (text.legend.length) {
    y += 6;
    const legend = legendRows(text.legend, PAD, y, wide, palette);
    parts.push(legend.svg);
    y += legend.height + 10;
  }
  const x = PAD + (wide - inner.width) / 2;
  parts.push(
    `<svg x="${num(x)}" y="${num(y)}" width="${num(inner.width)}" height="${num(inner.height)}" viewBox="${viewBox}">${open[2]}</svg>`,
  );
  y += inner.height + 10;
  say(wrapped(text.footer, wide, SMALL), SMALL, palette.muted);
  const height = Math.ceil(y + PAD - SMALL * 0.4);
  const described = [text.subtitle, text.footer].filter(Boolean).join('. ');
  return {
    svg: [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
      `<title>${escaped(text.title)}</title><desc>${escaped(described)}</desc>`,
      `<rect x="0" y="0" width="${width}" height="${height}" fill="${page}"/>`,
      ...parts,
      '</svg>',
    ].join('\n'),
    width,
    height,
  };
}
