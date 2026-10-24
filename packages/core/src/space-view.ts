// The numbers behind the 3D view (editor spec §53, scale_space_view). Roger, 22 Oct 2026: a 3D view of the same
// marks, one you switch to, never the default. It reads the marks a 2D drawing has; it needs no layout of its own.
//
// The marks are lifted off the page. Each box and group becomes a block: a floor, a height, and the box it stands on.
// What height means is picked by `DepthBy`:
// - `group`: a group inside another stands one floor higher, and each thing stands on its group, like a building.
// - `size`: each block is as tall as a number says, such as a group's count of things, like a city seen from the air.
// Links run between the tops of the blocks they join, rising in an arc. Labels float just above their block, and
// space-labels.ts picks which to paint.
//
// The orbit camera lives here too, as plain numbers: where it looks, how far away, its turn and its tilt. So the
// painters (display/graph-view/space-painter.ts) only paint, and every sum can be tested without a screen.
// Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import type { MarkPoint } from './plugin-diagrams.ts';

/** A point in the space: across, along and up. Up is the third number; along runs from the page's bottom to its top. */
export type Vec3 = [number, number, number];

/** A block: its corner on the floor, its size on the floor, where its floor is, and how tall it is. */
export interface Block {
  id: string;
  style: string;
  /** The key of the thing it stands for, when it stands for one. */
  of?: string;
  /** What a screen reader says for it. */
  name?: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  floor: number;
  tall: number;
}

/** A line through the space, painted in the colour of its style. */
export interface SpaceLine {
  id: string;
  style: string;
  points: Vec3[];
  /** The keys of the things it runs from and to, when it joins two. */
  from?: string;
  to?: string;
  /** What the link says, such as its relationship. */
  words?: string;
}

/** An arrowhead: its tip, a point back along its link where it is widest, and its length, in pixels of the space. */
export interface SpaceArrow {
  id: string;
  style: string;
  tip: Vec3;
  back: Vec3;
  size: number;
}

/** Words floating at a point, `size` pixels high when one pixel of the space is one pixel of the screen. */
export interface SpaceLabel {
  id: string;
  style: string;
  at: Vec3;
  text: string;
  size: number;
  /** The key of the thing it names, when it names one. */
  of?: string;
  /** The id of the link whose words these are, when they are a link's. */
  link?: string;
}

/** A drawing lifted into the space, and the box around it all. */
export interface SpaceMarks {
  blocks: Block[];
  lines: SpaceLine[];
  labels: SpaceLabel[];
  arrows: SpaceArrow[];
  /** Whether each block is painted as the ball inside it, rather than as a box (space-spread.ts). */
  round?: boolean;
  least: Vec3;
  most: Vec3;
}

/** What height means: floors by group, or a number for each mark by its id (or its thing's key). */
export type DepthBy = { by: 'group' } | { by: 'size'; sizes: ReadonlyMap<string, number> };

/** How far apart floors are, in pixels of the space. */
export const FLOOR_GAP = 160;
/** How tall a group's floor is: a thin slab. */
const SLAB = 6;
/** How tall the tallest block is, by size, as a share of the drawing's wider side. */
const TALLEST = 0.35;
/** How tall the shortest block is, so a block with a size of zero still shows. */
const SHORTEST = 4;
/** How high a link's arc rises at its middle, as a share of its length. */
const ARC = 0.18;
/** How many straight pieces a link's arc is painted with. */
const ARC_STEPS = 12;
/** How long an arrowhead is, and how large a link's words are, in pixels of the space. */
const ARROW = 10,
  WORDS = 11;

/** The page's down is the space's back, so the drawing reads the same way up when seen from the front. */
const along = (y: number) => -y;

/** `marks` lifted into the space, with height meaning what `depth` says. */
export function spaceOf(marks: readonly DrawMark[], depth: DepthBy): SpaceMarks {
  const groups = new Map<string, DrawMark & { kind: 'group' }>();
  for (const m of marks) if (m.kind === 'group') groups.set(m.id, m);
  // a group's floor is how deeply it nests: one floor up for each group around it
  const level = new Map<string, number>();
  const levelOf = (id: string, seen = 0): number => {
    const known = level.get(id);
    if (known !== undefined) return known;
    const around = groups.get(id)?.group;
    const n = around && groups.has(around) && seen < groups.size ? levelOf(around, seen + 1) + 1 : 0;
    level.set(id, n);
    return n;
  };
  let wide = 1,
    largest = 0;
  for (const m of marks)
    if (m.kind === 'box' || m.kind === 'group') wide = Math.max(wide, m.x + m.width, m.y + m.height);
  if (depth.by === 'size') for (const v of depth.sizes.values()) largest = Math.max(largest, v);

  const blocks: Block[] = [];
  const byKey = new Map<string, Block>();
  for (const m of marks) {
    if (m.kind !== 'box' && m.kind !== 'group') continue;
    let floor = 0,
      tall: number;
    if (depth.by === 'group') {
      // a thing stands on its group's slab; a thing in no group stands on the ground
      const on = m.kind === 'box' && m.group && groups.has(m.group) ? levelOf(m.group) : -1;
      floor = m.kind === 'group' ? levelOf(m.id) * FLOOR_GAP : on >= 0 ? on * FLOOR_GAP + SLAB : 0;
      tall = m.kind === 'group' ? SLAB : Math.max(SHORTEST, Math.min(m.width, m.height) / 2);
    } else {
      const size = depth.sizes.get(m.id) ?? (m.of === undefined ? undefined : depth.sizes.get(m.of)) ?? 0;
      tall = Math.max(SHORTEST, largest > 0 ? (size / largest) * wide * TALLEST : SHORTEST);
    }
    const block: Block = {
      id: m.id,
      style: m.style,
      x: m.x,
      y: along(m.y + m.height),
      width: m.width,
      depth: m.height,
      floor,
      tall,
    };
    if (m.of !== undefined) block.of = m.of;
    if (m.name !== undefined) block.name = m.name;
    blocks.push(block);
    byKey.set(m.id, block);
    if (m.of !== undefined && !byKey.has(m.of)) byKey.set(m.of, block);
  }
  const top = (b: Block | undefined) => (b ? b.floor + b.tall : 0);

  const lines: SpaceLine[] = [];
  const labels: SpaceLabel[] = [];
  const arrows: SpaceArrow[] = [];
  for (const m of marks) {
    if (m.kind === 'link') {
      const a = m.from === undefined ? undefined : byKey.get(m.from),
        b = m.to === undefined ? undefined : byKey.get(m.to);
      const line: SpaceLine = { id: m.id, style: m.style, points: arcOf(m.points, top(a), top(b)) };
      if (m.from !== undefined && m.to !== undefined) [line.from, line.to] = [m.from, m.to];
      if (m.name) line.words = m.name;
      lines.push(line);
      // an arrowhead where the link comes down onto the thing it points to, and its words at the top of its arc
      const tip = line.points[line.points.length - 1],
        back = line.points[line.points.length - 2];
      if (b && tip && back) arrows.push({ id: `${m.id}\narrow`, style: m.style, tip, back, size: ARROW });
      const middle = line.points[Math.floor(line.points.length / 2)];
      if (m.name && middle)
        labels.push({ id: `${m.id}\nwords`, style: m.style, at: middle, text: m.name, size: WORDS, link: m.id });
    } else if (m.kind === 'label') {
      const on = (m.of === undefined ? undefined : byKey.get(m.of)) ?? (m.group ? byKey.get(m.group) : undefined);
      const label: SpaceLabel = {
        id: m.id,
        style: m.style,
        at: [m.x, along(m.y), top(on) + m.size / 2],
        text: m.text,
        size: m.size,
      };
      if (m.of !== undefined) label.of = m.of;
      labels.push(label);
    }
  }
  return { blocks, lines, labels, arrows, ...boundsOf(blocks, lines, labels) };
}

/** A link's points in the space: from height `from` to height `to`, rising in an arc between. */
function arcOf(points: readonly MarkPoint[], from: number, to: number): Vec3[] {
  const first = points[0],
    last = points[points.length - 1];
  if (!first || !last) return [];
  // a link of two points is a straight line on the page: it gets an arc of its own; a longer one keeps its bends
  const flat: MarkPoint[] =
    points.length > 2
      ? [...points]
      : Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
          const t = i / ARC_STEPS;
          return [first[0] + (last[0] - first[0]) * t, first[1] + (last[1] - first[1]) * t] as MarkPoint;
        });
  const length = Math.hypot(last[0] - first[0], last[1] - first[1]);
  return flat.map((p, i) => {
    const t = flat.length > 1 ? i / (flat.length - 1) : 0;
    return [p[0], along(p[1]), from + (to - from) * t + Math.sin(Math.PI * t) * length * ARC];
  });
}

/** The corners of the box around every block, line and label. */
export function boundsOf(
  blocks: readonly Block[],
  lines: readonly SpaceLine[],
  labels: readonly SpaceLabel[],
): { least: Vec3; most: Vec3 } {
  const least: Vec3 = [Infinity, Infinity, 0],
    most: Vec3 = [-Infinity, -Infinity, 0];
  const take = (x: number, y: number, z: number) => {
    least[0] = Math.min(least[0], x);
    least[1] = Math.min(least[1], y);
    least[2] = Math.min(least[2], z);
    most[0] = Math.max(most[0], x);
    most[1] = Math.max(most[1], y);
    most[2] = Math.max(most[2], z);
  };
  for (const b of blocks) {
    take(b.x, b.y, b.floor);
    take(b.x + b.width, b.y + b.depth, b.floor + b.tall);
  }
  for (const l of lines) for (const p of l.points) take(p[0], p[1], p[2]);
  for (const l of labels) take(l.at[0], l.at[1], l.at[2]);
  if (least[0] > most[0]) return { least: [0, 0, 0], most: [0, 0, 0] };
  return { least, most };
}

/** Where the camera looks, how far away it is, its turn round the up line and its tilt above the floor, in radians. */
export interface Orbit {
  target: Vec3;
  distance: number;
  turn: number;
  tilt: number;
}

/** How wide the camera sees, top to bottom, in radians. */
export const FIELD = Math.PI / 4;
/** The lowest and highest tilt: never under the floor, and never straight down, where turning would spin. */
const TILT_LEAST = 0.08,
  TILT_MOST = Math.PI / 2 - 0.02;

/** The camera that shows all of `space`, from the front and above, as the drawing reads on the page. */
export function orbitFit(space: SpaceMarks, aspect = 1): Orbit {
  const { least, most } = space;
  const target: Vec3 = [(least[0] + most[0]) / 2, (least[1] + most[1]) / 2, (least[2] + most[2]) / 2];
  const reach = Math.hypot(most[0] - least[0], most[1] - least[1], most[2] - least[2]) / 2 || 1;
  const fit = Math.tan(FIELD / 2) * Math.min(1, aspect);
  return { target, distance: (reach / fit) * 1.05, turn: -Math.PI / 2, tilt: 0.9 };
}

/** `orbit` turned and tilted by a drag of `dx` and `dy` screen pixels. */
export function orbitBy(orbit: Orbit, dx: number, dy: number): Orbit {
  const tilt = Math.min(TILT_MOST, Math.max(TILT_LEAST, orbit.tilt + dy * 0.008));
  return { ...orbit, turn: orbit.turn - dx * 0.008, tilt };
}

/** `orbit` moved nearer by `times`, or further away below 1, never through what it looks at. */
export function zoomBy(orbit: Orbit, times: number): Orbit {
  return { ...orbit, distance: Math.max(1, orbit.distance / Math.max(0.01, times)) };
}

/** `orbit` looking at `point` from nearer, so a block can be focused on. */
export function focusOn(orbit: Orbit, point: Vec3, distance: number): Orbit {
  return { ...orbit, target: point, distance: Math.max(1, distance) };
}

/** Where the camera is. */
export function eyeOf(orbit: Orbit): Vec3 {
  const { target, distance, turn, tilt } = orbit;
  const flat = Math.cos(tilt) * distance;
  return [target[0] + Math.cos(turn) * flat, target[1] + Math.sin(turn) * flat, target[2] + Math.sin(tilt) * distance];
}

/**
 * The matrix taking a point of the space to the screen, for a screen `aspect` wide to each unit high. Its 16 numbers
 * are column by column, as WebGL and WebGPU read them. The screen's depth runs from -1 near to 1 far.
 */
export function spaceMatrix(orbit: Orbit, aspect: number, reach: number): Float32Array {
  const eye = eyeOf(orbit);
  const f = norm(sub(orbit.target, eye)),
    r = norm(cross(f, [0, 0, 1])),
    u = cross(r, f);
  const near = Math.max(0.5, orbit.distance - reach) / 4,
    far = orbit.distance + reach * 2 + 1;
  const sy = 1 / Math.tan(FIELD / 2),
    sx = sy / Math.max(1e-6, aspect);
  const a = (far + near) / (near - far),
    b = (2 * far * near) / (near - far);
  // the screen sum of the view (right, up, back) and then the perspective, written out as one matrix
  const view = [r, u, [-f[0], -f[1], -f[2]] as Vec3];
  const move = view.map((row) => -dot(row, eye));
  const [rv, uv, bv] = view as [Vec3, Vec3, Vec3];
  const [rm, um, bm] = move as [number, number, number];
  return new Float32Array([
    sx * rv[0], sy * uv[0], a * bv[0], -bv[0],
    sx * rv[1], sy * uv[1], a * bv[1], -bv[1],
    sx * rv[2], sy * uv[2], a * bv[2], -bv[2],
    sx * rm, sy * um, a * bm + b, -bm,
  ]); // prettier-ignore
}

/** Where `p` falls on a screen `width` by `height` pixels: its pixel, and how far away. Null when behind the camera. */
export function projectPoint(
  matrix: Float32Array,
  p: Vec3,
  width: number,
  height: number,
): { x: number; y: number; far: number } | null {
  const m = (i: number) => matrix[i] ?? 0;
  const cx = m(0) * p[0] + m(4) * p[1] + m(8) * p[2] + m(12),
    cy = m(1) * p[0] + m(5) * p[1] + m(9) * p[2] + m(13),
    w = m(3) * p[0] + m(7) * p[1] + m(11) * p[2] + m(15);
  if (w <= 1e-6) return null;
  return { x: ((cx / w + 1) / 2) * width, y: ((1 - cy / w) / 2) * height, far: w };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
