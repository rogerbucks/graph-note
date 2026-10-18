// A drawing in the direction it is read (editor spec §42, rtl_drawing_direction). Graphviz lays a drawing out left to
// right. In a right-to-left language, one that runs across is shown running right to left.
// It is mirrored after layout, by its coordinates. So the layout source and every export stay byte for byte the same.
// Every step that reads the drawing's shapes reads the mirrored ones: taps, dragging, the map, a path played.
// Its words are not mirrored. Each label keeps its letters and is anchored at its other end.
import type { Drawn } from './render.ts';
import { fixed } from './theme.ts';
import { currentDirection } from './words.ts';

const NUMBER = '-?\\d+(?:\\.\\d+)?';
const nums = (s: string) => (s.match(new RegExp(NUMBER, 'g')) ?? []).map(Number);
const ANCHOR: Record<string, string> = { start: 'end', end: 'start' };

/**
 * `svg` as Graphviz drew it, mirrored side to side within its own box. Each point's distance from the left edge becomes
 * its distance from the right one. Mirrored twice, it is the drawing it was.
 */
export function mirrored(svg: string): string {
  const [, , width = 0] = nums(/<svg\b[^>]*\bviewBox="([^"]*)"/.exec(svg)?.[1] ?? '');
  const transform = /<g\b[^>]*class="graph"[^>]*\btransform="([^"]*)"/.exec(svg)?.[1] ?? '';
  const [sx = 1] = nums(/scale\(([^)]*)\)/.exec(transform)?.[1] ?? '1');
  const [tx = 0] = nums(/translate\(([^)]*)\)/.exec(transform)?.[1] ?? '0');
  // the graph's own units run from -tx to width / sx - tx: a point x there goes to the same distance from the other end
  const across = width / (sx || 1) - 2 * tx;
  const flip = (x: number, size = 0) => fixed(across - x - size, 2);
  const pairs = (list: string) =>
    list.replace(new RegExp(`(${NUMBER}),(${NUMBER})`, 'g'), (_m, x: string, y: string) => `${flip(Number(x))},${y}`);
  const attr = (tag: string, name: string) => new RegExp(`\\s${name}="(${NUMBER})"`).exec(tag)?.[1];
  return svg.replace(/<(path|polygon|polyline|ellipse|text|image|rect)\b[^>]*>/g, (tag, name: string) => {
    if (name === 'path') return tag.replace(/\sd="([^"]*)"/, (_m, d: string) => ` d="${pairs(d)}"`);
    if (name === 'polygon' || name === 'polyline')
      return tag.replace(/\spoints="([^"]*)"/, (_m, p: string) => ` points="${pairs(p)}"`);
    if (name === 'ellipse') return tag.replace(/\scx="([^"]*)"/, (_m, x: string) => ` cx="${flip(Number(x))}"`);
    const size = name === 'text' ? 0 : Number(attr(tag, 'width') ?? 0);
    const placed = tag.replace(new RegExp(`\\sx="(${NUMBER})"`), (_m, x: string) => ` x="${flip(Number(x), size)}"`);
    return placed.replace(/\stext-anchor="(\w+)"/, (m, a: string) => (ANCHOR[a] ? ` text-anchor="${ANCHOR[a]}"` : m));
  });
}

/**
 * The drawing as it is shown in `direction`, the interface's by default. It is mirrored, and marked so, when it runs
 * across in a right-to-left language. Its direction is kept as laid out. Any other drawing is shown as it is.
 */
export function inReadingDirection(drawn: Drawn, direction: 'ltr' | 'rtl' = currentDirection()): Drawn {
  if (direction !== 'rtl' || drawn.rankdir !== 'LR' || !drawn.svg) return drawn;
  return { ...drawn, svg: mirrored(drawn.svg), mirrored: true };
}

/** A layout's result as shown: a drawing in the direction the interface is read in; a refusal or nothing as it is. */
export const shownAsRead = <T>(laid: Drawn | T): Drawn | T =>
  laid && typeof laid === 'object' && 'svg' in laid ? inReadingDirection(laid) : laid;
