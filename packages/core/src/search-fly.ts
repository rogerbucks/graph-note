// Search a massive graph and fly to a match (editor spec §53, scale_search_fly). Roger, 22 Oct 2026: the fastest way
// into 50,000 things is by name. A search looks through every thing, in every group, open or closed. Choosing a match
// opens its group and flies the view there: out a little, across, and in, so the reader sees where it went.
//
// Three parts, each host-free and pure:
// - `ThingSearch` finds things by name, best matches first.
// - `openGroup` puts a group's laid-out inside into the overview, in the group's box.
// - `flyPath` gives the view at each moment of the flight; under reduced motion, it is there at once.
import type { DrawMark } from './drawing-marks.ts';
import type { LaidMarks } from './graphviz-marks.ts';
import type { Box } from './note-reading.ts';
import type { Grouping } from './scale-groups.ts';

/** A thing found: its key, its text, the group it sits in, and how well it matched (0 is best). */
export interface Match {
  key: string;
  text: string;
  group: string;
  rank: number;
}

/** How well a match is ranked: the whole name, the start of it, the start of a word in it, or anywhere in it. */
const WHOLE = 0,
  START = 1,
  WORD = 2,
  INSIDE = 3;

/** The most matches given by default: more than a list can show, fewer than slows a key press. */
export const MATCHES_MOST = 50;

/** Text folded for matching: lower case, with accents taken off, so `Café` is found by `cafe`. */
export function folded(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

/** Every thing of a graph, ready to be found by name: by its text, and by its key where they differ. */
export class ThingSearch {
  private readonly keys: string[] = [];
  private readonly texts: string[] = [];
  private readonly groups: string[] = [];
  private readonly words: string[] = [];

  constructor(boxes: readonly Box[], grouping: Grouping) {
    const groupOf = new Map<string, string>();
    for (const g of grouping.groups) for (const key of g.keys) groupOf.set(key, g.id);
    for (const b of boxes) {
      const group = groupOf.get(b.key);
      if (group === undefined) continue;
      this.keys.push(b.key);
      this.texts.push(b.text || b.key);
      this.groups.push(group);
      this.words.push(folded(b.text && b.text !== b.key ? `${b.text}\n${b.key}` : b.text || b.key));
    }
  }

  /** How many things can be found. */
  get size(): number {
    return this.keys.length;
  }

  /** The things whose name or key holds `query`, best first, at most `most`. Ties keep the order written. */
  find(query: string, most = MATCHES_MOST): Match[] {
    const q = folded(query.trim());
    if (!q) return [];
    const found: Match[] = [];
    for (let i = 0; i < this.words.length; i++) {
      const rank = rankOf(this.words[i] as string, q);
      if (rank === null) continue;
      found.push({ key: this.keys[i] as string, text: this.texts[i] as string, group: this.groups[i] as string, rank });
    }
    // a stable sort, so things that match as well keep the order they are written in
    return found.sort((a, b) => a.rank - b.rank || a.text.length - b.text.length).slice(0, most);
  }
}

/** How well `words` (a name, and the key on a line of its own) holds `q`, or null when it does not. */
function rankOf(words: string, q: string): number | null {
  let best: number | null = null;
  for (const name of words.split('\n')) {
    const at = name.indexOf(q);
    if (at < 0) continue;
    const rank = name === q ? WHOLE : at === 0 ? START : wordStart(name, q) ? WORD : INSIDE;
    if (best === null || rank < best) best = rank;
  }
  return best;
}

/** Whether `q` starts one of the words of `name`, after a space or a mark such as `-` or `_`. */
function wordStart(name: string, q: string): boolean {
  for (let at = name.indexOf(q); at > 0; at = name.indexOf(q, at + 1))
    if (!/[\p{L}\p{N}]/u.test(name[at - 1] as string)) return true;
  return false;
}

/** A place in the drawing: its corner, width and height, in CSS pixels at scale 1. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The share of a group's box its inside fills, so a thin margin keeps the group's edge clear. */
const INSIDE_FILLS = 0.92;

/**
 * The overview with group `id` opened. Its name and count go, and `inside` (the group laid out on its own)
 * is put in its box. The inside is scaled to fit and centred, keeping its shape. Each inside mark records the group
 * it sits in, and its id starts with the group's, as `group:a/t:ada`. Opened again, its old inside is taken away, so
 * nothing is drawn twice. Every other mark stays as it was, so the rest of the picture does not move.
 */
export function openGroup(overview: LaidMarks, id: string, inside: LaidMarks): LaidMarks {
  const box = overview.marks.find((m) => m.id === id && m.kind === 'group');
  if (!box || box.kind !== 'group') return overview;
  const { width, height } = inside.space;
  const k = width > 0 && height > 0 ? Math.min(box.width / width, box.height / height) * INSIDE_FILLS : 1;
  const dx = box.x + (box.width - width * k) / 2,
    dy = box.y + (box.height - height * k) / 2;
  const moved = inside.marks.map((m) => placed(m, k, dx, dy, id));
  const kept = overview.marks.filter(
    (m) => m.id !== `${id}:name` && m.id !== `${id}:count` && !m.id.startsWith(`${id}/`),
  );
  return { space: overview.space, marks: [...kept, ...moved] };
}

/** `m` scaled by `k` and moved by (`dx`, `dy`), inside group `group`. Its id, and its own group if any, start with it. */
function placed(m: DrawMark, k: number, dx: number, dy: number, group: string): DrawMark {
  const at = (x: number, y: number): [number, number] => [x * k + dx, y * k + dy];
  const within = {
    id: `${group}/${m.id}`,
    group: m.group === undefined ? group : `${group}/${m.group}`,
    z: (m.z ?? 0) + 3,
  };
  if (m.kind === 'link') return { ...m, ...within, points: m.points.map(([x, y]) => at(x, y)), outline: undefined };
  const [x, y] = at(m.x, m.y);
  if (m.kind === 'label') {
    const widest = m.maxWidth === undefined ? {} : { maxWidth: m.maxWidth * k };
    return { ...m, ...within, x, y, size: m.size * k, ...widest };
  }
  if (m.kind === 'arrowhead') return { ...m, ...within, x, y, size: m.size * k, outline: undefined };
  return {
    ...m,
    ...within,
    x,
    y,
    width: m.width * k,
    height: m.height * k,
    ...('outline' in m ? { outline: undefined } : {}),
  };
}

/** Where thing `key` is drawn in `laid`: its box, or null when its group is closed. */
export function placeOf(laid: LaidMarks, key: string): Rect | null {
  for (const m of laid.marks)
    if (m.of === key && (m.kind === 'box' || m.kind === 'item'))
      return { x: m.x, y: m.y, width: m.width, height: m.height };
  return null;
}

/** Where the view looks: the point of the drawing at the screen's top left, and screen pixels to each drawing pixel. */
export interface FlyView {
  x: number;
  y: number;
  scale: number;
}

/** How long a flight takes, in milliseconds: long enough to follow, short enough not to wait for. */
export const FLY_MS = 700;
/** The share of the screen the place flown to fills. */
const FILLS = 0.5;

/** The view that shows `place` in the middle of a screen `width` by `height`, filling about half of it. */
export function viewOnto(place: Rect, width: number, height: number, most = 4): FlyView {
  const scale = Math.min(
    most,
    (width * FILLS) / Math.max(1, place.width),
    (height * FILLS) / Math.max(1, place.height),
  );
  return {
    x: place.x + place.width / 2 - width / 2 / scale,
    y: place.y + place.height / 2 - height / 2 / scale,
    scale,
  };
}

/**
 * The view at each moment of a flight from `from` to `to`, on a screen `width` by `height`: `t` runs from 0 to 1.
 * The flight eases in and out. A far flight first draws back, so both ends can be seen on the way, then closes in
 * (after van Wijk and Nuij, 2003). Under `reduced` motion it is at `to` from the start.
 */
export function flyPath(
  from: FlyView,
  to: FlyView,
  width: number,
  height: number,
  reduced = false,
): (t: number) => FlyView {
  if (reduced) return () => to;
  const centre = (v: FlyView): [number, number] => [v.x + width / 2 / v.scale, v.y + height / 2 / v.scale];
  const [ax, ay] = centre(from),
    [bx, by] = centre(to);
  // how far apart the ends are, in screens at the smaller scale: the further, the more the flight draws back
  const apart = Math.hypot(bx - ax, by - ay) * Math.min(from.scale, to.scale);
  const back = Math.max(1, apart / Math.max(1, Math.max(width, height)));
  return (t) => {
    const u = Math.min(1, Math.max(0, t));
    const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    const scale = Math.exp(Math.log(from.scale) * (1 - e) + Math.log(to.scale) * e) / back ** Math.sin(Math.PI * e);
    const cx = ax + (bx - ax) * e,
      cy = ay + (by - ay) * e;
    return { x: cx - width / 2 / scale, y: cy - height / 2 / scale, scale };
  };
}
