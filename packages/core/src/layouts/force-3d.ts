// The force layout in three dimensions (editor spec §53, layout_force_3d). Roger, 24 Oct 2026: "The 3D view can use the
// 3D space. Rearrange the nodes so that they're optimal in the 3D space (along with the connectors)."
//
// As on a page (view-types/force-view.ts), links pull the things they join together and every pair of near things
// pushes apart. With depth to spread into, links that would cross on a page pass in front or behind. And a busy graph
// keeps more room round each thing.
//
// The same shape gives the same spots. Given last time's spots, it starts from them and takes fewer, smaller steps, so
// a small edit moves little (warm start). Things push apart only within nearby cubes of a grid. So each step costs
// about as much as the number of things. Units: a link is about one long. Host-free and pure.
import type { GraphShape } from '../types-shape.ts';

/** The most steps a layout takes. */
export const FORCE_3D_STEPS = 300;
/** The most work a layout does, as things times steps, so a big graph takes fewer steps. */
const WORK_MOST = 600_000;
/** How far apart two things push. Past this, they do not push at all. */
const REACH = 2;
/** How strongly every thing is pulled to the middle, so parts that do not link stay near. */
const PULL = 0.02;
/** How far a thing moves for each unit of force, until the heat caps it: weak forces still settle in time. */
const GAIN = 2;
/** The angle between one thing and the next on the starting spiral: the golden angle. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** The grid's cubes are numbered by these, so three whole numbers make one. */
const ROW = 1_000_003,
  FLOOR = ROW * 2_003;

/** Each thing's spot, by its key, in the layout's own units. */
export type Spots3 = ReadonlyMap<string, readonly [number, number, number]>;

/** Where each thing of `shape` sits in space, starting from `previous` where it has a spot. */
export function forceLayout3d(shape: GraphShape, previous?: Spots3): Map<string, [number, number, number]> {
  const keys = shape.things.map((t) => t.key);
  const n = keys.length;
  const out = new Map<string, [number, number, number]>();
  if (!n) return out;
  const index = new Map(keys.map((k, i) => [k, i]));
  const links: [number, number][] = [];
  for (const l of shape.links) {
    const a = index.get(l.from),
      b = index.get(l.to);
    if (a !== undefined && b !== undefined && a !== b) links.push([a, b]);
  }
  // start from last time's spots, else on a spiral over a ball that grows with the count
  const p = [new Float64Array(n), new Float64Array(n), new Float64Array(n)] as const;
  const at = (k: 0 | 1 | 2, i: number) => p[k][i] ?? 0;
  keys.forEach((key, i) => {
    const was = previous?.get(key);
    const up = 1 - (2 * (i + 0.5)) / n,
      round = Math.sqrt(Math.max(0, 1 - up * up)),
      r = 0.6 * Math.cbrt(i + 1);
    const [x, y, z] = was ?? [r * round * Math.cos(i * GOLDEN), r * round * Math.sin(i * GOLDEN), r * up];
    p[0][i] = x;
    p[1][i] = y;
    p[2][i] = z;
  });
  const warm = keys.some((key) => previous?.has(key));
  // on a warm start a new thing starts beside the placed things it links to, so it does not drag them from afar
  if (warm) {
    const placed = (j: number) => previous?.has(keys[j] ?? '') === true;
    const near = new Map<number, number[]>();
    const join = (i: number, j: number) => {
      if (placed(i) || !placed(j)) return;
      const here = near.get(i);
      if (here) here.push(j);
      else near.set(i, [j]);
    };
    for (const [a, b] of links) {
      join(a, b);
      join(b, a);
    }
    for (const [i, by] of near)
      for (const k of [0, 1, 2] as const) p[k][i] = by.reduce((s, j) => s + at(k, j), 0) / by.length + 0.1 * at(k, i);
  }
  const steps = Math.max(1, Math.floor(Math.min(FORCE_3D_STEPS, WORK_MOST / n) / (warm ? 4 : 1)));
  // space has more ways to drift than a page, so a warm start moves more gently than force-view.ts does
  const hottest = warm ? 0.05 : Math.max(1, Math.cbrt(n) / 2);
  const d = [new Float64Array(n), new Float64Array(n), new Float64Array(n)] as const;
  const cell = (i: number) =>
    Math.floor(at(0, i) / REACH) * FLOOR + Math.floor(at(1, i) / REACH) * ROW + Math.floor(at(2, i) / REACH);
  const push = (k: 0 | 1 | 2, i: number, by: number) => (d[k][i] = (d[k][i] ?? 0) + by);
  for (let s = 0; s < steps; s++) {
    const heat = (hottest * (steps - s)) / steps;
    for (const c of d) c.fill(0);
    const grid = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const c = cell(i);
      const here = grid.get(c);
      if (here) here.push(i);
      else grid.set(c, [i]);
    }
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(at(0, i) / REACH),
        gy = Math.floor(at(1, i) / REACH),
        gz = Math.floor(at(2, i) / REACH);
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++)
          for (let oz = -1; oz <= 1; oz++)
            for (const j of grid.get((gx + ox) * FLOOR + (gy + oy) * ROW + gz + oz) ?? []) {
              if (j <= i) continue;
              let ex = at(0, i) - at(0, j),
                ey = at(1, i) - at(1, j),
                ez = at(2, i) - at(2, j);
              let d2 = ex * ex + ey * ey + ez * ez;
              // two things in one place are pushed apart along a fixed slant, so the layout stays the same each time
              if (d2 < 1e-18) [ex, ey, ez, d2] = [((i - j) % 7) + 0.5, ((i + j) % 5) - 2.5, ((i * j) % 3) - 1, 1];
              if (d2 > REACH * REACH) continue;
              // the push fades to nothing at its reach, never stopping short, so things settle rather than shake
              const f = 1 / d2 - 1 / (REACH * REACH);
              push(0, i, ex * f);
              push(1, i, ey * f);
              push(2, i, ez * f);
              push(0, j, -ex * f);
              push(1, j, -ey * f);
              push(2, j, -ez * f);
            }
    }
    for (const [a, b] of links) {
      const ex = at(0, a) - at(0, b),
        ey = at(1, a) - at(1, b),
        ez = at(2, a) - at(2, b);
      const f = Math.hypot(ex, ey, ez);
      push(0, a, -ex * f);
      push(1, a, -ey * f);
      push(2, a, -ez * f);
      push(0, b, ex * f);
      push(1, b, ey * f);
      push(2, b, ez * f);
    }
    for (let i = 0; i < n; i++) {
      const mx = (d[0][i] ?? 0) - at(0, i) * PULL,
        my = (d[1][i] ?? 0) - at(1, i) * PULL,
        mz = (d[2][i] ?? 0) - at(2, i) * PULL;
      const m = Math.hypot(mx, my, mz);
      if (m < 1e-12) continue;
      const move = Math.min(m * GAIN, heat) / m;
      p[0][i] = at(0, i) + mx * move;
      p[1][i] = at(1, i) + my * move;
      p[2][i] = at(2, i) + mz * move;
    }
  }
  keys.forEach((key, i) => out.set(key, [at(0, i), at(1, i), at(2, i)]));
  return out;
}
