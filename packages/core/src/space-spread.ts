// The 3D view laid out in space (editor spec §53, space_spread). Roger, 24 Oct 2026: "There should be spheres of varying
// sizes. Arrow heads should be shown and clear. Labels on arrows should be visible. Use the 3D space to make the
// connectors more obvious to see."
//
// The drawing's things and links are laid out again, in space, by the 3D force layout (layouts/force-3d.ts). So links
// a page would cross pass in front or behind. Each thing is a sphere. The more links it has, the larger it is: by the
// square root, so a hub stands out without hiding its neighbours. Each link runs straight from sphere to sphere, ending
// in an arrowhead on the sphere it points to. Two links between the same two things bow apart, so both show. A link's
// words float at its middle, and a thing's name just above its sphere. Host-free and pure.
import type { DrawMark } from './drawing-marks.ts';
import { FORCE_3D } from './layouts/layouts.ts';
import type { Spots } from './layouts/layouts.ts';
import type { GraphShape } from './types-shape.ts';
import { boundsOf } from './space-view.ts';
import type { Block, SpaceArrow, SpaceLabel, SpaceLine, SpaceMarks, Vec3 } from './space-view.ts';

/** How many pixels of the space one unit of the layout is: about one link's length. */
export const SPREAD_UNIT = 120;
/** A sphere's radius with no links, and how much it grows by the square root of its count of links. */
const RADIUS_LEAST = 12,
  RADIUS_GROWTH = 7,
  RADIUS_MOST = 46;
/** An arrowhead's length: a share of its link, kept between a least and a most. */
const ARROW_SHARE = 0.12,
  ARROW_LEAST = 12,
  ARROW_MOST = 22;
/** How far two links between the same things bow apart at their middle, as a share of their length. */
const BOW = 0.18;
/** How many straight pieces a bowed link is painted with. */
const BOW_STEPS = 12;
/** The size of a thing's name and of a link's words, in pixels of the space. */
const NAME_SIZE = 14,
  WORDS_SIZE = 11;

/** A thing's sphere radius, by its count of links. */
export const radiusOf = (links: number) => Math.min(RADIUS_MOST, RADIUS_LEAST + RADIUS_GROWTH * Math.sqrt(links));

/** The things and links of `marks`, as the layouts read them: each box that draws a thing, and links between them. */
export function shapeOfMarks(marks: readonly DrawMark[]): GraphShape {
  const things = new Map<string, string>();
  for (const m of marks)
    if (m.kind === 'box' && m.of !== undefined && !things.has(m.of)) things.set(m.of, m.name ?? m.of);
  const links: GraphShape['links'] = [];
  for (const m of marks)
    if (m.kind === 'link' && m.from !== undefined && m.to !== undefined && things.has(m.from) && things.has(m.to))
      links.push({ from: m.from, type: m.name ?? '', to: m.to });
  return { things: [...things].map(([key, text]) => ({ key, text, kinds: [] })), links };
}

/**
 * `marks` laid out in space as spheres and arrows, starting from `previous` spots where a thing has one. It gives
 * back the spots used too, so the next layout can start from them. Each sphere keeps the style of the box it stands for.
 */
export function spreadSpace(marks: readonly DrawMark[], previous?: Spots<3>): { space: SpaceMarks; spots: Spots<3> } {
  const shape = shapeOfMarks(marks);
  const spots = FORCE_3D.place(shape, previous);
  const count = new Map<string, number>();
  for (const l of shape.links)
    if (l.from !== l.to) for (const end of [l.from, l.to]) count.set(end, (count.get(end) ?? 0) + 1);
  const centre = new Map<string, Vec3>(),
    radius = new Map<string, number>();
  const blocks: Block[] = [];
  const labels: SpaceLabel[] = [];
  const done = new Set<string>();
  for (const m of marks) {
    if (m.kind !== 'box' || m.of === undefined || done.has(m.of)) continue;
    done.add(m.of);
    const [x, y, z] = spots.get(m.of) ?? [0, 0, 0];
    const c: Vec3 = [x * SPREAD_UNIT, y * SPREAD_UNIT, z * SPREAD_UNIT],
      r = radiusOf(count.get(m.of) ?? 0);
    centre.set(m.of, c);
    radius.set(m.of, r);
    const block: Block = {
      id: m.id,
      style: m.style,
      of: m.of,
      x: c[0] - r,
      y: c[1] - r,
      width: 2 * r,
      depth: 2 * r,
      floor: c[2] - r,
      tall: 2 * r,
    };
    if (m.name !== undefined) block.name = m.name;
    blocks.push(block);
  }
  // a thing's name is the words its label mark says, else its own name
  const named = new Map<string, DrawMark & { kind: 'label' }>();
  for (const m of marks) if (m.kind === 'label' && m.of !== undefined && !named.has(m.of)) named.set(m.of, m);
  for (const b of blocks) {
    const words = b.of === undefined ? undefined : named.get(b.of);
    const text = words?.text ?? b.name;
    if (!text || b.of === undefined) continue;
    const c = centre.get(b.of) as Vec3;
    labels.push({
      id: words?.id ?? `${b.id}\nname`,
      style: words?.style ?? b.style,
      at: [c[0], c[1], c[2] + b.tall / 2 + NAME_SIZE],
      text,
      size: NAME_SIZE,
      of: b.of,
    });
  }

  // links between the same two things, either way round, bow apart: each one's place among them, and how many there are
  const between = new Map<string, number>(),
    seen = new Map<string, number>();
  const pairOf = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);
  for (const m of marks)
    if (m.kind === 'link' && m.from !== undefined && m.to !== undefined && m.from !== m.to)
      between.set(pairOf(m.from, m.to), (between.get(pairOf(m.from, m.to)) ?? 0) + 1);
  const lines: SpaceLine[] = [];
  const arrows: SpaceArrow[] = [];
  for (const m of marks) {
    if (m.kind !== 'link' || m.from === undefined || m.to === undefined || m.from === m.to) continue;
    const a = centre.get(m.from),
      b = centre.get(m.to);
    if (!a || !b) continue;
    const pair = pairOf(m.from, m.to),
      many = between.get(pair) ?? 1,
      nth = seen.get(pair) ?? 0;
    seen.set(pair, nth + 1);
    const along = sub(b, a),
      length = Math.hypot(...along);
    if (length < 1e-9) continue;
    // the same side for both ways round, so a link and its reverse bow away from each other
    const side = norm(m.from < m.to ? sideOf(along) : sideOf(sub(a, b)));
    const bow = (nth - (many - 1) / 2) * BOW * length;
    const mid = add(scale(add(a, b), 0.5), scale(side, bow));
    const curve = (t: number): Vec3 =>
      add(add(scale(a, (1 - t) * (1 - t)), scale(mid, 2 * t * (1 - t))), scale(b, t * t));
    // where the link leaves its first sphere and meets its last: found along the curve, by the spheres' radii
    const ra = radius.get(m.from) ?? 0,
      rb = radius.get(m.to) ?? 0;
    const head = Math.min(ARROW_MOST, Math.max(ARROW_LEAST, length * ARROW_SHARE));
    const t0 = Math.min(0.45, ra / length),
      tTip = Math.max(0.55, 1 - rb / length),
      tEnd = Math.max(0.5, tTip - head / length);
    const steps = bow === 0 ? 1 : BOW_STEPS;
    const points = Array.from({ length: steps + 1 }, (_, i) => curve(t0 + ((tEnd - t0) * i) / steps));
    const line: SpaceLine = { id: m.id, style: m.style, points, from: m.from, to: m.to };
    if (m.name) line.words = m.name;
    if (m.of !== undefined) line.of = m.of;
    lines.push(line);
    arrows.push({ id: `${m.id}\narrow`, style: m.style, tip: curve(tTip), back: curve(tEnd), size: head });
    if (m.name)
      labels.push({ id: `${m.id}\nwords`, style: m.style, at: curve(0.5), text: m.name, size: WORDS_SIZE, link: m.id });
  }
  const space: SpaceMarks = { blocks, lines, labels, arrows, round: true, ...boundsOf(blocks, lines, labels) };
  return { space, spots };
}

/** A line square to `v` that is level, or across where `v` points straight up or down. */
function sideOf(v: Vec3): Vec3 {
  const level: Vec3 = [-v[1], v[0], 0];
  return Math.hypot(...level) > 1e-9 * Math.hypot(...v) ? level : [1, 0, 0];
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(...a) || 1));
