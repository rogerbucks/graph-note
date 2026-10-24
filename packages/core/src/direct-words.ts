// Where a direct link's words go (editor spec §25, untangle_direct), for direct-links.ts. Roger, 24 Oct 2026: "Try and
// avoid too many label overlaps." So each link's words take the spot along its curve that covers the least. Best is a
// spot over no box, no words placed already and no other line. Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import type { Curve, Placed } from './direct-links.ts';
import type { MarkPoint } from './plugin-diagrams.ts';

/** How far a link's words sit off its middle, as a share of their size, so they do not lie on the line. */
export const WORDS_OFF = 0.55;

/**
 * Where each link's words go. They sit at the middle of the curve if they cover no box, no earlier words and no other
 * line. Else they take the first clear spot along it, either side, a little further off if need be. With no clear spot,
 * they take the one that covers least.
 */
export function wordSpots(
  marks: readonly DrawMark[],
  boxes: ReadonlyMap<string, Placed>,
  curves: ReadonlyMap<string, Curve>,
): Map<string, MarkPoint> {
  const taken = [...boxes.values()].map((b) => ({ x0: b.x - b.hw, y0: b.y - b.hh, x1: b.x + b.hw, y1: b.y + b.hh }));
  const spots = new Map<string, MarkPoint>();
  // points along every line, so words can keep off the lines they do not name
  const lines = [...curves].map(([of, c]) => ({
    of,
    points: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((t) => c.at(t)),
  }));
  for (const m of marks) {
    if (m.kind !== 'label' || m.of === undefined || boxes.has(m.of)) continue;
    const c = curves.get(m.of);
    if (!c) continue;
    const half = (m.maxWidth ?? m.text.length * m.size * 0.5) / 2 + 2,
      tall = m.size * 0.6;
    const boxAt = ([x, y]: MarkPoint) => ({ x0: x - half, y0: y - tall * 1.4, x1: x + half, y1: y + tall * 0.4 });
    // how much words at `p` cover: the area of boxes and words under them, and a share for each line crossed
    const cover = (p: MarkPoint) => {
      const r = boxAt(p);
      let n = 0;
      for (const o of taken)
        n +=
          Math.max(0, Math.min(r.x1, o.x1) - Math.max(r.x0, o.x0)) *
          Math.max(0, Math.min(r.y1, o.y1) - Math.max(r.y0, o.y0));
      for (const l of lines)
        if (l.of !== m.of)
          for (const [x, y] of l.points) if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) n += tall * tall;
      return n;
    };
    let best: MarkPoint = c.wordsAt(0.5, m.size * WORDS_OFF),
      least = Infinity;
    search: for (const off of [WORDS_OFF, WORDS_OFF * 2.2])
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75])
        for (const side of [1, -1]) {
          const p = c.wordsAt(t, side * m.size * off);
          const n = cover(p);
          if (n < least) [best, least] = [p, n];
          if (!n) break search;
        }
    const at = best;
    spots.set(m.id, at);
    taken.push(boxAt(at));
  }
  return spots;
}
