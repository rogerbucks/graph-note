// A PNG of an exported SVG, drawn by the page (spec §16, export_png_sharp; §26, cc_export_same): on a canvas at the size the
// core gives, never less than twice natural size. The SVG is self-contained, in fixed colours, and given that size itself
// before it is read. It is read as an image from a blob, which the page's policy allows, and nothing is fetched.
import type { PngSize } from '../../core/src/export.ts';
import { word } from '../../core/src/words.ts';

/** The most pixels a canvas holds on the smallest device (iOS's limit): a larger PNG is split across pages or refused. */
export const PNG_PIXEL_LIMIT = 16_777_216;

/** Why a PNG cannot be drawn here: the image is over what this browser's canvas holds. */
const tooLarge = () => word('page.png-too-large');

/** The SVG with its own width and height set to `size`, so the image is read at the size it is drawn. */
const sized = (svg: string, size: PngSize) =>
  svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/\swidth="[^"]*"/, '')
      .replace(/\sheight="[^"]*"/, '')
      .replace('<svg', `<svg width="${size.width}" height="${size.height}"`),
  );

/** The PNG's bytes: the SVG drawn on a canvas of `size`; rejects, saying why, whatever stops it, and never hangs. */
export function rasterise(win: Window & typeof globalThis, svg: string, size: PngSize): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const url = win.URL.createObjectURL(new win.Blob([sized(svg, size)], { type: 'image/svg+xml' }));
    const img = new win.Image();
    img.onload = () => {
      win.URL.revokeObjectURL(url);
      try {
        const canvas = win.document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error(tooLarge());
        ctx.drawImage(img, 0, 0, size.width, size.height);
        canvas.toBlob((blob) => {
          // let go at once, so page after page of a large image holds one canvas at a time
          canvas.width = canvas.height = 0;
          if (!blob) return reject(new Error(tooLarge()));
          blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
        }, 'image/png');
      } catch (e) {
        reject(e instanceof Error ? e : new Error(word('exporting.png-failed')));
      }
    };
    img.onerror = () => {
      win.URL.revokeObjectURL(url);
      reject(new Error(word('exporting.png-unreadable')));
    };
    img.src = url;
  });
}
