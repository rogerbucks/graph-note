// Notes drawn as callouts on the drawing (editor spec §24, note_callouts): when the setting is on, each note is drawn in a
// small box beside its thing or link, joined to it by a dashed line, after the layout has placed everything. The layout
// source never reads a note, so it stays byte-identical with the Python library's and the boxes sit where they would
// without callouts; a callout is only added over the finished SVG, within its viewBox, and its words are text, never HTML.
// Its look is the style sheet's alone (`graph-note-callout-*`); the full note shows in the thing's details.
import { hitAreas } from '@graph-note/core';
import type { Drawn, GraphDrawing, Shape } from '@graph-note/core';

const SVG = 'http://www.w3.org/2000/svg';
/** The size of a callout's words, the width of a line of them in characters, and how many lines it may hold. */
const FONT = 11,
  LINE_CHARS = 24,
  MAX_LINES = 3,
  PAD = 5,
  GAP = 16;
/** A letter's width, about, as a fraction of the font size. */
const LETTER = 0.58;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A summary's words as plain text: emphasis and code marks off, a link as its words. */
export function plainWords(markdown: string): string {
  return markdown
    .replace(/!?\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`~]+/g, '')
    .replace(/(^|\s)_+|_+(?=\s|$|[.,;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words broken into lines of at most `LINE_CHARS` characters, the last cut short with an ellipsis past `MAX_LINES`. */
export function wrapped(words: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of words.split(' ')) {
    if (line && line.length + 1 + w.length > LINE_CHARS) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  if (lines.length <= MAX_LINES) return lines;
  const kept = lines.slice(0, MAX_LINES);
  kept[MAX_LINES - 1] = `${(kept[MAX_LINES - 1] ?? '').slice(0, LINE_CHARS - 1).trimEnd()}…`;
  return kept;
}

/** Where a shape is: the box round every point of it. */
function extent(s: Shape): { left: number; right: number; top: number; bottom: number } | null {
  const points = [...s.polygons, ...s.lines].flat();
  if (!points.length) return null;
  const xs = points.map(([x]) => x),
    ys = points.map(([, y]) => y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

const clamp = (n: number, low: number, high: number): number => Math.max(low, Math.min(n, Math.max(low, high)));
const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** One element of the drawing’s namespace, its attributes set. */
export function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = activeDocument.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * The notes of the drawing `d`, drawn as callouts in `svg` (the drawing laid out as `drawn`): beside its thing's box or
 * its link's line, kept within the drawing, one placed clear of another, each joined by a dashed line. Nothing is added
 * for a note whose thing or link is not drawn (folded away by the View menu), and the viewBox never changes.
 */
export function markCallouts(svg: SVGSVGElement, drawn: Drawn, d: GraphDrawing): void {
  const noted: { id: string; of: string; summary: string }[] = [
    ...d.boxes.flatMap((b, i) =>
      b.note ? [{ id: `node${i + 1}`, of: `thing:${b.key}`, summary: b.note.summary }] : [],
    ),
    ...d.links.flatMap((l, i) => (l.note ? [{ id: `edge${i + 1}`, of: `link:${i}`, summary: l.note.summary }] : [])),
  ];
  if (!noted.length) return;
  const { shapes, viewBox: vb } = hitAreas(drawn.svg);
  if (!vb.width || !vb.height) return;
  const layer = make('g', { class: 'graph-note-callouts' }),
    placed: Rect[] = [];
  for (const n of noted) {
    const shape = shapes.find((s) => s.id === n.id),
      at = shape && extent(shape),
      words = plainWords(n.summary);
    if (!at || !words) continue;
    const lines = wrapped(words),
      width = Math.max(...lines.map((l) => l.length)) * FONT * LETTER + 2 * PAD,
      height = lines.length * FONT * 1.3 + 2 * PAD,
      middle = (at.top + at.bottom) / 2;
    // beside the box, to its right when there is room there, else to its left; moved down clear of the callouts placed
    let x = at.right + GAP;
    if (x + width > vb.x + vb.width) x = at.left - GAP - width;
    const rect: Rect = { x: clamp(x, vb.x, vb.x + vb.width - width), y: middle - height / 2, width, height };
    for (let tries = 0; tries < 30; tries++) {
      rect.y = clamp(rect.y, vb.y, vb.y + vb.height - height);
      const hit = placed.find((p) => overlap(p, rect));
      if (!hit) break;
      // below the one in the way when there is room, else above it
      const below = hit.y + hit.height + 2;
      rect.y = below + height <= vb.y + vb.height ? below : hit.y - height - 2;
    }
    rect.y = clamp(rect.y, vb.y, vb.y + vb.height - height);
    placed.push(rect);
    const right = rect.x >= at.right,
      from = { x: right ? at.right : at.left, y: middle },
      to = { x: right ? rect.x : rect.x + width, y: rect.y + height / 2 };
    const g = make('g', {
      class: 'graph-note-callout',
      'data-for': n.of,
      role: 'note',
      'aria-label': `Note: ${words}`,
    });
    g.appendChild(make('line', { class: 'graph-note-callout-line', x1: from.x, y1: from.y, x2: to.x, y2: to.y }));
    g.appendChild(make('rect', { class: 'graph-note-callout-box', ...rect, rx: 3 }));
    const text = make('text', { class: 'graph-note-callout-text', 'font-size': FONT, x: rect.x + PAD });
    lines.forEach((line, i) => {
      const span = make('tspan', { x: rect.x + PAD, y: rect.y + PAD + FONT * (1.15 + 1.3 * i) });
      span.textContent = line;
      text.appendChild(span);
    });
    g.appendChild(text);
    layer.appendChild(g);
  }
  if (placed.length) svg.appendChild(layer);
}
