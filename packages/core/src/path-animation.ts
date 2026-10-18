// A played path exported as an animated SVG (editor spec §7, path_animation_export): CSS inside the file moves a heavier
// outline from step to step at the pace set, round and round, and a dot along the link between two steps that a link
// joins, forwards along the walk, so no encoder is needed and nothing is loaded from elsewhere. Every step is outlined
// and numbered on its thing, and the frame says the walk in order, so the still image tells it too (motion_not_alone);
// under `@media (prefers-reduced-motion: reduce)` every animation stops (motion_reduced_respected). One too large for
// the device is refused before anything is laid out, saying why and what would make it fit (animation_export_fits).
import { inImage, runnerOf, withStyleSheet } from './export-motion.ts';
import { STYLE } from './layout.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { Palette } from './palette.ts';
import { paceSaid } from './path-play.ts';
import type { WalkedPath } from './paths.ts';

/** Where an export is made: a phone takes a smaller animated SVG than a computer. */
export type Device = 'phone' | 'desktop';

/**
 * The most an animated SVG may hold on each device: steps, past which its style sheet grows long enough to stutter, and
 * bytes, its estimated size, past which a phone's browser or viewer opens it slowly or not at all.
 */
export const ANIMATION_LIMITS: Record<Device, { steps: number; bytes: number }> = {
  phone: { steps: 200, bytes: 2_000_000 },
  desktop: { steps: 1000, bytes: 8_000_000 },
};

/** A path played into an export, and its pace: how long each step is shown, in milliseconds. */
export interface ExportWalk {
  path: WalkedPath;
  pace: number;
}

/** Why an animated SVG is not made, and what would make it fit. */
export interface TooLargeToAnimate {
  why: string;
  fix: string;
}

/**
 * About how many bytes an animated SVG of this size takes: the drawing's things and links, and each step's share of the
 * style sheet and the drawing (its thing's keyframes and rule, a dot's runner and keyframes, its number, its words in
 * the frame), about 800 bytes.
 */
export const animationBytes = (x: { steps: number; things: number; links: number }): number =>
  2000 + x.things * 800 + x.links * 600 + x.steps * 800;

const where = (device: Device) => (device === 'phone' ? 'this phone' : 'this computer');

/**
 * Whether an animated SVG of a path of `steps` steps, over a drawing of `things` things and `links` links, fits `device`:
 * null when it does; otherwise why not and what would make it fit, said before anything is laid out.
 */
export function animationFits(
  x: { steps: number; things: number; links: number },
  device: Device,
): TooLargeToAnimate | null {
  const limit = ANIMATION_LIMITS[device];
  if (x.steps > limit.steps)
    return {
      why: `the path has ${x.steps} steps, more than the ${limit.steps} an animated SVG can play smoothly on ${where(device)}`,
      fix: `export a path of ${limit.steps} steps or fewer, such as part of this one recorded as a path of its own, or export the drawing as a still SVG`,
    };
  const bytes = animationBytes(x);
  if (bytes > limit.bytes)
    return {
      why: `the animated SVG would be about ${Math.round(bytes / 100_000) / 10} MB, more than the ${limit.bytes / 1_000_000} MB ${where(device)} opens smoothly`,
      fix: 'export a view that holds the path, so fewer things are drawn, or a shorter path',
    };
  return null;
}

/** A dot travelling a link between two steps: its edge (Graphviz's number), the step it leads to, and its way along. */
export interface Runner {
  edge: number;
  slot: number;
  /** Set when the walk goes against the line Graphviz drew, so the dot runs from its end to its start. */
  back: boolean;
}

/** What the animation shows in each step's slot of time: which things are outlined heavier, and where a dot runs. */
export interface PathPlan {
  steps: number;
  /** Each thing stepped on, by its node number (Graphviz's, from 1), and the slots (steps, from 0) it holds. */
  nodes: Map<number, number[]>;
  runners: Runner[];
}

/**
 * The plan of a path over a drawing: each step's thing (a step whose thing is not drawn holds its slot with nothing
 * outlined), and a dot for each two steps in a row that a drawn link joins, either way, the first such link written.
 * `reversed`: the links whose line Graphviz draws from their far end (link-flow.ts, `reversedLinks`).
 */
export function pathPlan(drawing: GraphDrawing, path: WalkedPath, reversed: readonly number[]): PathPlan {
  const node = new Map(drawing.boxes.map((b, i) => [b.key, i + 1]));
  const nodes = new Map<number, number[]>(),
    runners: Runner[] = [];
  path.steps.forEach((step, slot) => {
    const n = step.missing ? undefined : node.get(step.key);
    if (n !== undefined) nodes.set(n, [...(nodes.get(n) ?? []), slot]);
    const before = path.steps[slot - 1];
    if (!before || before.missing || step.missing) return;
    const link = drawing.links.findIndex(
      (l) => (l.from === before.key && l.to === step.key) || (l.from === step.key && l.to === before.key),
    );
    if (link < 0) return;
    const along = drawing.links[link]?.from === before.key;
    runners.push({ edge: link + 1, slot, back: along === reversed.includes(link) });
  });
  return { steps: path.steps.length, nodes, runners };
}

const pct = (slot: number, of: number) => `${Math.round((slot / of) * 10000) / 100}%`;
const justAfter = (slot: number, of: number) => `${(Math.round((slot / of) * 10000) + 1) / 100}%`;
const seconds = (ms: number) => `${Math.round(ms) / 1000}s`;
// every rule is written under the image's own class, so it reaches nothing of a page the SVG is put inline in
const shapes = (n: number) => ['path', 'polygon', 'ellipse'].map((s) => inImage(`#node${n} > ${s}`)).join(', ');

/** Where a thing's box starts, its least x and y, from the first shape of its group: a path, a polygon or an ellipse. */
function cornerOf(body: string): { x: number; y: number } | null {
  const ellipse = /<ellipse\b[^>]*\bcx="([-\d.]+)"[^>]*\bcy="([-\d.]+)"[^>]*\brx="([-\d.]+)"[^>]*\bry="([-\d.]+)"/.exec(
    body,
  );
  if (ellipse) {
    const [cx, cy, rx, ry] = ellipse.slice(1).map(Number);
    return { x: (cx ?? 0) - (rx ?? 0), y: (cy ?? 0) - (ry ?? 0) };
  }
  const shape = /<(?:path|polygon)\b[^>]*\b(?:d|points)="([^"]*)"/.exec(body)?.[1];
  const xs: number[] = [],
    ys: number[] = [];
  (shape?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).forEach((v, i) => (i % 2 ? ys : xs).push(v));
  return xs.length && ys.length ? { x: Math.min(...xs), y: Math.min(...ys) } : null;
}

/**
 * The drawn SVG (themed, before its frame) with the path in it: each step's number on its thing, at its top left (a
 * thing stepped on twice has both), and a dot's runner after the line of each link a dot travels.
 */
export function pathBody(svg: string, path: WalkedPath, plan: PathPlan, palette: Palette): string {
  return svg.replace(
    /(<g id="(node|edge)(\d+)"[^>]*>)([\s\S]*?)(<\/g>)/g,
    (all, open: string, kind: string, n: string, body: string, close: string) => {
      if (kind === 'node') {
        const slots = plan.nodes.get(Number(n));
        const at = slots ? cornerOf(body) : null;
        if (!slots || !at) return all;
        const numbers = slots.map((s) => String(path.steps[s]?.seq ?? s + 1)).join(', ');
        const mark =
          `<text class="thoughtknot-step-number" x="${at.x + 4}" y="${at.y + 12}" font-family="${STYLE.font},sans-Serif" ` +
          `font-size="${STYLE.kind_font_size}" font-weight="bold" fill="${palette.text}">${numbers}</text>`;
        return `${open}${body}${mark}${close}`;
      }
      const mine = plan.runners.flatMap((r, i) => (r.edge === Number(n) ? [i + 1] : []));
      const line = mine.length ? /<path\b[^>]*\/>/.exec(body)?.[0] : undefined;
      if (!line) return all;
      const copies = mine.map((k) =>
        runnerOf(line, 'thoughtknot-path-runner').replace('<path ', `<path id="thoughtknot-run-${k}" `),
      );
      return `${open}${body.replace(line, () => `${line}${copies.join('')}`)}${close}`;
    },
  );
}

/**
 * The style sheet that plays the path: every step's thing outlined (as it stays when nothing moves), the outline heavier
 * in its own slots, a slot each step at the pace set, round and round; each dot shown only in its slot, travelling its
 * link; and all of it still under reduced motion, the dots hidden. Only widths, offsets and opacity are set: the colours
 * are the drawing's own, in each shape's style attribute, which a style sheet does not override.
 */
export function pathCss(plan: PathPlan, pace: number): string {
  const round = seconds(plan.steps * pace),
    n = plan.steps,
    animated: string[] = [],
    out: string[] = [];
  for (const [node, slots] of plan.nodes) {
    const width = (s: number) => (slots.includes(s) ? 6 : 3);
    const frames = [`0% { stroke-width: ${width(0)}; }`];
    for (let s = 1; s < n; s++)
      if (width(s) !== width(s - 1)) frames.push(`${pct(s, n)} { stroke-width: ${width(s)}; }`);
    frames.push(`100% { stroke-width: ${width(n - 1)}; }`);
    out.push(`@keyframes thoughtknot-step-${node} { ${frames.join(' ')} }`);
    out.push(`${shapes(node)} { stroke-width: 3; animation: thoughtknot-step-${node} ${round} step-end infinite; }`);
    animated.push(shapes(node));
  }
  const runner = inImage('.thoughtknot-path-runner');
  out.push(`${runner} { fill: none; stroke-width: 6; stroke-linecap: round; stroke-dasharray: 0 200; opacity: 0; }`);
  plan.runners.forEach((r, i) => {
    const k = i + 1,
      [from, to] = r.back ? [-100, 0] : [0, -100];
    const frame = (at: string, opacity: number, offset: number) =>
      `${at} { opacity: ${opacity}; stroke-dashoffset: ${offset}; }`;
    // shown a hundredth of a per cent after its slot starts, and gone as soon after it ends: at once, to the eye
    const frames = [
      frame('0%', 0, from),
      frame(pct(r.slot, n), 0, from),
      frame(justAfter(r.slot, n), 1, from),
      frame(pct(r.slot + 1, n), 1, to),
      ...(r.slot + 1 < n ? [frame(justAfter(r.slot + 1, n), 0, to), frame('100%', 0, to)] : []),
    ];
    out.push(`@keyframes thoughtknot-run-${k} { ${frames.join(' ')} }`);
    const one = inImage(`#thoughtknot-run-${k}`);
    out.push(`${one} { stroke-dasharray: 0 200; animation: thoughtknot-run-${k} ${round} linear infinite; }`);
    animated.push(one);
  });
  out.push(
    `@media (prefers-reduced-motion: reduce) { ${animated.map((s) => `${s} { animation: none; }`).join(' ')} ${runner} { display: none; } }`,
  );
  return out.join('\n');
}

/** The walk in words, in order: "1 Home → 2 The park", a step whose thing is gone said so. */
export const walkSaid = (path: WalkedPath): string =>
  path.steps.map((s) => `${s.seq} ${s.text}${s.missing ? ' (not in the graph)' : ''}`).join(' → ');

/** How a played path is said under its title: played step by step at its pace, and the walk in order. */
export const pathSubtitle = (walk: ExportWalk): string =>
  `Played step by step, ${paceSaid(walk.pace).toLowerCase()}: ${walkSaid(walk.path)}`;

/** The legend's row for a played path: what the outlines, numbers and moving dot mean, in words. */
export const PATH_LEGEND =
  'Outlined and numbered: the steps of the path, in order; the heavier outline moves from step to step, and a dot travels a link between two steps';

/** The framed image with its path playing: the style sheet that plays it. */
export function withPath(svg: string, plan: PathPlan, pace: number): string {
  return withStyleSheet(svg, pathCss(plan, pace));
}
