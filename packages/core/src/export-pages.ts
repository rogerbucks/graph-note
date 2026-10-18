// An image too large for one sharp PNG, split across pages (editor spec §16, big_export, export_png_sharp). A device
// can draw only so many pixels at once, and a PNG is drawn at twice natural size or more. So a large drawing is cut
// into a grid of pages, each a PNG of its own at that size and within those pixels. Together they cover the image once.
// A page is the image's SVG with its own size and view box, so each is drawn from the same drawing, sharp. Pages too
// small to read, or more than anyone would put together, are no answer. Such an image is refused as too large, with the
// SVG suggested, as before.
import { PNG_MIN_SCALE, pngSize } from './export.ts';

/** One page of an image: the part of it, in CSS pixels from its top left, that the page shows. */
export interface PngPage {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The most pages an image is split into; more, and it is refused as too large. */
export const PNG_MOST_PAGES = 36;

/** The least a page measures on each side, in CSS pixels, unless the image itself is smaller that way: less is unreadable. */
export const PNG_PAGE_LEAST = 200;

/** The most device pixels a canvas takes on either side: past it, browsers draw nothing. */
export const PNG_MOST_SIDE = 32_767;

/** The longest side, in whole CSS pixels, a page may have when its other side takes `other` pixels of the PNG. */
const sideFor = (most: number, other: number, scale: number) => Math.floor(Math.floor(most / other) / scale);

/**
 * The pages a PNG of an image `width` by `height` CSS pixels is drawn on, at `scale` (twice natural size at least).
 * Each is within `most` pixels and `PNG_MOST_SIDE` on a side. One page, the whole image, when it fits. Else a grid, in
 * reading order (along each row, then down), as few pages as the pixels allow, evened out. The last of each row and
 * column is the rest. Null when the pages would be too small to read or too many. The image is then too large to draw
 * as a PNG at all.
 */
export function pngPages(width: number, height: number, most: number, scale: number = PNG_MIN_SCALE): PngPage[] | null {
  const s = pngSize(width, height, scale);
  if (s.width * s.height <= most && s.width <= PNG_MOST_SIDE && s.height <= PNG_MOST_SIDE)
    return [{ x: 0, y: 0, width, height }];
  // no side longer than a canvas takes, at this scale, in whole CSS pixels
  const longest = Math.floor(PNG_MOST_SIDE / s.scale);
  // as nearly square as the pixels allow, then each side made as long as the other leaves room for. So a wide, short
  // image is cut into columns of its full height, a tall, narrow one into rows of its full width
  let pageHeight = Math.min(height, Math.floor(Math.sqrt(most) / s.scale), longest);
  let pageWidth = Math.min(width, sideFor(most, Math.ceil(pageHeight * s.scale), s.scale), longest);
  pageHeight = Math.min(height, sideFor(most, Math.ceil(pageWidth * s.scale), s.scale), longest);
  if (pageWidth < 1 || pageHeight < 1) return null;
  const columns = Math.ceil(width / pageWidth),
    rows = Math.ceil(height / pageHeight);
  if (columns * rows > PNG_MOST_PAGES) return null;
  // then evened out, so a row or column is never whole pages and a sliver. Each is no larger than before, so still
  // within the pixels, and the last of each the rest
  pageWidth = Math.min(width, Math.ceil(width / columns));
  pageHeight = Math.min(height, Math.ceil(height / rows));
  const readable = (side: number, whole: number) => side >= Math.min(PNG_PAGE_LEAST, whole);
  const lastWidth = width - (columns - 1) * pageWidth,
    lastHeight = height - (rows - 1) * pageHeight;
  if (!readable(lastWidth, width) || !readable(lastHeight, height)) return null;
  const pages: PngPage[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < columns; c++) {
      const x = c * pageWidth,
        y = r * pageHeight;
      pages.push({ x, y, width: Math.min(pageWidth, width - x), height: Math.min(pageHeight, height - y) });
    }
  return pages;
}

/** A number as an SVG attribute writes it. */
const num = (n: number) => String(Math.round(n * 1000) / 1000);

/** The image's SVG cut to `page`: its root given the page's size and a view box of the page's part, nothing else changed. */
export function pageSvg(svg: string, page: PngPage): string {
  return svg.replace(/^<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/\swidth="[^"]*"/, ` width="${num(page.width)}"`)
      .replace(/\sheight="[^"]*"/, ` height="${num(page.height)}"`)
      .replace(/\sviewBox="[^"]*"/, ` viewBox="${num(page.x)} ${num(page.y)} ${num(page.width)} ${num(page.height)}"`),
  );
}
