// Moving a box by dragging it (editor spec §6, nudge_preview, drag_moves_box): where a box let go at a point would land,
// read from the boxes as drawn, and the nudge that place writes. Graphviz lays things out in ranks, across the drawing
// (LR) or down it (TB): dropped above or below a box, across the ranks, the box goes beside it, on its rank; dropped to
// one side, along the ranks, it goes before or after it. Away from every box, or where the same nudge is already written,
// it lands nowhere. Host-free: the host reads the boxes from the drawing, in its own units, and draws the preview.
import type { NudgeWrite } from './style-edit.ts';
import { word } from './words.ts';

/** A box as drawn: its thing's key and its edges, in the drawing's own units. */
export interface PlacedBox {
  key: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a dropped box goes beside the one it is dropped by: on its rank, or a rank before or after it. */
export type Side = 'beside' | 'before' | 'after';

/** Where a dragged box would land: beside, before or after another box, and the nudge that writes it. */
export interface Landing {
  side: Side;
  other: string;
  nudge: NudgeWrite;
}

/** A nudge already written, as far as a landing needs it: its word and the two things it names. */
export interface WrittenNudge {
  word: string;
  thing?: string;
  other?: string;
}

/** How far from a box, as a share of its longer side, a drop still lands by it. */
const REACH = 1;

/** How far a point is from a box: none inside it. */
const distance = (p: { x: number; y: number }, b: PlacedBox): number =>
  Math.hypot(Math.max(b.left - p.x, 0, p.x - b.right), Math.max(b.top - p.y, 0, p.y - b.bottom));

/** Whether the same nudge is written already: beside either way round, before in its own order. */
const writtenAlready = (n: NudgeWrite, written: readonly WrittenNudge[]): boolean =>
  written.some(
    (w) =>
      w.word === n.word &&
      ((w.thing === n.thing && w.other === n.other) ||
        (n.word === 'beside' && w.thing === n.other && w.other === n.thing)),
  );

/**
 * Where box `dragged`, let go at `at`, would land among the `boxes` drawn in direction `rankdir` (LR or TB): by the
 * nearest other box within its reach — beside it when dropped across the ranks, before or after it along them, whichever
 * way the point lies further from its middle for the box's size. Null away from every box, or where the nudge it would
 * write is `written` already.
 */
export function landingFor(
  dragged: string,
  at: { x: number; y: number },
  boxes: readonly PlacedBox[],
  rankdir: string,
  written: readonly WrittenNudge[] = [],
): Landing | null {
  const near = boxes
    .filter((b) => b.key !== dragged)
    .map((b) => ({ b, d: distance(at, b) }))
    .filter(({ b, d }) => d <= REACH * Math.max(b.right - b.left, b.bottom - b.top))
    .sort((p, q) => p.d - q.d)[0]?.b;
  if (!near) return null;
  const width = near.right - near.left || 1,
    height = near.bottom - near.top || 1;
  const dx = (at.x - (near.left + near.right) / 2) / width,
    dy = (at.y - (near.top + near.bottom) / 2) / height;
  const [along, across] = rankdir === 'TB' ? [dy, dx] : [dx, dy];
  const side: Side = Math.abs(along) <= Math.abs(across) ? 'beside' : along < 0 ? 'before' : 'after';
  const nudge: NudgeWrite =
    side === 'beside'
      ? { word: 'beside', thing: dragged, other: near.key }
      : side === 'before'
        ? { word: 'before', thing: dragged, other: near.key }
        : { word: 'before', thing: near.key, other: dragged };
  return writtenAlready(nudge, written) ? null : { side, other: near.key, nudge };
}

/** A landing in words, before the box is let go: "Put Ann beside Bob", each thing by the text drawn on its box. */
export function landingSaid(l: Landing, dragged: string, textOf: (key: string) => string): string {
  return word(`move.${l.side}`, { thing: textOf(dragged), other: textOf(l.other) });
}
