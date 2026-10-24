// Things as cards in the 3D view (editor spec §53, space_cards). Roger, 24 Oct 2026: "the whole name/title ... should be
// shown". He asked for the text in the shape: a "2.5D" view of boxes that always face the user, while the view turns.
// He chose cards as the way the view opens, with balls a press away.
//
// Each thing is laid out in space as a ball is (space-spread.ts), but painted as a card flat to the screen. It is the
// size of the thing's box in 2D, smaller as it is further off, with the thing's whole name inside, wrapped to fit. Far
// ones are painted first, so near ones cover them. A card too far off for its words to be read is a small plain card,
// unless it is picked. Each arrowhead is painted at the edge of the card it points to. Host-free and pure.
import { FIELD, projectPoint } from './space-view.ts';
import type { Block, SpaceMarks, Vec3 } from './space-view.ts';
import {
  ARROW_LEAST,
  READABLE_LEAST,
  READABLE_MOST,
  arrowsOnScreen,
  labelsOnScreen,
  pickedRing,
} from './space-labels.ts';
import type { ScreenArrow, ScreenLabel } from './space-labels.ts';

/** A card on the screen: its middle, its size, its words in rows and their size, all in pixels. */
export interface ScreenCard {
  block: Block;
  x: number;
  y: number;
  width: number;
  height: number;
  far: number;
  rows: string[];
  size: number;
  picked?: boolean;
}

/** The size of a card's words, in pixels of the space: as a 2D box's. */
const WORDS_SIZE = 14;
/** The smallest a card's words would be, unclamped, for them to be painted: further off, the card is plain. */
const WORDS_LEAST = 6;
/** The room inside a card round its words, as a share of their size. */
const PAD = 0.5;
/** How wide a letter is, about, as a share of its size. */
const LETTER_WIDTH = 0.52;
/** How much wider than its box a card may grow before its words wrap, and the fewest letters in a row. */
const WIDER = 1.5,
  ROW_LEAST = 14;
/** How tall a row of words is, as a share of their size. */
const ROW = 1.25;
/** How long an arrowhead is on the screen, as a share of a card's words, kept between ARROW_LEAST and a most. */
const ARROW_SHARE = 0.9,
  ARROW_MOST = 18;
/** How wide an arrowhead is at its back, as a share of its length. */
const ARROW_WIDE = 0.6;

/** `text` cut into rows of at most `letters` letters, at its spaces; a word longer than a row is a row of its own. */
export function rowsOf(text: string, letters: number): string[] {
  const rows: string[] = [];
  let row = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (row && row.length + 1 + word.length > letters) {
      rows.push(row);
      row = word;
    } else row = row ? `${row} ${word}` : word;
  }
  if (row) rows.push(row);
  return rows;
}

/** The middle of a block, in the space. */
const middle = (b: Block): Vec3 => [b.x + b.width / 2, b.y + b.depth / 2, b.floor + b.tall / 2];

/** The cards of `space`, far ones first, with `picked` marked. Each thing's words are its name, whole. */
export function cardsOnScreen(
  space: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  picked?: string,
): ScreenCard[] {
  const focal = height / 2 / Math.tan(FIELD / 2);
  const names = new Map<string, string>();
  for (const l of space.labels) if (l.of !== undefined && l.link === undefined) names.set(l.of, l.text);
  const out: ScreenCard[] = [];
  for (const b of space.blocks) {
    const c = projectPoint(matrix, middle(b), width, height);
    if (!c) continue;
    const scale = focal / c.far,
      mine = picked !== undefined && b.of === picked;
    const natural = WORDS_SIZE * scale;
    const text = (b.of === undefined ? undefined : names.get(b.of)) ?? b.name ?? '';
    const read = text !== '' && (natural >= WORDS_LEAST || mine);
    const size = Math.max(READABLE_LEAST, Math.min(READABLE_MOST, natural));
    let w = (b.card?.width ?? b.width) * scale,
      h = (b.card?.height ?? b.tall) * scale;
    let rows: string[] = [];
    if (read) {
      const room = size * PAD * 2;
      rows = rowsOf(text, Math.max(ROW_LEAST, Math.floor((w * WIDER - room) / (size * LETTER_WIDTH))));
      w = Math.max(w, Math.max(...rows.map((r) => r.length)) * size * LETTER_WIDTH + room);
      h = Math.max(h, rows.length * size * ROW + room);
    }
    const r = Math.hypot(w, h) / 2;
    if (c.x + r < 0 || c.y + r < 0 || c.x - r > width || c.y - r > height) continue;
    const card: ScreenCard = { block: b, x: c.x, y: c.y, width: w, height: h, far: c.far, rows, size };
    if (mine) card.picked = true;
    out.push(card);
  }
  return out.sort((p, q) => q.far - p.far);
}

/** The nearest card under the point (`x`, `y`) of the screen, if any. */
export function cardAt(cards: readonly ScreenCard[], x: number, y: number): ScreenCard | undefined {
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i] as ScreenCard;
    if (Math.abs(x - c.x) <= c.width / 2 && Math.abs(y - c.y) <= c.height / 2) return c;
  }
  return undefined;
}

/**
 * The arrowheads of `space`'s links on the screen. Each has its tip at the edge of the card it points to, and points
 * from where its link comes in. A link with both ends on one card, as seen, has no way to point, so it has none.
 */
export function cardArrows(
  space: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  cards: readonly ScreenCard[],
): ScreenArrow[] {
  const byKey = new Map(cards.flatMap((c) => (c.block.of === undefined ? [] : [[c.block.of, c] as const])));
  const out: ScreenArrow[] = [];
  for (const l of space.lines) {
    const to = l.to === undefined ? undefined : byKey.get(l.to);
    if (!to) continue;
    // the last point of the line outside the card: where the link comes in from
    let from: { x: number; y: number } | null = null;
    for (let i = l.points.length - 1; i >= 0 && !from; i--) {
      const p = projectPoint(matrix, l.points[i] as Vec3, width, height);
      if (p && (Math.abs(p.x - to.x) > to.width / 2 || Math.abs(p.y - to.y) > to.height / 2)) from = p;
    }
    const back = from ?? (l.from === undefined ? undefined : byKey.get(l.from));
    if (!back) continue;
    const vx = back.x - to.x,
      vy = back.y - to.y;
    const s = Math.min(to.width / 2 / Math.max(Math.abs(vx), 1e-9), to.height / 2 / Math.max(Math.abs(vy), 1e-9));
    if (s >= 1) continue;
    const tip = { x: to.x + vx * s, y: to.y + vy * s },
      seen = Math.hypot(vx, vy);
    const dx = -vx / seen,
      dy = -vy / seen;
    const long = Math.max(ARROW_LEAST, Math.min(ARROW_MOST, to.size * ARROW_SHARE)),
      half = (long * ARROW_WIDE) / 2;
    const bx = tip.x - dx * long,
      by = tip.y - dy * long;
    out.push({
      id: `${l.id}\narrow`,
      style: l.style,
      tip,
      left: { x: bx - dy * half, y: by + dx * half },
      right: { x: bx + dy * half, y: by - dx * half },
      far: to.far,
    });
  }
  return out;
}

/** What one frame of the 3D view paints: the shapes for the graphics chip, and over them cards, arrowheads and words. */
export interface SpaceFrame {
  shapes: SpaceMarks;
  cards: ScreenCard[];
  arrows: ScreenArrow[];
  labels: ScreenLabel[];
  ring: { x: number; y: number; r: number } | null;
}

/**
 * One frame of `space`, as the camera's `matrix` sees it, with `picked` and `pickedLink` marked. With cards, the graphics
 * chip paints only the lines, and the cards hold the things' names. Else it paints the blocks or balls, and the names
 * float beside them, the picked one ringed.
 */
export function frameOf(
  space: SpaceMarks,
  matrix: Float32Array,
  width: number,
  height: number,
  picked: Block | null,
  pickedLink?: string,
): SpaceFrame {
  const chosen = {
    ...(picked?.of === undefined ? {} : { picked: picked.of }),
    ...(pickedLink === undefined ? {} : { pickedLink }),
  };
  if (!space.cards) {
    const ring = picked && pickedRing(space, picked, matrix, width, height);
    return {
      shapes: space,
      cards: [],
      arrows: arrowsOnScreen(space, matrix, width, height),
      labels: labelsOnScreen(space, matrix, width, height, chosen),
      ring,
    };
  }
  const cards = cardsOnScreen(space, matrix, width, height, picked?.of);
  const words = { ...space, labels: space.labels.filter((l) => l.link !== undefined) };
  return {
    shapes: { ...space, blocks: [], arrows: [] },
    cards,
    arrows: cardArrows(space, matrix, width, height, cards),
    labels: labelsOnScreen(words, matrix, width, height, chosen),
    ring: null,
  };
}
