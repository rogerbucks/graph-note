// A colour as numbers, for a painter on the graphics chip (editor spec §53, scale_gpu_painters). The graphics chip
// takes a colour as four numbers from 0 to 1. A 2D canvas writes back any colour it is given in one of three plain
// forms:
// - six or eight hex digits;
// - the red, green and blue numbers from 0 to 255, with how opaque;
// - `color(srgb …)`, the same numbers from 0 to 1. Chrome writes a colour a theme mixes (`color-mix`) this way, as
//   Obsidian's link colours are. Without it, those links were painted clear (Roger, 23 Oct 2026).
// Host-free and pure.

/** A colour as four numbers from 0 to 1: red, green, blue and how opaque. */
export type Rgba = [number, number, number, number];

/** A number kept from 0 to 1; one that is not a number is 0. */
const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** A colour, as a 2D canvas writes it back, as four numbers; clear when it is in neither form. */
export function rgbaOf(written: string): Rgba {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(written);
  if (hex) {
    const n = parseInt(hex[1] ?? '0', 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, hex[2] ? parseInt(hex[2], 16) / 255 : 1];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(written);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255, Number(rgb[4] ?? 1)];
  const srgb = /^color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+))?\s*\)$/.exec(written);
  if (srgb) return [Number(srgb[1]), Number(srgb[2]), Number(srgb[3]), Number(srgb[4] ?? 1)].map(clamp) as Rgba;
  return [0, 0, 0, 0];
}
