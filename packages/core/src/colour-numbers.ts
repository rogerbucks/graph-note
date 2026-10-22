// A colour as numbers, for a painter on the graphics chip (editor spec §53, scale_gpu_painters). The graphics chip
// takes a colour as four numbers from 0 to 1. A 2D canvas writes back any colour it is given in one of two plain
// forms. One is six or eight hex digits. The other is the red, green and blue numbers, with how opaque. Host-free and
// pure.

/** A colour as four numbers from 0 to 1: red, green, blue and how opaque. */
export type Rgba = [number, number, number, number];

/** A colour, as a 2D canvas writes it back, as four numbers; clear when it is in neither form. */
export function rgbaOf(written: string): Rgba {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(written);
  if (hex) {
    const n = parseInt(hex[1] ?? '0', 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, hex[2] ? parseInt(hex[2], 16) / 255 : 1];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(written);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255, Number(rgb[4] ?? 1)];
  return [0, 0, 0, 0];
}
