// The overview a massive graph opens as (editor spec §53, scale_overview; wiki/Massive-graphs-design.md, way E, step 4).
// Each group (scale-groups.ts) is one box, sized by how many things it holds, with its name and count. Lines join the
// groups that link. So 266,600 things open as about 500 boxes, which any renderer draws at once.
//
// The boxes are a squarified treemap (Bruls and others, 2000). They fill a square, and each is as near square as it
// can be, so each has room for its name. Groups that link to each other are put side by side. Their links are grouped
// once more (louvain.ts), and each such set of groups gets its own part of the square.
//
// Host-free and pure: the same groups give the same marks every time. Every mark is in CSS pixels at scale 1.
import { DRAW_TEXT_LIMIT } from './drawing-marks.ts';
import type { DrawMark } from './drawing-marks.ts';
import type { LaidMarks } from './graphviz-marks.ts';
import { louvain } from './louvain.ts';
import type { Grouping } from './scale-groups.ts';

/** The room one thing takes in the overview, in CSS pixels squared: a group of 500 is about 670 pixels across. */
const THING_ROOM = 30 * 30;
/** The gap left around each group's box, in CSS pixels. */
const GAP = 4;
/** The largest a group's name is drawn, in CSS pixels at scale 1. */
const NAME_MOST = 96;

/** `text` cut to the longest a mark may hold. */
const short = (text: string) => (text.length > DRAW_TEXT_LIMIT ? `${text.slice(0, DRAW_TEXT_LIMIT - 1)}…` : text);

/** A place in the square: its corner, width and height. */
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The worst ratio of long side to short side in `row`, laid along a side `side` long. `sum` is the row's area. */
function worst(row: readonly number[], sum: number, side: number): number {
  const along = sum / side;
  let most = 1;
  for (const a of row) {
    const across = a / along;
    most = Math.max(most, along / across, across / along);
  }
  return most;
}

/**
 * Rects for `areas`, in order, filling `room`. The areas must add up to the room's area. Each row is laid along the
 * room's shorter side, and grows while that keeps its boxes nearer square.
 */
export function squarify(areas: readonly number[], room: Rect): Rect[] {
  const out: Rect[] = [];
  let { x, y, width, height } = room;
  let i = 0;
  while (i < areas.length) {
    const side = Math.min(width, height);
    const row = [areas[i] as number];
    let sum = row[0] as number;
    for (let j = i + 1; j < areas.length; j++) {
      const a = areas[j] as number;
      if (worst([...row, a], sum + a, side) > worst(row, sum, side)) break;
      row.push(a);
      sum += a;
    }
    // the last row takes all the room left, so rounding never leaves a sliver
    const last = i + row.length === areas.length;
    const along = sum / side;
    let at = 0;
    for (const [k, a] of row.entries()) {
      const across = last && k === row.length - 1 ? side - at : a / along;
      const deep = last ? (width < height ? height : width) : along;
      out.push(
        width < height ? { x: x + at, y, width: across, height: deep } : { x, y: y + at, width: deep, height: across },
      );
      at += across;
    }
    if (width < height) {
      y += along;
      height -= along;
    } else {
      x += along;
      width -= along;
    }
    i += row.length;
  }
  return out;
}

/** The groups' places in `grouping` in sets of those that link to each other, each set in written order. */
function sets({ groups, between }: Grouping): number[][] {
  const of = louvain(
    groups.length,
    between.map((l) => [l.from, l.to] as const),
  );
  const out: number[][] = [];
  of.forEach((s, g) => (out[s] ??= []).push(g));
  return out;
}

/** The overview of `grouping` as marks: a box for each group with its name and count, and a line for each link between. */
export function overviewOf(grouping: Grouping): LaidMarks {
  const { groups, between } = grouping;
  const things = groups.reduce((n, g) => n + g.keys.length, 0);
  const side = Math.ceil(Math.sqrt(Math.max(1, things) * THING_ROOM));
  const space = { width: side, height: side };
  if (!groups.length) return { space, marks: [] };
  const room = (n: number) => (n / Math.max(1, things)) * side * side;
  // largest first, as the treemap needs to keep its boxes near square; ties keep the written order
  const size = (g: number) => groups[g]?.keys.length ?? 0;
  const parts = sets(grouping)
    .map((p) => p.sort((a, b) => size(b) - size(a) || a - b))
    .map((p) => ({ p, n: p.reduce((n, g) => n + size(g), 0) }))
    .sort((a, b) => b.n - a.n || (a.p[0] ?? 0) - (b.p[0] ?? 0))
    .map(({ p }) => p);
  const place: Rect[] = [];
  squarify(
    parts.map((p) => room(p.reduce((n, g) => n + size(g), 0))),
    { x: 0, y: 0, width: side, height: side },
  ).forEach((rect, s) => {
    const part = parts[s] ?? [];
    squarify(
      part.map((g) => room(size(g))),
      rect,
    ).forEach((r, k) => (place[part[k] as number] = r));
  });
  const marks: DrawMark[] = [];
  const centre: [number, number][] = [];
  groups.forEach((g, i) => {
    const r = place[i] as Rect;
    const gap = Math.min(GAP, r.width / 4, r.height / 4);
    const box = { x: r.x + gap, y: r.y + gap, width: r.width - gap * 2, height: r.height - gap * 2 };
    const count = `${g.keys.length} ${g.keys.length === 1 ? 'thing' : 'things'}`;
    centre[i] = [box.x + box.width / 2, box.y + box.height / 2];
    marks.push({
      id: g.id,
      kind: 'group',
      style: 'overview.group',
      ...box,
      role: 'group',
      name: short(`${g.label}, ${count}`),
    });
    // the name is as large as fits its box: about two thirds of a size per character
    const big = Math.max(
      0.01,
      Math.min(NAME_MOST, box.height / 4, (box.width * 0.9 * 1.6) / Math.max(1, g.label.length)),
    );
    const [cx, cy] = centre[i];
    const label = { kind: 'label', anchor: 'middle', maxWidth: box.width * 0.9, group: g.id, z: 2 } as const;
    marks.push({ id: `${g.id}:name`, style: 'overview.name', ...label, x: cx, y: cy, text: short(g.label), size: big });
    marks.push({
      id: `${g.id}:count`,
      style: 'overview.count',
      ...label,
      x: cx,
      y: cy + big,
      text: count,
      size: big / 2,
    });
  });
  for (const l of between) {
    const a = centre[l.from],
      b = centre[l.to],
      from = groups[l.from]?.id,
      to = groups[l.to]?.id;
    if (!a || !b || from === undefined || to === undefined) continue;
    const name = `${l.links} ${l.links === 1 ? 'link' : 'links'}`;
    marks.push({
      id: short(`${from}->${to}`),
      kind: 'link',
      style: 'overview.link',
      points: [a, b],
      from,
      to,
      z: 1,
      name,
    });
  }
  return { space, marks };
}
