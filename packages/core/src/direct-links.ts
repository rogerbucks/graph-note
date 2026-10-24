// Direct links (editor spec §25, untangle_direct). Roger, 24 Oct 2026: "With the 2d lines... they route all over the
// place. Make them curve directly but move the nodes around to make the connections more optimised."
//
// Graphviz places the boxes, ordering each row to cut crossings. Then, in place of its routing, each link here is one
// gentle curve from box to box. Where a link would pass through a box it does not join, that box moves aside, just
// clear of it. Boxes moved into each other are pushed apart again. A few rounds of this settle, within a budget, so a
// big graph stays quick. Two links between the same two boxes bow apart, so both show. A link's arrowhead lands on the
// box it points to, and its words sit at its middle.
//
// It works on the marks Graphviz's layout gives (graphviz-marks.ts). The SVG is written from them (graphviz-svg.ts), so
// every part keeps its id, class and title. Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import type { LaidMarks } from './graphviz-marks.ts';
import type { MarkPoint } from './plugin-diagrams.ts';

/** How much room a link keeps from a box it passes, in pixels. */
export const CLEARANCE = 10;
/** The room kept between two boxes pushed apart, in pixels. */
const BOX_GAP = 12;
/** The most rounds of moving boxes off links and apart again. */
const ROUNDS = 6;
/** The most box and link pairs looked at in all, so a big graph stays quick. */
const WORK_MOST = 4_000_000;
/** How far two links between the same boxes bow apart at their middle, as a share of their length. */
const BOW = 0.16;
/** How far a link's words sit off its middle, as a share of their size, so they do not lie on the line. */
const WORDS_OFF = 0.55;

/** A box being placed: its key, its middle and its half width and height. */
interface Placed {
  key: string;
  x: number;
  y: number;
  hw: number;
  hh: number;
  /** The group it must stay inside, as its edges, when it is in one. */
  inside?: { x0: number; y0: number; x1: number; y1: number };
}

/** `laid` with its links drawn directly and its boxes moved off them. A self link keeps its loop, moved with its box. */
export function directLinks(laid: LaidMarks): LaidMarks {
  const boxes = new Map<string, Placed>();
  const groups = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  for (const m of laid.marks)
    if (m.kind === 'group') groups.set(m.id, { x0: m.x, y0: m.y, x1: m.x + m.width, y1: m.y + m.height });
  for (const m of laid.marks)
    if (m.kind === 'box' && m.role === 'thing' && m.of !== undefined && !boxes.has(m.of)) {
      const p: Placed = { key: m.of, x: m.x + m.width / 2, y: m.y + m.height / 2, hw: m.width / 2, hh: m.height / 2 };
      const g = m.group === undefined ? undefined : groups.get(m.group);
      if (g) p.inside = g;
      boxes.set(m.of, p);
    }
  const links = laid.marks.filter(
    (m): m is DrawMark & { kind: 'link' } =>
      m.kind === 'link' && m.from !== undefined && m.to !== undefined && boxes.has(m.from) && boxes.has(m.to),
  );
  const start = new Map([...boxes].map(([k, b]) => [k, [b.x, b.y] as const]));
  settle([...boxes.values()], links);

  // every mark of a moved box's part goes with it: its outline, its words, its pictures
  const moved = new Map<string, [number, number]>();
  for (const [k, b] of boxes) {
    const [x0, y0] = start.get(k) ?? [b.x, b.y];
    if (b.x !== x0 || b.y !== y0) moved.set(k, [b.x - x0, b.y - y0]);
  }
  const shiftOf = new Map<string, [number, number]>();
  for (const part of laid.layout?.parts ?? [])
    if (part.kind === 'node') {
      const by = moved.get(part.title);
      if (by) for (const id of part.marks) shiftOf.set(id, by);
    }
  for (const m of laid.marks) {
    const by = shiftOf.get(m.id) ?? (laid.layout ? undefined : m.of === undefined ? undefined : moved.get(m.of));
    if (by && m.kind !== 'link') shiftOf.set(m.id, by);
  }

  // links between the same two boxes, either way round: how many, and each one's place among them
  const pairOf = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);
  const many = new Map<string, number>(),
    nth = new Map<string, number>();
  for (const l of links)
    if (l.from !== l.to)
      many.set(pairOf(l.from ?? '', l.to ?? ''), (many.get(pairOf(l.from ?? '', l.to ?? '')) ?? 0) + 1);
  const curves = new Map<string, Curve>();
  for (const l of links) {
    const a = boxes.get(l.from ?? '') as Placed,
      b = boxes.get(l.to ?? '') as Placed;
    if (a === b) continue;
    const pair = pairOf(a.key, b.key),
      i = nth.get(pair) ?? 0;
    nth.set(pair, i + 1);
    const side = a.key < b.key ? 1 : -1;
    const bow = (i - ((many.get(pair) ?? 1) - 1) / 2) * BOW * side + aside(a, b, boxes.values());
    curves.set(l.of ?? l.id, curveOf(a, b, bow));
  }
  const spots = wordSpots(laid.marks, boxes, curves);

  const marks = laid.marks.map((m): DrawMark => {
    const by = shiftOf.get(m.id);
    const c = m.of === undefined ? undefined : curves.get(m.of);
    if (m.kind === 'link' && c) {
      // the line stops where its arrowhead begins, at the end it points to
      const head = headOf(laid.marks, m.of);
      const points = c.cubic(head?.atStart ? head.size : 0, head && !head.atStart ? head.size : 0);
      const { outline: _gone, ...rest } = m;
      return { ...rest, points, curve: true };
    }
    if (m.kind === 'arrowhead' && c) {
      const atStart = m.id.startsWith('tail:') || nearer(c, [m.x, m.y]);
      const [tip, angle] = c.tipAt(atStart);
      const { outline: _gone, ...rest } = m;
      return { ...rest, x: tip[0], y: tip[1], angle };
    }
    if (m.kind === 'label' && c && !boxes.has(m.of ?? '')) {
      const [x, y] = spots.get(m.id) ?? c.wordsAt(0.5, m.size * WORDS_OFF);
      return { ...m, x, y };
    }
    if (!by) return m;
    return shifted(m, by[0], by[1]);
  });
  return grown({ ...laid, marks });
}

/** Moves boxes off links they do not join and apart from each other, a few rounds, within the budget. */
function settle(boxes: Placed[], links: readonly (DrawMark & { kind: 'link' })[]): void {
  const byKey = new Map(boxes.map((b) => [b.key, b]));
  const rounds = Math.max(1, Math.min(ROUNDS, Math.floor(WORK_MOST / Math.max(1, boxes.length * links.length))));
  for (let r = 0; r < rounds; r++) {
    let moves = 0;
    for (const l of links) {
      const a = byKey.get(l.from ?? ''),
        b = byKey.get(l.to ?? '');
      if (!a || !b || a === b) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        long = Math.hypot(dx, dy);
      if (long < 1e-6) continue;
      const nx = -dy / long,
        ny = dx / long;
      for (const c of boxes) {
        if (c === a || c === b) continue;
        // how far along the link the box's middle is, and how far to one side
        const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / (long * long);
        if (t <= 0 || t >= 1) continue;
        const off = (c.x - a.x) * nx + (c.y - a.y) * ny;
        // the box's reach across the link: its half size seen square to the link, and the room it keeps
        const reach = Math.abs(nx) * c.hw + Math.abs(ny) * c.hh + CLEARANCE;
        if (Math.abs(off) >= reach) continue;
        const push = (off >= 0 ? 1 : -1) * (reach - Math.abs(off));
        moveTo(c, c.x + nx * push, c.y + ny * push);
        moves++;
      }
    }
    moves += apart(boxes);
    if (!moves) break;
  }
}

/** Pushes apart boxes that overlap, along the way that parts them least, and says how many moved. */
function apart(boxes: Placed[]): number {
  let moves = 0;
  const sorted = [...boxes].sort((p, q) => p.x - p.hw - (q.x - q.hw));
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i] as Placed;
    for (let j = i + 1; j < sorted.length; j++) {
      const q = sorted[j] as Placed;
      if (q.x - q.hw >= p.x + p.hw + BOX_GAP) break;
      const ox = p.hw + q.hw + BOX_GAP - Math.abs(q.x - p.x),
        oy = p.hh + q.hh + BOX_GAP - Math.abs(q.y - p.y);
      if (ox <= 0 || oy <= 0) continue;
      // each moves half the overlap, along the way that is shorter
      if (oy <= ox) {
        const s = (q.y >= p.y ? 1 : -1) * (oy / 2);
        moveTo(p, p.x, p.y - s);
        moveTo(q, q.x, q.y + s);
      } else {
        const s = (q.x >= p.x ? 1 : -1) * (ox / 2);
        moveTo(p, p.x - s, p.y);
        moveTo(q, q.x + s, q.y);
      }
      moves++;
    }
  }
  return moves;
}

/** Puts box `b`'s middle at (`x`, `y`), kept inside its group. */
function moveTo(b: Placed, x: number, y: number): void {
  const g = b.inside;
  b.x = g ? Math.min(Math.max(x, g.x0 + b.hw), g.x1 - b.hw) : x;
  b.y = g ? Math.min(Math.max(y, g.y0 + b.hh), g.y1 - b.hh) : y;
}

/** A direct link's curve: its points, where its tip is at either end, and where its words go. */
interface Curve {
  cubic(cutStart: number, cutEnd: number): MarkPoint[];
  tipAt(atStart: boolean): [MarkPoint, number];
  wordsAt(t: number, off: number): MarkPoint;
  ends: [MarkPoint, MarkPoint];
}

/** The curve from the edge of box `a` to the edge of box `b`. It bows sideways by `bow` of its length. */
function curveOf(a: Placed, b: Placed, bow: number): Curve {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    long = Math.hypot(dx, dy) || 1;
  const mid: MarkPoint = [(a.x + b.x) / 2 - (dy / long) * bow * long, (a.y + b.y) / 2 + (dx / long) * bow * long];
  // where the curve leaves a's edge and meets b's, each found along the line to the bow's middle
  const p0 = edgeOf(a, mid),
    p3 = edgeOf(b, mid);
  const at = (t: number): MarkPoint => {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * mid[0] + t * t * p3[0], u * u * p0[1] + 2 * u * t * mid[1] + t * t * p3[1]];
  };
  const toward = (p: MarkPoint, q: MarkPoint, by: number): MarkPoint => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [p[0] + ((q[0] - p[0]) * by) / d, p[1] + ((q[1] - p[1]) * by) / d];
  };
  return {
    ends: [p0, p3],
    cubic(cutStart, cutEnd) {
      // the quadratic curve written as Graphviz's cubic one, its ends drawn in where an arrowhead takes their place
      const s = toward(p0, mid, cutStart),
        e = toward(p3, mid, cutEnd);
      return [
        s,
        [s[0] + (2 / 3) * (mid[0] - s[0]), s[1] + (2 / 3) * (mid[1] - s[1])],
        [e[0] + (2 / 3) * (mid[0] - e[0]), e[1] + (2 / 3) * (mid[1] - e[1])],
        e,
      ];
    },
    tipAt(atStart) {
      const tip = atStart ? p0 : p3;
      const angle = (Math.atan2(tip[1] - mid[1], tip[0] - mid[0]) * 180) / Math.PI;
      return [tip, angle];
    },
    wordsAt(t, off) {
      // words sit just above the line where it runs across, and beside it where it runs up or down
      const [x, y] = at(t);
      const flip = dx >= 0 ? -1 : 1;
      return [x - (dy / long) * off * flip, y + (dx / long) * off * flip];
    },
  };
}

/**
 * How far the link from `a` to `b` bows, as a share of its length, to clear a box still in its way. It bows away from
 * the box, just far enough. Nothing in its way, it does not bow.
 */
function aside(a: Placed, b: Placed, boxes: Iterable<Placed>): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    long = Math.hypot(dx, dy);
  if (long < 1e-6) return 0;
  const nx = -dy / long,
    ny = dx / long;
  let most = 0;
  for (const c of boxes) {
    if (c === a || c === b) continue;
    const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / (long * long);
    if (t <= 0.05 || t >= 0.95) continue;
    const off = (c.x - a.x) * nx + (c.y - a.y) * ny;
    const reach = Math.abs(nx) * c.hw + Math.abs(ny) * c.hh + CLEARANCE;
    if (Math.abs(off) >= reach) continue;
    // a curve's middle moves half as far as its bend. So it bends twice what it must clear, away from the box. The bend
    // is scaled by how near the box is to the middle, where the bend is widest.
    const bend = (-Math.sign(off || 1) * 2 * (reach + Math.abs(off))) / (4 * t * (1 - t)) / long;
    if (Math.abs(bend) > Math.abs(most)) most = bend;
  }
  return Math.max(-0.6, Math.min(0.6, most));
}

/**
 * Where each link's words go. They sit at the middle of the curve if they cover no box and no earlier words. Else they
 * take the first clear spot along it, either side. Words with no clear spot stay at the middle.
 */
function wordSpots(
  marks: readonly DrawMark[],
  boxes: ReadonlyMap<string, Placed>,
  curves: ReadonlyMap<string, Curve>,
): Map<string, MarkPoint> {
  const taken = [...boxes.values()].map((b) => ({ x0: b.x - b.hw, y0: b.y - b.hh, x1: b.x + b.hw, y1: b.y + b.hh }));
  const spots = new Map<string, MarkPoint>();
  for (const m of marks) {
    if (m.kind !== 'label' || m.of === undefined || boxes.has(m.of)) continue;
    const c = curves.get(m.of);
    if (!c) continue;
    const half = (m.maxWidth ?? m.text.length * m.size * 0.5) / 2 + 2,
      tall = m.size * 0.6;
    const boxAt = ([x, y]: MarkPoint) => ({ x0: x - half, y0: y - tall * 1.4, x1: x + half, y1: y + tall * 0.4 });
    let best: MarkPoint | null = null;
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75])
      for (const side of [1, -1]) {
        if (best) break;
        const p = c.wordsAt(t, side * m.size * WORDS_OFF);
        const r = boxAt(p);
        if (!taken.some((o) => r.x0 < o.x1 && o.x0 < r.x1 && r.y0 < o.y1 && o.y0 < r.y1)) best = p;
      }
    const at = best ?? c.wordsAt(0.5, m.size * WORDS_OFF);
    spots.set(m.id, at);
    taken.push(boxAt(at));
  }
  return spots;
}

/** Where the line from box `b`'s middle toward `p` crosses its edge. */
function edgeOf(b: Placed, p: MarkPoint): MarkPoint {
  const dx = p[0] - b.x,
    dy = p[1] - b.y;
  const k = Math.min(dx === 0 ? Infinity : b.hw / Math.abs(dx), dy === 0 ? Infinity : b.hh / Math.abs(dy), 1);
  return [b.x + dx * k, b.y + dy * k];
}

/** Whether `p` is nearer the curve's first end than its last. */
const nearer = (c: Curve, p: MarkPoint) =>
  Math.hypot(p[0] - c.ends[0][0], p[1] - c.ends[0][1]) < Math.hypot(p[0] - c.ends[1][0], p[1] - c.ends[1][1]);

/** The arrowhead of link `of`: its length, and whether it is at the link's first end. */
function headOf(marks: readonly DrawMark[], of: string | undefined): { size: number; atStart: boolean } | undefined {
  const head = marks.find((m) => m.kind === 'arrowhead' && m.of === of);
  if (!head || head.kind !== 'arrowhead') return undefined;
  const link = marks.find((m) => m.kind === 'link' && m.of === of);
  const first = link?.kind === 'link' ? link.points[0] : undefined,
    last = link?.kind === 'link' ? link.points[link.points.length - 1] : undefined;
  const gap = (p: MarkPoint | undefined) => (p ? Math.hypot(p[0] - head.x, p[1] - head.y) : Infinity);
  return { size: head.size, atStart: head.id.startsWith('tail:') || gap(first) < gap(last) };
}

/** `m` moved by (`dx`, `dy`), its outline too. */
function shifted(m: DrawMark, dx: number, dy: number): DrawMark {
  const move = (ps: readonly MarkPoint[]) => ps.map(([x, y]): MarkPoint => [x + dx, y + dy]);
  if (m.kind === 'link') return { ...m, points: move(m.points) };
  const out = { ...m, x: m.x + dx, y: m.y + dy } as DrawMark;
  if ('outline' in m && m.outline && 'outline' in out) out.outline = { ...m.outline, points: move(m.outline.points) };
  return out;
}

/** `laid` with its space grown to hold every mark, should a box have moved past its edge. */
function grown(laid: LaidMarks): LaidMarks {
  let x0 = 0,
    y0 = 0,
    x1 = laid.space.width,
    y1 = laid.space.height;
  for (const m of laid.marks) {
    if (m.id === 'background') continue;
    if (m.kind === 'box' || m.kind === 'group') {
      x0 = Math.min(x0, m.x);
      y0 = Math.min(y0, m.y);
      x1 = Math.max(x1, m.x + m.width);
      y1 = Math.max(y1, m.y + m.height);
    }
  }
  if (x0 >= 0 && y0 >= 0 && x1 <= laid.space.width && y1 <= laid.space.height) return laid;
  const dx = -x0,
    dy = -y0;
  const space = { width: x1 - x0, height: y1 - y0 };
  const marks = laid.marks.map((m) => {
    if (m.id !== 'background') return shifted(m, dx, dy);
    const { outline: _gone, ...rest } = m as DrawMark & { kind: 'box' };
    return { ...rest, x: 0, y: 0, width: space.width, height: space.height } as DrawMark;
  });
  return { ...laid, space, marks };
}
