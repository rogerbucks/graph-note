// What a tap lands on or near (spec §3, tap_cycles_near): the areas of each box and link, read from the drawing's SVG as
// Graphviz writes it, and which of them are within reach of a point — nearest first. Tapping again in the same place
// takes the next. Host-free: a point is in the drawing's own units, the host turns a tap into one.

type Pt = [number, number];

export interface Shape {
  /** The element's id in the SVG: node1, edge2. */
  id: string;
  kind: 'node' | 'edge';
  /** Filled areas: a box, an arrowhead, a label. A tap inside one is on the thing. */
  polygons: Pt[][];
  /** Drawn lines: a link's curve. */
  lines: Pt[][];
}

export interface HitAreas {
  viewBox: { x: number; y: number; width: number; height: number };
  shapes: Shape[];
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const nums = (s: string): number[] => (s.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
const pairs = (ns: number[]): Pt[] => Array.from({ length: Math.floor(ns.length / 2) }, (_, i) => [ns[2 * i] ?? 0, ns[2 * i + 1] ?? 0]);

/** A path's points, as Graphviz writes paths — absolute M, L and C, each curve sampled along its length. */
function pathPoints(d: string): Pt[] {
  const out: Pt[] = [];
  for (const [, cmd, args] of d.matchAll(/([MLCZ])([^MLCZ]*)/gi)) {
    const ps = pairs(nums(args ?? ''));
    if (cmd?.toUpperCase() !== 'C') { out.push(...ps); continue; }
    for (let i = 0; i + 2 < ps.length; i += 3) {
      const [p0, p1, p2, p3] = [out[out.length - 1] ?? ps[i], ps[i], ps[i + 1], ps[i + 2]] as Pt[];
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, u = 1 - t, w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
        out.push([w[0] * p0![0] + w[1] * p1![0] + w[2] * p2![0] + w[3] * p3![0], w[0] * p0![1] + w[1] * p1![1] + w[2] * p2![1] + w[3] * p3![1]]);
      }
    }
  }
  return out;
}

/** The boxes and links of a drawing, with the areas a tap can land on, in the units of its viewBox. */
export function hitAreas(svg: string): HitAreas {
  const vb = nums(attr(/<svg\b[^>]*>/.exec(svg)?.[0] ?? '', 'viewBox') ?? '0 0 0 0');
  const transform = attr(/<g\b[^>]*class="graph"[^>]*>/.exec(svg)?.[0] ?? '', 'transform') ?? '';
  const [sx = 1, sy = sx] = nums(/scale\(([^)]*)\)/.exec(transform)?.[1] ?? '1');
  const [tx = 0, ty = 0] = nums(/translate\(([^)]*)\)/.exec(transform)?.[1] ?? '0 0');
  const place = ([x, y]: Pt): Pt => [sx * (x + tx), sy * (y + ty)];
  const shapes: Shape[] = [];
  for (const [, id, kind, body] of svg.matchAll(/<g\b[^>]*\bid="((node|edge)\d+)"[^>]*>([\s\S]*?)<\/g>/g)) {
    const s: Shape = { id: id ?? '', kind: kind as 'node' | 'edge', polygons: [], lines: [] };
    for (const [tag, name] of (body ?? '').matchAll(/<(path|polygon|polyline|ellipse|text)\b[^>]*>/g)) {
      if (name === 'polygon') s.polygons.push(pairs(nums(attr(tag, 'points') ?? '')).map(place));
      else if (name === 'polyline') s.lines.push(pairs(nums(attr(tag, 'points') ?? '')).map(place));
      else if (name === 'path') (kind === 'node' ? s.polygons : s.lines).push(pathPoints(attr(tag, 'd') ?? '').map(place));
      else if (name === 'ellipse') {
        const [cx = 0, cy = 0, rx = 0, ry = 0] = ['cx', 'cy', 'rx', 'ry'].map((a) => Number(attr(tag, a) ?? 0));
        s.polygons.push(Array.from({ length: 24 }, (_, i): Pt => place([cx + rx * Math.cos(i * Math.PI / 12), cy + ry * Math.sin(i * Math.PI / 12)])));
      } else if (kind === 'edge') {   // a link's label: the box its letters fill, about
        const text = /<text\b[^>]*>([^<]*)</.exec(body?.slice(body.indexOf(tag)) ?? '')?.[1] ?? '';
        const size = Number(attr(tag, 'font-size') ?? 14), x = Number(attr(tag, 'x') ?? 0), y = Number(attr(tag, 'y') ?? 0);
        const width = 0.6 * size * text.length, anchor = attr(tag, 'text-anchor');
        const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
        s.polygons.push(([[left, y - 0.8 * size], [left + width, y - 0.8 * size], [left + width, y + 0.2 * size], [left, y + 0.2 * size]] as Pt[]).map(place));
      }
    }
    shapes.push(s);
  }
  return { viewBox: { x: vb[0] ?? 0, y: vb[1] ?? 0, width: vb[2] ?? 0, height: vb[3] ?? 0 }, shapes };
}

function toSegment([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inside([px, py]: Pt, poly: Pt[]): boolean {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] as Pt, [xj, yj] = poly[j] as Pt;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) yes = !yes;
  }
  return yes;
}

/** How far a point is from a shape: nothing when it is inside one of its areas. */
function distanceTo(p: Pt, s: Shape): number {
  let best = Infinity;
  for (const poly of s.polygons) {
    if (inside(p, poly)) return 0;
    for (let i = 0; i < poly.length; i++) best = Math.min(best, toSegment(p, poly[i] as Pt, poly[(i + 1) % poly.length] as Pt));
  }
  for (const line of s.lines) for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, toSegment(p, line[i] as Pt, line[i + 1] as Pt));
  return best;
}

/** The ids of the boxes and links within `radius` of a point, nearest first; a box before a link at the same distance. */
export function nearby(areas: HitAreas, x: number, y: number, radius: number): string[] {
  return areas.shapes.map((s) => ({ s, d: distanceTo([x, y], s) })).filter(({ d }) => d <= radius)
    .sort((a, b) => a.d - b.d || (a.s.kind === b.s.kind ? 0 : a.s.kind === 'node' ? -1 : 1)).map(({ s }) => s.id);
}

/** Tapping again in the same place, with the same things near, selects the next of them; anywhere else, the nearest. */
export class TapCycle {
  private last: { x: number; y: number; ids: string; at: number } | null = null;
  private readonly same: number;
  /** `same`: how far apart, in the tap's units, two taps can be and still be in the same place. */
  constructor(same: number) { this.same = same; }

  tap(x: number, y: number, ids: string[]): string | null {
    if (!ids.length) { this.last = null; return null; }
    const l = this.last, key = ids.join(' ');
    const at = l && l.ids === key && Math.hypot(x - l.x, y - l.y) <= this.same ? (l.at + 1) % ids.length : 0;
    this.last = { x, y, ids: key, at };
    return ids[at] ?? null;
  }
}
