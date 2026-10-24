// A massive graph's places that stay as they are (editor spec §53, scale_layout_static). A thing or link added or
// removed changes the group it touched, and only that group is laid out again. Every other group keeps its place in the
// overview exactly, and its saved inside layout (layout-cache.ts) is found by the same digest as before. Moving,
// zooming, filtering or choosing is a change of view, never of layout, so none of them lays anything out.
//
// `keepPlaces` gives the overview of the changed graph with each group that was there before in its old place. A group
// whose size changed keeps its box and takes its new name and count. A group that is new is put on a row below
// everything, left to right. A group that is gone leaves its place empty.
//
// Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import type { LaidMarks } from './graphviz-marks.ts';

/** The ids of the groups whose digest is new or changed: the only ones to lay out again. */
export function groupsToLay(before: ReadonlyMap<string, string>, now: ReadonlyMap<string, string>): string[] {
  return [...now].filter(([id, digest]) => before.get(id) !== digest).map(([id]) => id);
}

/** The gap left around a group put on the new row, in CSS pixels. */
const GAP = 8;

type Box = Extract<DrawMark, { kind: 'group' }>;

/** `next`, the overview of the changed graph, with every group in `previous` where it was. */
export function keepPlaces(previous: LaidMarks | null, next: LaidMarks): LaidMarks {
  if (!previous) return next;
  const old = new Map<string, Box>();
  for (const m of previous.marks) if (m.kind === 'group') old.set(m.id, m);
  const oldMarks = new Map(previous.marks.map((m) => [m.id, m]));
  let width = previous.space.width,
    height = previous.space.height;
  // the groups that are new, placed on a row below everything, wrapping at the width
  const fresh = next.marks.filter((m): m is Box => m.kind === 'group' && !old.has(m.id));
  const row = { x: 0, y: height, tall: 0 };
  const place = new Map<string, { dx: number; dy: number }>();
  for (const g of fresh) {
    if (row.x > 0 && row.x + g.width > width) Object.assign(row, { x: 0, y: row.y + row.tall + GAP, tall: 0 });
    place.set(g.id, { dx: row.x - g.x, dy: row.y - g.y });
    row.x += g.width + GAP;
    row.tall = Math.max(row.tall, g.height);
    width = Math.max(width, row.x);
    height = Math.max(height, row.y + row.tall);
  }
  const centre = new Map<string, [number, number]>();
  const marks: DrawMark[] = [];
  for (const m of next.marks) {
    if (m.kind === 'link') continue;
    const group = m.kind === 'group' ? m.id : (m as { group?: string }).group;
    const kept = group === undefined ? undefined : old.get(group);
    if (kept) {
      // a mark of a group that was there: its old place, its new words
      const was = oldMarks.get(m.id);
      marks.push(
        was && m.kind === 'label' && was.kind === 'label'
          ? { ...was, text: m.text, name: m.name }
          : was && m.kind === 'group'
            ? { ...m, x: kept.x, y: kept.y, width: kept.width, height: kept.height }
            : m,
      );
      continue;
    }
    const by = group === undefined ? undefined : place.get(group);
    if (by && m.kind !== 'arrowhead') marks.push(shifted(m, by.dx, by.dy));
    else marks.push(m);
  }
  for (const m of marks) if (m.kind === 'group') centre.set(m.id, [m.x + m.width / 2, m.y + m.height / 2]);
  // the lines between groups follow the groups' middles, wherever they now are
  for (const m of next.marks) {
    if (m.kind !== 'link') continue;
    const a = centre.get(m.from ?? ''),
      b = centre.get(m.to ?? '');
    if (a && b) marks.push({ ...m, points: [a, b] });
  }
  return { space: { width, height }, marks };
}

/** `m` moved by (`dx`, `dy`). */
function shifted(m: DrawMark, dx: number, dy: number): DrawMark {
  if (m.kind === 'link') return { ...m, points: m.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
  if (m.kind === 'arrowhead') return { ...m, x: m.x + dx, y: m.y + dy };
  return { ...m, x: m.x + dx, y: m.y + dy };
}
