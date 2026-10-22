// The ego view (editor spec §36, view_types_offered). One thing sits in the middle. The things one link away sit on a
// ring round it, and the things two links away on a ring outside that. The rest are not drawn. An ego view shows what
// one thing touches, which a whole network hides. It is drawn as marks (drawing-marks.ts), so every painter draws it
// the same way.
//
// A key never holds a new line, so the ids this view joins with one never meet a thing's key.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import type { GraphShape } from '../types-shape.ts';

/** The most links away a thing may be and still be drawn. */
export const EGO_DEPTH = 2;
/** The share of the space's half kept outside the outer ring for names. */
const NAMES_SHARE = 0.2;
/** Past this many things on a ring, its things are not named. */
const NAMED_MOST = 40;

/** The thing with the most links, the first written on a tie: the middle when none is chosen. */
export function busiest(shape: GraphShape): string | null {
  const degree = new Map(shape.things.map((t) => [t.key, 0]));
  for (const l of shape.links)
    for (const k of [l.from, l.to]) if (degree.has(k)) degree.set(k, (degree.get(k) ?? 0) + 1);
  let best: string | null = null,
    most = -1;
  for (const t of shape.things) {
    const d = degree.get(t.key) ?? 0;
    if (d > most) [best, most] = [t.key, d];
  }
  return best;
}

/** Each thing within `EGO_DEPTH` links of `middle`, either way, and how many links away it is. */
export function ringsOf(shape: GraphShape, middle: string): Map<string, number> {
  const known = new Set(shape.things.map((t) => t.key));
  const near = new Map<string, string[]>();
  for (const l of shape.links) {
    if (!known.has(l.from) || !known.has(l.to) || l.from === l.to) continue;
    (near.get(l.from) ?? near.set(l.from, []).get(l.from))?.push(l.to);
    (near.get(l.to) ?? near.set(l.to, []).get(l.to))?.push(l.from);
  }
  const away = new Map([[middle, 0]]);
  let ring = [middle];
  for (let d = 1; d <= EGO_DEPTH && ring.length; d++) {
    const next: string[] = [];
    for (const k of ring)
      for (const n of near.get(k) ?? [])
        if (!away.has(n)) {
          away.set(n, d);
          next.push(n);
        }
    ring = next;
  }
  return away;
}

/**
 * The marks of `shape` drawn as an ego view in `space`, round `middle`. With no `middle`, or one not in the graph, the
 * busiest thing is the middle.
 */
export function egoMarks({ shape, space }: DiagramGiven, middle?: string): DrawMark[] {
  const keys = new Set(shape.things.map((t) => t.key));
  const focus = middle !== undefined && keys.has(middle) ? middle : busiest(shape);
  if (focus === null) return [];
  const away = ringsOf(shape, focus);
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  const cx = space.width / 2,
    cy = space.height / 2;
  const outer = Math.min(space.width, space.height) / 2;
  const step = (outer * (1 - NAMES_SHARE)) / EGO_DEPTH;
  // each ring's things in written order, spread evenly round it
  const where = new Map<string, [number, number]>([[focus, [cx, cy]]]);
  const angle = new Map<string, number>();
  const rings: string[][] = Array.from({ length: EGO_DEPTH }, () => []);
  for (const t of shape.things) {
    const d = away.get(t.key);
    if (d) rings[d - 1]?.push(t.key);
  }
  rings.forEach((ring, i) =>
    ring.forEach((k, j) => {
      const th = -Math.PI / 2 + (2 * Math.PI * j) / ring.length;
      angle.set(k, th);
      where.set(k, [cx + step * (i + 1) * Math.cos(th), cy + step * (i + 1) * Math.sin(th)]);
    }),
  );
  const crowd = Math.max(1, ...rings.map((r, i) => r.length / (i + 1)));
  const size = Math.max(1, Math.min(outer * 0.08, (2 * Math.PI * step) / crowd / 1.5));
  const nameSize = Math.min(12, Math.max(size / 2, 6));
  const marks: DrawMark[] = [];
  for (const [k, [x, y]] of where) {
    const d = away.get(k) ?? 0;
    const s = d === 0 ? size * 1.5 : size;
    marks.push({
      kind: 'box',
      id: k,
      of: k,
      style: `ring.${d}`,
      x: x - s / 2,
      y: y - s / 2,
      width: s,
      height: s,
      shape: 'ellipse',
      role: 'thing',
      name: text.get(k) ?? k,
    });
    if (d === 0 || (rings[d - 1]?.length ?? 0) <= NAMED_MOST) {
      const th = angle.get(k);
      const right = th === undefined || Math.cos(th) >= 0;
      marks.push({
        kind: 'label',
        id: `${k}\nlabel`,
        of: k,
        style: 'text',
        x: d === 0 ? x : x + (right ? s / 2 + 2 : -s / 2 - 2),
        y: d === 0 ? y + s / 2 + nameSize : y + nameSize / 3,
        text: text.get(k) ?? k,
        size: nameSize,
        anchor: d === 0 ? 'middle' : right ? 'start' : 'end',
        maxWidth: Math.max(outer * NAMES_SHARE, 1),
      });
    }
  }
  shape.links.forEach((l, i) => {
    const p = where.get(l.from),
      q = where.get(l.to);
    if (!p || !q || l.from === l.to) return;
    marks.push({
      kind: 'link',
      id: `link\n${i}`,
      style: 'link',
      points: [p, q],
      from: l.from,
      to: l.to,
      role: 'link',
      name: `${text.get(l.from)} ${l.type} ${text.get(l.to)}`,
      z: -1,
    });
  });
  return marks;
}
