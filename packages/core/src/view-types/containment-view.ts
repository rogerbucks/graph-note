// The containment view (editor spec §36, view_types_offered). A thing that holds others is a box with them drawn inside
// it, and they may hold others in turn. A part is drawn inside its whole, so the nesting of a graph shows at a glance.
// It is drawn as marks (drawing-marks.ts), so every painter draws it the same way.
//
// A thing is inside another by a link that says so. PART_OF, MEMBER_OF, IN and INSIDE run from the part to its whole.
// CONTAINS, HAS and HOLDS run from the whole to its part. A part with two wholes is drawn inside each. Every box of it
// carries the same shared marker (multi_member_drawn), so no part is forced under one parent. A link that would put
// a thing inside itself is left out. A box's size grows with all it holds, laid out squarified as the treemap view
// lays out its boxes.
//
// A key never holds a new line, so the ids this view joins with one never meet a thing's key.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import type { GraphShape } from '../types-shape.ts';
import { squarified } from './treemap-view.ts';

/** The links that run from a part to its whole. */
export const PART_LINKS: readonly string[] = ['PART_OF', 'MEMBER_OF', 'IN', 'INSIDE'];
/** The links that run from a whole to its part. */
export const WHOLE_LINKS: readonly string[] = ['CONTAINS', 'HAS', 'HOLDS'];
/** The most a box's name band takes of its height, and its height when there is room. */
const BAND_SHARE = 0.25;
const BAND = 16;
/** The gap round each box, so boxes side by side stand apart. */
const GAP = 2;
/** The smallest a box is drawn with what it holds inside it; smaller, it is drawn on its own. */
const ROOM_LEAST = 12;
/** The most marks drawn, so a part held by many wholes, held by many in turn, still stops. */
const MARKS_MOST = 4000;

/** Each part's wholes, in the order written, leaving out a link that would put a thing inside itself. */
export function wholesOf(shape: GraphShape): Map<string, string[]> {
  const known = new Set(shape.things.map((t) => t.key));
  const whole = new Map<string, string[]>();
  // whether `part` is `of`, or holds it, however deep
  const inside = (part: string, of: string) => {
    const seen = new Set<string>();
    const up = [of];
    while (up.length) {
      const w = up.pop() as string;
      if (w === part) return true;
      if (seen.has(w)) continue;
      seen.add(w);
      up.push(...(whole.get(w) ?? []));
    }
    return false;
  };
  for (const l of shape.links) {
    const [part, of] = PART_LINKS.includes(l.type)
      ? [l.from, l.to]
      : WHOLE_LINKS.includes(l.type)
        ? [l.to, l.from]
        : [undefined, undefined];
    if (part === undefined || of === undefined || !known.has(part) || !known.has(of)) continue;
    if (whole.get(part)?.includes(of) || inside(part, of)) continue;
    (whole.get(part) ?? whole.set(part, []).get(part))?.push(of);
  }
  return whole;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The marks of `shape` drawn as a containment view in `space`. */
export function containmentMarks({ shape, space }: DiagramGiven): DrawMark[] {
  if (!shape.things.length) return [];
  const whole = wholesOf(shape);
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  const parts = new Map<string, string[]>();
  for (const t of shape.things)
    for (const w of whole.get(t.key) ?? []) (parts.get(w) ?? parts.set(w, []).get(w))?.push(t.key);
  // a part in two wholes is drawn twice or more: each of its boxes carries the shared marker
  const shared = new Set([...whole].filter(([, ws]) => ws.length > 1).map(([k]) => k));
  const drawn = new Map<string, number>();
  const weight = new Map<string, number>();
  const weigh = (k: string): number => {
    const known = weight.get(k);
    if (known !== undefined) return known;
    const w = 1 + (parts.get(k) ?? []).reduce((n, p) => n + weigh(p), 0);
    weight.set(k, w);
    return w;
  };
  const marks: DrawMark[] = [];
  const draw = (keys: readonly string[], room: Rect, group?: string) => {
    squarified(
      keys.map((k) => weigh(k)),
      room,
    ).forEach((r, i) => {
      if (marks.length >= MARKS_MOST) return;
      const k = keys[i] as string;
      // the first box of a thing has its key for its id, and each other box its own
      const n = drawn.get(k) ?? 0;
      drawn.set(k, n + 1);
      const id = n ? `${k}\nagain\n${n}` : k;
      const g = Math.min(GAP, r.width / 4, r.height / 4);
      const box = { x: r.x + g, y: r.y + g, width: r.width - 2 * g, height: r.height - 2 * g };
      const held = parts.get(k) ?? [];
      const band = Math.min(BAND, box.height * BAND_SHARE);
      const inner: Rect = { x: box.x, y: box.y + band, width: box.width, height: box.height - band };
      const opens = held.length > 0 && inner.width >= ROOM_LEAST && inner.height >= ROOM_LEAST;
      marks.push({
        kind: 'box',
        id,
        of: k,
        style: `${held.length ? 'whole' : 'thing'}${shared.has(k) ? '.shared' : ''}`,
        ...box,
        ...(group ? { group } : {}),
        role: 'thing',
        name: text.get(k) ?? k,
      });
      const size = held.length ? band * 0.6 : Math.min(12, box.height / 2);
      if (size >= 4 && box.width > 8)
        marks.push({
          kind: 'label',
          id: `${id}\nlabel`,
          of: k,
          style: 'text',
          x: held.length ? box.x + 4 : box.x + box.width / 2,
          y: held.length ? box.y + band * 0.75 : box.y + box.height / 2 + size / 3,
          text: text.get(k) ?? k,
          size,
          anchor: held.length ? 'start' : 'middle',
          maxWidth: Math.max(box.width - 8, 1),
        });
      if (opens) {
        // what a whole holds sits in a region of its own, under its name
        const region = `inside\n${id}`;
        marks.push({
          kind: 'group',
          id: region,
          style: 'inside',
          ...inner,
          ...(group ? { group } : {}),
          role: 'group',
        });
        draw(held, inner, region);
      }
    });
  };
  const tops = shape.things.map((t) => t.key).filter((k) => !whole.has(k));
  draw(tops, { x: 0, y: 0, width: space.width, height: space.height });
  return marks;
}
