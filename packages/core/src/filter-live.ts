// The overview filtered live (editor spec §53, scale_filter_live). Roger, 22 Oct 2026: filtering a massive graph must
// rearrange what is kept in near real time, under 100 ms for 10,000 kept things. The kept groups close the gaps and
// glide to their new places. They are never laid out from scratch on screen.
//
// Two parts:
// - `filteredOverview` lays out only the kept things, in the whole graph's order. So the groups keep their order, and
//   the costly step of finding which groups link (louvain.ts) is never run again.
// - `glide` moves each mark from where it was to where it is now. A group kept stays the same mark and slides. A group
//   left empty shrinks to its centre and goes. A group back again grows from its centre.
//
// Host-free and pure. The scale benchmark (scripts/scale-benchmark.mjs) holds the time budget; the tests check the work.
import { drawOrder } from './drawing-marks.ts';
import type { DrawMark } from './drawing-marks.ts';
import { keptGrouping } from './facet-counts.ts';
import type { Chosen, FacetIndex } from './facet-counts.ts';
import type { LaidMarks } from './graphviz-marks.ts';
import { overviewOf, overviewOrder } from './overview.ts';
import type { MarkPoint } from './plugin-diagrams.ts';
import type { Grouping } from './scale-groups.ts';

/** How long the groups take to glide to their new places, in milliseconds. */
export const GLIDE_MS = 320;

/**
 * The overview of only the things `kept` names, or of the whole graph given null. `order` is the whole graph's order
 * (`overviewOrder`), so each kept group keeps its place in the order. It comes with the grouping it shows.
 */
export function filteredOverview(
  whole: Grouping,
  order: readonly (readonly string[])[],
  kept: ReadonlySet<string> | null,
): { grouping: Grouping; laid: LaidMarks } {
  const grouping = kept ? keptGrouping(whole, kept) : whole;
  return { grouping, laid: overviewOf(grouping, order) };
}

/** What a filter gives: which things it keeps by place in the keys, or null for all, and their overview. */
export interface Filtered {
  mask: Uint8Array | null;
  kept: number;
  grouping: Grouping;
  laid: LaidMarks;
}

/**
 * A massive graph's overview, ready to be filtered over and over. What every filter needs is worked out once: the
 * whole graph's order, and where each group's things are in the index's keys. So each filter only counts and lays out.
 */
export class LiveFilter {
  readonly whole: Grouping;
  readonly index: FacetIndex;
  readonly order: string[][];
  /** For each group, the place of each of its things in the index's keys. */
  private readonly places: Int32Array[];

  constructor(whole: Grouping, index: FacetIndex) {
    this.whole = whole;
    this.index = index;
    this.order = overviewOrder(whole);
    const at = new Map(index.keys.map((k, i) => [k, i]));
    this.places = whole.groups.map((g) => Int32Array.from(g.keys, (k) => at.get(k) ?? -1));
  }

  /** The overview of what `chosen` keeps; with nothing chosen, of the whole graph. */
  filter(chosen: Chosen): Filtered {
    if (!Object.values(chosen).some((v) => v.size)) {
      const kept = this.index.keys.length;
      return { mask: null, kept, grouping: this.whole, laid: overviewOf(this.whole, this.order) };
    }
    const mask = this.index.keptMask(chosen);
    const grouping = keptGrouping(this.whole, (g, j) => {
      const i = (this.places[g] as Int32Array)[j] as number;
      return i >= 0 && mask[i] === 1;
    });
    const kept = grouping.groups.reduce((n, g) => n + g.keys.length, 0);
    return { mask, kept, grouping, laid: overviewOf(grouping, this.order) };
  }
}

/** Eases `t` in and out, as a flight does: slow at each end. */
const ease = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
};

/** The number `e` of the way from `a` to `b`. */
const mix = (a: number, b: number, e: number) => a + (b - a) * e;

/** The centre of a mark: its box's middle, its own place, or the middle of its line. */
function centreOf(m: DrawMark): MarkPoint {
  if ('width' in m) return [m.x + m.width / 2, m.y + m.height / 2];
  if ('points' in m) {
    const a = m.points[0] ?? [0, 0],
      b = m.points.at(-1) ?? a;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }
  return 'x' in m ? [m.x, m.y] : [0, 0];
}

/** `m` shrunk to `k` of its size about its centre: 0 is a point, 1 is as it is. */
function scaled(m: DrawMark, k: number): DrawMark {
  const [cx, cy] = centreOf(m);
  const out = { ...m } as Record<string, unknown> & DrawMark;
  if ('width' in m)
    Object.assign(out, { x: mix(cx, m.x, k), y: mix(cy, m.y, k), width: m.width * k, height: m.height * k });
  if ('size' in m) out.size = m.size * k;
  if ('points' in m) out.points = m.points.map(([x, y]) => [mix(cx, x, k), mix(cy, y, k)] as MarkPoint);
  return out;
}

/** `b` as it is `e` of the way from `a`: each place, size and point between the two. */
function between(a: DrawMark, b: DrawMark, e: number): DrawMark {
  const out: Record<string, unknown> = { ...b };
  const was: Record<string, unknown> = { ...a };
  for (const key of ['x', 'y', 'width', 'height', 'size', 'maxWidth']) {
    const p = was[key],
      q = out[key];
    if (typeof p === 'number' && typeof q === 'number') out[key] = mix(p, q, e);
  }
  if ('points' in a && 'points' in b && a.points.length === b.points.length)
    out.points = b.points.map(([x, y], i) => {
      const [px, py] = a.points[i] ?? [x, y];
      return [mix(px, x, e), mix(py, y, e)] as MarkPoint;
    });
  return out as unknown as DrawMark;
}

/**
 * The marks gliding from `from` to `to`, at `t` from 0 to 1. At 0 they are where they were, and at 1 they are `to`
 * exactly. A mark in both slides. A mark only in `to` grows from its centre. A mark only in `from` shrinks to its
 * centre, and is gone at 1. Before 1 the marks come in drawing order, ready for `visibleOf`.
 */
export function glide(from: LaidMarks, to: LaidMarks): (t: number) => LaidMarks {
  const was = new Map(from.marks.map((m) => [m.id, m]));
  const now = new Set(to.marks.map((m) => m.id));
  // sorted once, so each frame's marks come in drawing order with no sorting
  const all = drawOrder([...to.marks, ...from.marks.filter((m) => !now.has(m.id))]);
  return (t) => {
    if (t >= 1) return to;
    const e = ease(t);
    const marks = all.map((m) => {
      if (!now.has(m.id)) return scaled(m, 1 - e);
      const a = was.get(m.id);
      return a && a.kind === m.kind ? between(a, m, e) : scaled(m, e);
    });
    const space = {
      width: mix(from.space.width, to.space.width, e),
      height: mix(from.space.height, to.space.height, e),
    };
    return { space, marks };
  };
}
