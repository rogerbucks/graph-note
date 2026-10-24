// The names in the 3D view (editor spec §53, scale_space_labels). Roger, 23 Oct 2026: labels did not show as he
// expected. With the whole graph in view every name was under 6 pixels, so every one was dropped.
//
// Now a name is never dropped for being small. Each is painted flat to the screen, so it always faces the camera, at
// a size people can read. More show as you zoom in, as in a map:
// - the picked thing's name always shows, first and a little larger;
// - then the names nearest the middle of the screen and nearest the camera, where you are looking;
// - a name that would cover one already placed is left out, so names never pile up.
// At most LABELS_MOST are painted. Host-free and pure.
import { FIELD, projectPoint } from './space-view.ts';
import type { SpaceMarks } from './space-view.ts';

/** A label to paint on the screen, at its pixel, and its size in pixels. `picked` marks the picked thing's name. */
export interface ScreenLabel {
  id: string;
  style: string;
  text: string;
  x: number;
  y: number;
  size: number;
  picked?: boolean;
  /** Set on a link's words, painted lighter than a name. */
  link?: boolean;
}

/** The most labels painted at once: past this, words in 3D are a crowd. */
export const LABELS_MOST = 80;
/** The smallest and largest size a name is painted at, in screen pixels: always readable, never shouting. */
export const READABLE_LEAST = 11,
  READABLE_MOST = 22;
/** The size of the picked thing's name, at least. */
const PICKED_LEAST = 14;
/** The longest name painted whole, in letters: a longer one ends in "…". */
const LETTERS_MOST = 32;
/** How wide a letter is, about, as a share of its size: enough to keep names apart without measuring them. */
const LETTER_WIDTH = 0.56;
/** The space kept around each name, in pixels, so neighbours do not touch. */
const GAP = 3;
/** How much later a link's words rank than a name as near. */
const LINK_WORDS_LATER = 1.6;
/** The size of each cell of the grid that finds names that would overlap, in pixels. */
const CELL = 48;

/** A name cut to LETTERS_MOST letters, ending in "…" when cut. */
const shortened = (text: string) => (text.length > LETTERS_MOST ? `${text.slice(0, LETTERS_MOST - 1)}…` : text);

/**
 * The labels to paint, at most `most`, picked one first, then by how near the middle of the screen and the camera
 * each is. Only those on screen and in front are painted, at a readable size, and none covers another.
 */
export function labelsOnScreen(
  space: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  { most = LABELS_MOST, picked }: { most?: number; picked?: string } = {},
): ScreenLabel[] {
  const focal = height / 2 / Math.tan(FIELD / 2),
    across = Math.hypot(width, height) / 2;
  const wanted: (ScreenLabel & { rank: number })[] = [];
  for (const l of space.labels) {
    const at = projectPoint(matrix, l.at, width, height);
    if (!at || at.x < 0 || at.y < 0 || at.x > width || at.y > height) continue;
    const mine = picked !== undefined && l.of === picked;
    const natural = (l.size * focal) / at.far;
    const size = Math.max(mine ? PICKED_LEAST : READABLE_LEAST, Math.min(READABLE_MOST, natural));
    // nearer the middle of the screen and nearer the camera ranks first; the picked name ranks before all
    const off = Math.hypot(at.x - width / 2, at.y - height / 2) / across;
    // a link's words come after the names near them: names say what is there, words only what joins it
    const rank = mine ? -1 : at.far * (1 + 2 * off) * (l.link === undefined ? 1 : LINK_WORDS_LATER);
    const label: ScreenLabel & { rank: number } = {
      id: l.id,
      style: l.style,
      text: shortened(l.text),
      x: at.x,
      y: at.y,
      size,
      rank,
    };
    if (mine) label.picked = true;
    if (l.link !== undefined) label.link = true;
    wanted.push(label);
  }
  wanted.sort((a, b) => a.rank - b.rank);

  // each name placed takes its box; a grid of cells finds the boxes near a new one, so this stays quick for thousands
  const cells = new Map<string, { x0: number; y0: number; x1: number; y1: number }[]>();
  const cellsOf = (x0: number, y0: number, x1: number, y1: number) => {
    const keys: string[] = [];
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) keys.push(`${cx},${cy}`);
    return keys;
  };
  const shown: ScreenLabel[] = [];
  for (const { rank: _rank, ...l } of wanted) {
    if (shown.length >= most) break;
    const half = (l.text.length * l.size * LETTER_WIDTH) / 2 + GAP,
      tall = l.size / 2 + GAP;
    const box = { x0: l.x - half, y0: l.y - tall, x1: l.x + half, y1: l.y + tall };
    const keys = cellsOf(box.x0, box.y0, box.x1, box.y1);
    const covers = keys.some((k) =>
      cells.get(k)?.some((o) => box.x0 < o.x1 && o.x0 < box.x1 && box.y0 < o.y1 && o.y0 < box.y1),
    );
    if (covers) continue;
    for (const k of keys) {
      const list = cells.get(k);
      if (list) list.push(box);
      else cells.set(k, [box]);
    }
    shown.push(l);
  }
  return shown;
}

/** An arrowhead on the screen: its tip, and the two corners of its back, in pixels. */
export interface ScreenArrow {
  id: string;
  style: string;
  tip: { x: number; y: number };
  left: { x: number; y: number };
  right: { x: number; y: number };
  far: number;
}

/** The smallest an arrowhead is painted, in screen pixels, so one far away still shows which way its link points. */
export const ARROW_LEAST = 9;
/** How wide an arrowhead is at its back, as a share of its length. */
const ARROW_WIDE = 0.6;

/**
 * The arrowheads of `space` on the screen, far ones first, so near ones are painted over them. Each is a triangle
 * flat to the screen, pointing along its link as the camera sees it, never smaller than ARROW_LEAST. They are painted
 * over the balls. So an arrowhead whose tip a nearer ball hides is left out: drawn, it would seem to point at that ball.
 */
export function arrowsOnScreen(space: SpaceMarks, matrix: Float32Array, width: number, height: number): ScreenArrow[] {
  const out: ScreenArrow[] = [];
  const balls = space.round ? ballsOnScreen(space, matrix, width, height) : [];
  for (const a of space.arrows) {
    const tip = projectPoint(matrix, a.tip, width, height),
      back = projectPoint(matrix, a.back, width, height);
    if (!tip || !back) continue;
    if (tip.x < -50 || tip.y < -50 || tip.x > width + 50 || tip.y > height + 50) continue;
    if (balls.some((b) => !touches(b, a.tip) && hides(b, tip))) continue;
    let dx = tip.x - back.x,
      dy = tip.y - back.y;
    const seen = Math.hypot(dx, dy);
    // a link pointing straight at the camera has no way across the screen to point: its arrowhead is not painted
    if (seen < 0.5) continue;
    const long = Math.max(ARROW_LEAST, seen);
    dx /= seen;
    dy /= seen;
    const bx = tip.x - dx * long,
      by = tip.y - dy * long,
      half = (long * ARROW_WIDE) / 2;
    out.push({
      id: a.id,
      style: a.style,
      tip: { x: tip.x, y: tip.y },
      left: { x: bx - dy * half, y: by + dx * half },
      right: { x: bx + dy * half, y: by - dx * half },
      far: tip.far,
    });
  }
  return out.sort((p, q) => q.far - p.far);
}

/** A ball on the screen: its middle, its radius in pixels, its middle's distance from the eye, and its radius. */
interface ScreenBall {
  at: readonly [number, number, number];
  x: number;
  y: number;
  seen: number;
  far: number;
  r: number;
}

/** The balls of `space` as circles on the screen. */
function ballsOnScreen(space: SpaceMarks, matrix: Float32Array, width: number, height: number): ScreenBall[] {
  const out: ScreenBall[] = [];
  for (const b of space.blocks) {
    const r = b.width / 2;
    const c = projectPoint(matrix, [b.x + r, b.y + r, b.floor + r], width, height);
    if (c)
      out.push({
        at: [b.x + r, b.y + r, b.floor + r],
        x: c.x,
        y: c.y,
        seen: (r * height) / 2 / Math.tan(FIELD / 2) / c.far,
        far: c.far,
        r,
      });
  }
  return out;
}

/** Whether `tip` is on ball `b`'s surface: the ball its arrowhead points at, which never hides it. */
function touches(b: ScreenBall, tip: readonly number[]): boolean {
  const d = Math.hypot((tip[0] ?? 0) - b.at[0], (tip[1] ?? 0) - b.at[1], (tip[2] ?? 0) - b.at[2]);
  return Math.abs(d - b.r) <= b.r * 0.05 + 1;
}

/**
 * Whether ball `b` hides point `p`: `p` is inside its circle on the screen, and behind its front there.
 */
function hides(b: ScreenBall, p: { x: number; y: number; far: number }): boolean {
  const d = Math.hypot(p.x - b.x, p.y - b.y) / b.seen;
  if (d >= 1) return false;
  const front = b.far - b.r * Math.sqrt(1 - d * d);
  return p.far > front + b.r * 0.1;
}
