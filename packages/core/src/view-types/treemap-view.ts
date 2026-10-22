// The treemap view (editor spec §36, view_types_offered): a graph as nested rectangles. Each group is a rectangle, and
// each thing a rectangle inside it, sized by how many links it has. The groups are the ones the graph draws, else its
// kinds. A treemap shows at a glance which parts of a graph are biggest and busiest. Rectangles are laid out squarified
// (Bruls, Huizing and van Wijk, 2000), so they stay near square and their names fit.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import type { GraphShape } from '../types-shape.ts';

/** A rectangle: its corner, width and height. */
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The most a group's name band takes of its rectangle's height, and its height when there is room. */
const BAND_SHARE = 0.2;
const BAND = 18;
/** The largest a thing's name is drawn, in CSS pixels. */
const NAME_MOST = 12;

/** The worst ratio of long side to short side, laying out the areas of `row` along a side `side` long. */
function worst(row: readonly number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  const most = Math.max(...row),
    least = Math.min(...row);
  return Math.max((side * side * most) / (sum * sum), (sum * sum) / (side * side * least));
}

/** `areas` laid out squarified in `rect`, largest first. Each comes back as a rectangle, in the order given. */
export function squarified(areas: readonly number[], rect: Rect): Rect[] {
  const total = areas.reduce((a, b) => a + b, 0);
  const out: Rect[] = areas.map(() => ({ x: rect.x, y: rect.y, width: 0, height: 0 }));
  if (!total || rect.width <= 0 || rect.height <= 0) return out;
  const scale = (rect.width * rect.height) / total;
  const order = areas.map((a, i) => [a * scale, i] as const).sort((p, q) => q[0] - p[0] || p[1] - q[1]);
  let free = { ...rect },
    row: (readonly [number, number])[] = [];
  const place = (items: readonly (readonly [number, number])[]) => {
    const sum = items.reduce((a, [v]) => a + v, 0);
    const wide = free.width >= free.height;
    const thick = sum / (wide ? free.height : free.width);
    let at = wide ? free.y : free.x;
    for (const [v, i] of items) {
      const long = v / thick;
      out[i] = wide
        ? { x: free.x, y: at, width: thick, height: long }
        : { x: at, y: free.y, width: long, height: thick };
      at += long;
    }
    free = wide
      ? { x: free.x + thick, y: free.y, width: free.width - thick, height: free.height }
      : { x: free.x, y: free.y + thick, width: free.width, height: free.height - thick };
  };
  for (const item of order) {
    const side = Math.min(free.width, free.height);
    const values = row.map(([v]) => v);
    if (row.length && worst([...values, item[0]], side) > worst(values, side)) {
      place(row);
      row = [];
    }
    row.push(item);
  }
  if (row.length) place(row);
  return out;
}

/** The groups a treemap shows: the ones the graph draws, else one for each kind. A thing is in the first it is in. */
function groupsOf(shape: GraphShape): [string, string[]][] {
  const keys = new Set(shape.things.map((t) => t.key));
  const taken = new Set<string>();
  const drawn = (shape.groups ?? []).map(([label, ks]): [string, string[]] => {
    const own = ks.filter((k) => keys.has(k) && !taken.has(k));
    for (const k of own) taken.add(k);
    return [label, own];
  });
  const kinds = new Map<string, string[]>();
  for (const t of shape.things)
    if (!taken.has(t.key)) {
      const kind = t.kinds.join(', ') || '—';
      kinds.set(kind, [...(kinds.get(kind) ?? []), t.key]);
    }
  return [...drawn, ...kinds].filter(([, ks]) => ks.length);
}

/** Pulled in a little, so the rectangle next to it shows a gap and never a mark outside the space. */
const inset = ({ x, y, width, height }: Rect, by: number): Rect => {
  const b = Math.min(by, width / 4, height / 4);
  return { x: x + b, y: y + b, width: width - 2 * b, height: height - 2 * b };
};

/** The marks of `shape` drawn as a treemap in `space`: a group mark for each group, a box for each thing in it. */
export function treemapMarks({ shape, space }: DiagramGiven): DrawMark[] {
  const degree = new Map(shape.things.map((t) => [t.key, 0]));
  for (const l of shape.links)
    for (const k of [l.from, l.to]) if (degree.has(k)) degree.set(k, (degree.get(k) ?? 0) + 1);
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  const groups = groupsOf(shape);
  const weight = (k: string) => 1 + (degree.get(k) ?? 0);
  const whole: Rect = { x: 0, y: 0, width: space.width, height: space.height };
  const boxes = squarified(
    groups.map(([, ks]) => ks.reduce((n, k) => n + weight(k), 0)),
    whole,
  );
  return groups.flatMap(([label, keys], g): DrawMark[] => {
    const box = inset(boxes[g] as Rect, 1);
    const id = `group.${g}`;
    const band = Math.min(BAND, box.height * BAND_SHARE);
    const inside: Rect = { x: box.x, y: box.y + band, width: box.width, height: box.height - band };
    const marks: DrawMark[] = [
      { kind: 'group', id, style: 'group', ...box, role: 'group', name: label },
      {
        kind: 'label',
        id: `${id}.label`,
        style: 'text',
        group: id,
        x: box.x + 4,
        y: box.y + band * 0.75,
        text: label,
        size: band * 0.6,
        anchor: 'start',
        maxWidth: Math.max(box.width - 8, 1),
      },
    ];
    squarified(keys.map(weight), inside).forEach((r, i) => {
      const key = keys[i] as string;
      const cell = inset(r, 1);
      marks.push({ kind: 'box', id: key, of: key, style: 'thing', group: id, ...cell, role: 'thing' });
      const size = Math.min(NAME_MOST, cell.height / 2);
      if (size >= 4 && cell.width > 8)
        marks.push({
          kind: 'label',
          id: `${key}.label`,
          of: key,
          style: 'text',
          group: id,
          x: cell.x + cell.width / 2,
          y: cell.y + cell.height / 2 + size / 3,
          text: text.get(key) ?? key,
          size,
          anchor: 'middle',
          maxWidth: cell.width - 4,
        });
    });
    return marks;
  });
}
