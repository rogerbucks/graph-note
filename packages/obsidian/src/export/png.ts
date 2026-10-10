// A PNG of an exported SVG (spec §16, export_png_sharp): drawn on a canvas at the size the core gives, never less than
// twice natural size, so its text stays sharp; the SVG is self-contained, with fixed colours, so it draws the same here.
import type { PngSize } from '@graph-note/core';

/** The PNG's bytes: the SVG drawn on a canvas of `size`; rejects, saying why, when the browser cannot draw it. */
export function rasterise(svg: string, size: PngSize): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = activeDocument;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas: HTMLCanvasElement = doc.body.createEl('canvas');
      canvas.remove(); // drawn on off the page, never shown
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('this device cannot draw a PNG'));
      ctx.drawImage(img, 0, 0, size.width, size.height);
      canvas.toBlob((blob) => {
        if (!blob)
          return reject(new Error('the image is too large for this device to draw as a PNG; export it as SVG'));
        void blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('the drawing could not be read as an image'));
    };
    img.src = url;
  });
}
