// Where a direct link's words go (editor spec §25, untangle_direct), for direct-links.ts. Roger, 24 Oct 2026: "Try and
// avoid too many label overlaps." So each link's words take the spot along its curve that covers the least. Best is a
// spot over no box, no words placed already and no other line. Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import type { Curve, Placed } from './direct-links.ts';
import type { MarkPoint } from './plugin-diagrams.ts';

/** How far a link's words sit off its middle, as a share of their size, so they do not lie on the line. */
export const WORDS_OFF = 0.55;

/**
 * Where each link's words go, by the id of each of its labels. A link's labels move as one block, its rows kept as
 * Graphviz set them. The block sits at the middle of the curve if it covers no box, no earlier words and no other line.
 * Else it takes the first clear spot along it, either side, a little further off if need be. With no clear spot, it
 * takes the one that covers least.
 */
export function wordSpots(
  marks: readonly DrawMark[],
  boxes: ReadonlyMap<string, Placed>,
  curves: ReadonlyMap<string, Curve>,
): Map<string, MarkPoint> {
  type Rect = { x0: number; y0: number; x1: number; y1: number };
  const taken: Rect[] = [...boxes.values()].map((b) => ({
    x0: b.x - b.hw,
    y0: b.y - b.hh,
    x1: b.x + b.hw,
    y1: b.y + b.hh,
  }));
  const spots = new Map<string, MarkPoint>();
  // points along every line, so words can keep off the lines they do not name
  const lines = [...curves].map(([of, c]) => ({
    of,
    points: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((t) => c.at(t)),
  }));
  const words = new Map<string, (DrawMark & { kind: 'label' })[]>();
  for (const m of marks)
    if (m.kind === 'label' && m.of !== undefined && !boxes.has(m.of) && curves.has(m.of))
      words.set(m.of, [...(words.get(m.of) ?? []), m]);
  for (const [of, rows] of words) {
    const c = curves.get(of) as Curve;
    // the block's middle, and each row's room from it
    const mx = rows.reduce((n, m) => n + m.x, 0) / rows.length,
      my = rows.reduce((n, m) => n + m.y, 0) / rows.length;
    const size = Math.max(...rows.map((m) => m.size));
    const room = rows.map((m) => {
      const half = (m.maxWidth ?? m.text.length * m.size * 0.5) / 2 + 2;
      return { x0: m.x - mx - half, y0: m.y - my - m.size * 0.84, x1: m.x - mx + half, y1: m.y - my + m.size * 0.24 };
    });
    const tall = Math.max(...room.map((r) => r.y1)) - Math.min(...room.map((r) => r.y0));
    const placed = ([x, y]: MarkPoint): Rect[] =>
      room.map((r) => ({ x0: x + r.x0, y0: y + r.y0, x1: x + r.x1, y1: y + r.y1 }));
    // how much the block at `p` covers: the area of boxes and words under it, and a share for each line crossed
    const cover = (p: MarkPoint) => {
      let n = 0;
      for (const r of placed(p)) {
        for (const o of taken)
          n +=
            Math.max(0, Math.min(r.x1, o.x1) - Math.max(r.x0, o.x0)) *
            Math.max(0, Math.min(r.y1, o.y1) - Math.max(r.y0, o.y0));
        for (const l of lines)
          if (l.of !== of)
            for (const [x, y] of l.points) if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) n += size * size * 0.36;
      }
      return n;
    };
    // off the line by half the block's height: one row sits as far off as WORDS_OFF says
    const off = Math.max(size * WORDS_OFF, tall / 2);
    let best: MarkPoint = c.wordsAt(0.5, off),
      least = Infinity;
    search: for (const far of [off, off * 2.2])
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75])
        for (const side of [1, -1]) {
          const p = c.wordsAt(t, side * far);
          const n = cover(p);
          if (n < least) [best, least] = [p, n];
          if (!n) break search;
        }
    for (const m of rows) spots.set(m.id, [best[0] + m.x - mx, best[1] + m.y - my]);
    taken.push(...placed(best));
  }
  return spots;
}
