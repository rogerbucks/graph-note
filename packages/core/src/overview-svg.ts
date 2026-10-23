// The overview of a graph too large to draw, as one SVG picture (editor spec §53, scale_massive_card). It is for a host
// that shows a picture and nothing that moves, such as a Claude Code pane. Each group is a box with its name and count,
// and lines join the groups that link, as on an Obsidian card (massive-view.ts). A line at the top says what it is.
//
// Host-free and pure: the marks are overview.ts's, the colours the host's palette. Every word is escaped.
import { isolated } from './bidi.ts';
import type { GraphDrawing } from './note-reading.ts';
import { drawOrder } from './drawing-marks.ts';
import type { LaidMarks } from './graphviz-marks.ts';
import { STYLE } from './layout.ts';
import { overviewOf } from './overview.ts';
import type { Palette } from './palette.ts';
import { groupsOf } from './scale-groups.ts';

/** Text made safe to write inside an SVG element or attribute. */
const escaped = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
/** A number as SVG writes it, to two places. */
const num = (x: number) => String(Math.round(x * 100) / 100);

/**
 * The overview `laid` as SVG in `palette`'s colours, with `caption` above it, a line each: what the picture is and why.
 * A screen reader is given the caption as the picture's title, and each group's name and count as its own.
 */
export function overviewSvg(laid: LaidMarks, palette: Palette, caption: readonly string[]): string {
  const { width, height } = laid.space;
  // as large as lets the longest line fit across, at about six tenths of a size a character
  const longest = Math.max(1, ...caption.map((l) => l.length));
  const size = Math.min(width / 24, width / (0.6 * longest));
  const top = size * (caption.length + 0.5);
  const line = palette.blend('cyan', STYLE.line_mix);
  const parts: string[] = [];
  for (const m of drawOrder(laid.marks)) {
    if (m.kind === 'group')
      parts.push(
        `<rect x="${num(m.x)}" y="${num(m.y)}" width="${num(m.width)}" height="${num(m.height)}" fill="${palette.fill('cyan')}" stroke="${line}"><title>${escaped(m.name ?? m.id)}</title></rect>`,
      );
    else if (m.kind === 'link') {
      const [a, b] = [m.points[0], m.points.at(-1)];
      if (a && b)
        parts.push(
          `<line x1="${num(a[0])}" y1="${num(a[1])}" x2="${num(b[0])}" y2="${num(b[1])}" stroke="${palette.edge}"/>`,
        );
    } else if (m.kind === 'label') {
      const colour = m.style === 'overview.count' ? palette.muted : palette.text;
      parts.push(
        `<text x="${num(m.x)}" y="${num(m.y)}" font-size="${num(m.size)}" text-anchor="middle" dominant-baseline="middle" fill="${colour}" aria-hidden="true">${isolated(escaped(m.text))}</text>`,
      );
    }
  }
  const page = palette.page ? ` style="background:${palette.page}"` : '';
  const sheet = palette.style ? `<style>${palette.style}</style>` : '';
  const all = `x="0" y="${num(-top)}" width="${num(width)}" height="${num(height + top)}"`;
  const lines = caption.map(
    (l, i) =>
      `<text x="0" y="${num(-top + size * (i + 1))}" font-size="${num(size)}" fill="${palette.text}" aria-hidden="true">${escaped(l)}</text>`,
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${num(-top)} ${num(width)} ${num(height + top)}" width="${num(width)}" height="${num(height + top)}" role="img"${page}>` +
    `${sheet}<title>${escaped(caption.join(' '))}</title>` +
    (palette.page ? `<rect ${all} fill="${palette.page}"/>` : '') +
    `${lines.join('')}${parts.join('')}</svg>`
  );
}

/** The overview of `drawing` as SVG in `palette`'s colours, with the caption `said` gives for its number of groups. */
export function overviewPicture(
  drawing: GraphDrawing,
  palette: Palette,
  said: (groups: number) => readonly string[],
): { svg: string; caption: readonly string[] } {
  const grouping = groupsOf(drawing);
  const caption = said(grouping.groups.length);
  return { svg: overviewSvg(overviewOf(grouping), palette, caption), caption };
}
