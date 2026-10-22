// The block diagram view (editor spec §36, view_types_offered). Each thing is a block, and links run left to right. A
// thing sits one column right of the furthest thing that links to it, so a chain of links reads as a row of steps.
// Links are drawn as right-angled lines with an arrowhead. It is drawn as marks (drawing-marks.ts), so every painter
// draws it the same way.
//
// A cycle of links has no first thing. So a link back to a thing already on the path is left out of the columns, but it
// is still drawn.
//
// A key never holds a new line, so the ids this view joins with one never meet a thing's key.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven, MarkPoint } from '../plugin-diagrams.ts';
import type { GraphShape } from '../types-shape.ts';

/** The share of a column's width a block takes; the rest is room for links. */
const BLOCK_SHARE = 0.6;
/** The share of a row's height a block takes. */
const ROW_SHARE = 0.6;
/** The largest a block's name is drawn. */
const NAME_MOST = 14;
/** An arrowhead's size, at most. */
const ARROW_MOST = 6;

/** Each thing's column: one right of the furthest thing that links to it, leaving out links that close a cycle. */
export function columnsOf(shape: GraphShape): Map<string, number> {
  const keys = shape.things.map((t) => t.key);
  const known = new Set(keys);
  const out = new Map<string, string[]>();
  for (const l of shape.links)
    if (known.has(l.from) && known.has(l.to) && l.from !== l.to)
      (out.get(l.from) ?? out.set(l.from, []).get(l.from))?.push(l.to);
  // a depth-first walk in written order finds the links that close a cycle: those back to a thing still on the path
  const state = new Map<string, 'open' | 'done'>();
  const order: string[] = [];
  const forward = new Map<string, string[]>();
  for (const root of keys) {
    if (state.has(root)) continue;
    const stack: [string, number][] = [[root, 0]];
    state.set(root, 'open');
    while (stack.length) {
      const top = stack[stack.length - 1] as [string, number];
      const [k, i] = top;
      const next = out.get(k)?.[i];
      if (next === undefined) {
        state.set(k, 'done');
        order.push(k);
        stack.pop();
        continue;
      }
      top[1] = i + 1;
      if (state.get(next) === 'open') continue;
      (forward.get(k) ?? forward.set(k, []).get(k))?.push(next);
      if (!state.has(next)) {
        state.set(next, 'open');
        stack.push([next, 0]);
      }
    }
  }
  // the longest path to each thing, in the walk's reverse finishing order, which puts each thing after those before it
  const column = new Map(keys.map((k) => [k, 0]));
  for (const k of order.reverse())
    for (const n of forward.get(k) ?? []) column.set(n, Math.max(column.get(n) ?? 0, (column.get(k) ?? 0) + 1));
  return column;
}

/** The marks of `shape` drawn as a block diagram in `space`. */
export function blockMarks({ shape, space }: DiagramGiven): DrawMark[] {
  if (!shape.things.length) return [];
  const column = columnsOf(shape);
  const columns = Math.max(...column.values()) + 1;
  // each column's things in written order, then each moved near the middle of the things that link to it
  const stacks: string[][] = Array.from({ length: columns }, () => []);
  for (const t of shape.things) stacks[column.get(t.key) ?? 0]?.push(t.key);
  const row = new Map<string, number>();
  const into = new Map<string, string[]>();
  for (const l of shape.links) (into.get(l.to) ?? into.set(l.to, []).get(l.to))?.push(l.from);
  stacks.forEach((stack, c) => {
    const at = (k: string) => {
      const before = (into.get(k) ?? []).filter((p) => (column.get(p) ?? 0) < c && row.has(p));
      return before.length ? before.reduce((s, p) => s + (row.get(p) ?? 0), 0) / before.length : Infinity;
    };
    const ranked = stack.map((k, i) => [k, at(k), i] as const);
    ranked.sort((a, b) => (a[1] === b[1] ? a[2] - b[2] : a[1] < b[1] ? -1 : 1));
    ranked.forEach(([k], i) => row.set(k, i));
    stacks[c] = ranked.map(([k]) => k);
  });
  const rows = Math.max(...stacks.map((s) => s.length));
  const cw = space.width / columns,
    rh = space.height / rows;
  const bw = cw * BLOCK_SHARE,
    bh = rh * ROW_SHARE;
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  const box = new Map<string, { x: number; y: number }>();
  const marks: DrawMark[] = [];
  stacks.forEach((stack, c) => {
    // a short column is centred down the space
    const top = ((rows - stack.length) * rh) / 2;
    stack.forEach((k, r) => {
      const x = c * cw + (cw - bw) / 2,
        y = top + r * rh + (rh - bh) / 2;
      box.set(k, { x, y });
      marks.push({ kind: 'box', id: k, of: k, style: 'thing', x, y, width: bw, height: bh, role: 'thing' });
      const size = Math.min(NAME_MOST, bh / 2);
      if (size >= 4)
        marks.push({
          kind: 'label',
          id: `${k}\nlabel`,
          of: k,
          style: 'text',
          x: x + bw / 2,
          y: y + bh / 2 + size / 3,
          text: text.get(k) ?? k,
          size,
          anchor: 'middle',
          maxWidth: Math.max(bw - 4, 1),
        });
    });
  });
  const arrow = Math.max(1, Math.min(ARROW_MOST, (cw - bw) / 4, bh / 3));
  shape.links.forEach((l, i) => {
    const a = box.get(l.from),
      b = box.get(l.to);
    if (!a || !b || l.from === l.to) return;
    let points: MarkPoint[];
    if (b.x > a.x) {
      // forward: out of the right side, across the gap, into the left side
      const p: MarkPoint = [a.x + bw, a.y + bh / 2],
        q: MarkPoint = [b.x, b.y + bh / 2];
      const mid = q[0] - (cw - bw) / 2;
      points = [p, [mid, p[1]], [mid, q[1]], q];
    } else {
      // back or in the same column: out of the bottom, along under the blocks, into the bottom
      const p: MarkPoint = [a.x + bw / 2, a.y + bh],
        q: MarkPoint = [b.x + bw / 2, b.y + bh];
      const under = Math.min(Math.max(p[1], q[1]) + (rh - bh) / 2, space.height);
      points = [p, [p[0], under], [q[0], under], q];
    }
    const [x0, y0] = points[points.length - 2] as MarkPoint,
      [x1, y1] = points[points.length - 1] as MarkPoint;
    const name = `${text.get(l.from)} ${l.type} ${text.get(l.to)}`;
    marks.push(
      { kind: 'link', id: `link\n${i}`, style: 'link', points, from: l.from, to: l.to, role: 'link', name, z: -1 },
      {
        kind: 'arrowhead',
        id: `link\n${i}\narrow`,
        style: 'link',
        x: x1,
        y: y1,
        angle: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI,
        size: arrow,
      },
    );
  });
  return marks;
}
