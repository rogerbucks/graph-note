// An animated image's first frame (editor spec §18, §11): drawn by the platform's own image decoding, with no library
// (no new dependency), onto a canvas, as a PNG. An image drawn onto a canvas gives its default image, the first frame of
// an animation, as the HTML standard says; it is drawn from the file's own bytes, in a blob address of this page, so
// the canvas may be read. Never rejects: where it cannot be drawn, as in a host with no canvas, it gives null, and the
// image is then held still with nothing drawn, saying why.

/** The most pixels a first frame is drawn at; a larger one is drawn smaller, keeping its shape. */
const MOST_PIXELS = 4_000_000;

/**
 * The most pixels an image's frame may have for its first frame to be drawn at all (review of #443): a larger one would
 * hold the page and the device's memory while it is drawn, so it is never put on a canvas.
 */
export const STILL_PIXELS = 50_000_000;

/** The PNG of the first frame of the image `bytes` of type `mime`, or null when it cannot be drawn here. */
export function stillFrame(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }));
    const img = new Image();
    const done = (png: Uint8Array | null) => {
      URL.revokeObjectURL(url);
      resolve(png);
    };
    img.onload = () => {
      try {
        const w = img.naturalWidth || 1,
          h = img.naturalHeight || 1,
          scale = Math.min(1, Math.sqrt(MOST_PIXELS / (w * h)));
        if (w * h > STILL_PIXELS) return done(null);
        const canvas: HTMLCanvasElement = activeDocument.body.createEl('canvas');
        canvas.remove(); // drawn on off the page, never shown
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return done(null);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          canvas.width = canvas.height = 0;
          if (!blob) return done(null);
          blob.arrayBuffer().then(
            (b) => done(new Uint8Array(b)),
            () => done(null),
          );
        }, 'image/png');
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}
