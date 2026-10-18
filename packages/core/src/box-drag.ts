// Moving a box by dragging it (editor spec §6, nudge_preview, drag_moves_box): where a box let go at a point would land,
// read from the boxes as drawn, and the nudge that place writes. Graphviz lays things out in ranks, across the drawing
// (LR) or down it (TB): dropped above or below a box, across the ranks, the box goes beside it, on its rank; dropped to
// one side, along the ranks, it goes before or after it. Away from every box, or where the same nudge is already written,
// it lands nowhere. In a radial drawing it goes before or after a thing around the centre. Host-free: the host reads
// the boxes from the drawing, in its own units, and draws the preview.
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

/** A box's middle. */
const middle = (b: PlacedBox) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });

/** How far round from `from` to `to` a point turns about `c`, anticlockwise as drawn (y runs down the page): 0 to 2π. */
const turn = (c: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }): number =>
  (Math.atan2(c.y - to.y, to.x - c.x) - Math.atan2(c.y - from.y, from.x - c.x) + 4 * Math.PI) % (2 * Math.PI);

/**
 * Where box `dragged`, let go at `at`, would land among the `boxes` drawn in direction `rankdir` (LR or TB): by the
 * nearest other box within its reach — beside it when dropped across the ranks, before or after it along them, whichever
 * way the point lies further from its middle for the box's size.
 *
 * A radial drawing has the box of `centre` in the middle (radial_spoke_order). The things go round it in the order
 * written, anticlockwise as drawn. Dropped on the clockwise side of one, the box goes just before it. Dropped on the
 * other side, it goes just after it. It never goes beside a thing, and never by the centre.
 *
 * Null away from every box, or where the nudge it would write is `written` already.
 */
export function landingFor(
  dragged: string,
  at: { x: number; y: number },
  boxes: readonly PlacedBox[],
  rankdir: string,
  written: readonly WrittenNudge[] = [],
  centre?: string,
): Landing | null {
  const hub = centre === undefined ? undefined : boxes.find((b) => b.key === centre);
  const near = boxes
    .filter((b) => b.key !== dragged && b !== hub)
    .map((b) => ({ b, d: distance(at, b) }))
    .filter(({ b, d }) => d <= REACH * Math.max(b.right - b.left, b.bottom - b.top))
    .sort((p, q) => p.d - q.d)[0]?.b;
  if (!near || (hub && distance(at, hub) === 0)) return null;
  if (hub) {
    const side: Side = turn(middle(hub), middle(near), at) < Math.PI ? 'after' : 'before';
    return placed(side, dragged, near.key, written);
  }
  const width = near.right - near.left || 1,
    height = near.bottom - near.top || 1;
  const dx = (at.x - (near.left + near.right) / 2) / width,
    dy = (at.y - (near.top + near.bottom) / 2) / height;
  const [along, across] = rankdir === 'TB' ? [dy, dx] : [dx, dy];
  const side: Side = Math.abs(along) <= Math.abs(across) ? 'beside' : along < 0 ? 'before' : 'after';
  return placed(side, dragged, near.key, written);
}

/**
 * Every place box `dragged` can be moved to among the `boxes` drawn, in the order the keyboard steps through them
 * (move_box_keyboard). These are beside, before and after each other box, the nearest first. In a radial drawing about
 * the box of `centre`, they are before and after each thing around it. A place whose nudge is `written` is left out.
 */
export function placesFor(
  dragged: string,
  boxes: readonly PlacedBox[],
  written: readonly WrittenNudge[] = [],
  centre?: string,
): Landing[] {
  const from = boxes.find((b) => b.key === dragged),
    sides: Side[] = centre === undefined ? ['beside', 'before', 'after'] : ['before', 'after'];
  const away = (b: PlacedBox) => (from ? distance(middle(from), b) : 0);
  return boxes
    .filter((b) => b.key !== dragged && b.key !== centre)
    .sort((p, q) => away(p) - away(q))
    .flatMap((b) => sides.map((side) => placed(side, dragged, b.key, written)))
    .filter((l): l is Landing => l !== null);
}

/** Box `dragged` placed on `side` of box `other`, and the nudge that writes it; null when it is `written` already. */
function placed(side: Side, dragged: string, other: string, written: readonly WrittenNudge[]): Landing | null {
  const nudge: NudgeWrite =
    side === 'beside'
      ? { word: 'beside', thing: dragged, other }
      : side === 'before'
        ? { word: 'before', thing: dragged, other }
        : { word: 'before', thing: other, other: dragged };
  return writtenAlready(nudge, written) ? null : { side, other, nudge };
}

/** A landing in words, before the box is let go: "Put Ann beside Bob", each thing by the text drawn on its box. */
export function landingSaid(l: Landing, dragged: string, textOf: (key: string) => string): string {
  return word(`move.${l.side}`, { thing: textOf(dragged), other: textOf(l.other) });
}
