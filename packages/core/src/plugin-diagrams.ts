// Diagram types a plug-in adds (editor spec §54, trust_diagram_type_data). A diagram type:
// - is named under its plug-in's id, as a style graph names it (style-graph.ts, `pluginTypeOf`);
// - is given the graph's shape and the space to draw in, both frozen copies, and no host ability;
// - gives back marks as data: boxes, lines and text, each with where it goes. Never markup.
// The core checks every mark and draws them itself, escaping every label, so markup in a label shows as text.
import { pluginTypeOf } from './style-graph.ts';
import type { GraphShape } from './types-shape.ts';
import type { PluginCalls, PluginResult } from './plugin-calls.ts';

/** The space a diagram is drawn in, in pixels. */
export interface DiagramSpace {
  width: number;
  height: number;
}

/** A point in the space, as x and y. */
export type MarkPoint = [number, number];

/** A mark a diagram type gives back: a box, a line through points, or a piece of text. Each may name the thing it draws. */
export type DiagramMark =
  | { kind: 'box'; x: number; y: number; width: number; height: number; label?: string; thing?: string }
  | { kind: 'line'; points: MarkPoint[]; arrow?: boolean; thing?: string }
  | { kind: 'text'; x: number; y: number; text: string; thing?: string };

/** What a diagram type is given: the graph's shape and the space, frozen, and nothing else. */
export interface DiagramGiven {
  shape: GraphShape;
  space: DiagramSpace;
}

/** A diagram type a plug-in adds, such as a Sankey chart. */
export interface PluginDiagram {
  /** Its name, under its plug-in's own id, as a style graph chooses it: `acme.charts.sankey`. */
  type: string;
  /** What it is called where it is offered, in the host's language. */
  title: string;
  /** The marks that draw `given`. */
  draw: (given: DiagramGiven) => readonly DiagramMark[] | Promise<readonly DiagramMark[]>;
}

/** The most marks a diagram may give back. */
export const MARK_LIMIT = 5000;
/** The longest a label or a piece of text may be, in characters. */
export const LABEL_LIMIT = 500;

/** Why a diagram type the plug-in `pluginId` adds is refused, or null when it is accepted. */
export function diagramProblem(d: PluginDiagram, pluginId: string, taken: Map<string, string>): string | null {
  if (pluginTypeOf(d.type)?.plugin !== pluginId) return `the diagram type "${d.type}" is not named ${pluginId}.<word>`;
  if (taken.has(d.type)) return `the diagram type "${d.type}" is added already`;
  if (!d.title.trim() || /[\r\n]/.test(d.title)) return `the diagram type "${d.type}" has no title on one line`;
  if (typeof d.draw !== 'function') return `the diagram type "${d.type}" draws nothing`;
  return null;
}

/** A frozen copy of `value`, all the way down, so a plug-in cannot change what it was given. */
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}

/** What a diagram type is given: copies of the shape and the space, frozen. */
export function diagramGiven(shape: GraphShape, space: DiagramSpace): DiagramGiven {
  const copy: GraphShape = {
    things: shape.things.map((t) => ({ ...t, kinds: [...t.kinds] })),
    links: shape.links.map((l) => ({ ...l })),
    ...(shape.groups ? { groups: shape.groups.map(([g, keys]): [string, string[]] => [g, [...keys]]) } : {}),
  };
  return frozen({ shape: copy, space: { width: space.width, height: space.height } });
}

type Raw = Record<string, unknown>;

/** A copy of one mark, holding only what a mark may, or why it is refused. */
function markOf(raw: unknown, space: DiagramSpace): DiagramMark | string {
  if (!raw || typeof raw !== 'object') return 'a mark that is not an object';
  const m = raw as Raw;
  const inX = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= space.width;
  const inY = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= space.height;
  const words = (v: unknown) => typeof v === 'string' && v.length <= LABEL_LIMIT;
  if (m.thing !== undefined && !words(m.thing)) return 'a mark whose thing is not a short text';
  const thing = m.thing === undefined ? {} : { thing: m.thing as string };
  if (m.kind === 'box') {
    const { x, y, width: w, height: h, label } = m;
    if (!inX(x) || !inY(y) || !inX((x as number) + (w as number)) || !inY((y as number) + (h as number)))
      return 'a box outside the space it was given';
    if (label !== undefined && !words(label))
      return `a box whose label is not text of ${LABEL_LIMIT} characters or fewer`;
    const box = { kind: 'box' as const, x: x as number, y: y as number, width: w as number, height: h as number };
    return { ...box, ...(label === undefined ? {} : { label: label as string }), ...thing };
  }
  if (m.kind === 'line') {
    const points = Array.isArray(m.points) ? (m.points as unknown[]) : [];
    const at = (p: unknown) => Array.isArray(p) && p.length === 2 && inX(p[0]) && inY(p[1]);
    if (points.length < 2 || !points.every(at)) return 'a line that is not two or more points in the space';
    const line = { kind: 'line' as const, points: points.map((p) => [...(p as MarkPoint)] as MarkPoint) };
    return { ...line, ...(m.arrow === true ? { arrow: true } : {}), ...thing };
  }
  if (m.kind === 'text') {
    if (!inX(m.x) || !inY(m.y)) return 'a piece of text outside the space it was given';
    if (!words(m.text)) return `a piece of text that is not text of ${LABEL_LIMIT} characters or fewer`;
    return { kind: 'text', x: m.x as number, y: m.y as number, text: m.text as string, ...thing };
  }
  return `a mark of the kind ${JSON.stringify(m.kind)}, which is not a box, a line or text`;
}

/** Copies of the marks a diagram type gave back, or why they are refused. */
export function marksOf(raw: unknown, space: DiagramSpace): DiagramMark[] | string {
  if (!Array.isArray(raw)) return 'it gave back no list of marks';
  if (raw.length > MARK_LIMIT) return `it gave back ${raw.length} marks, over the ${MARK_LIMIT} allowed`;
  const marks: DiagramMark[] = [];
  for (const [i, r] of (raw as unknown[]).entries()) {
    const m = markOf(r, space);
    if (typeof m === 'string') return `mark ${i + 1} is ${m}`;
    marks.push(m);
  }
  return marks;
}

const escaped = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const num = (x: number) => String(Math.round(x * 100) / 100);
const thingOf = (m: DiagramMark) => (m.thing === undefined ? '' : ` data-thing="${escaped(m.thing)}"`);

/** One mark as SVG, every label and name escaped. */
function markSvg(m: DiagramMark): string {
  if (m.kind === 'box') {
    const rect = `<rect class="gn-mark-box" x="${num(m.x)}" y="${num(m.y)}" width="${num(m.width)}" height="${num(m.height)}"/>`;
    const label =
      m.label === undefined
        ? ''
        : `<text class="gn-mark-label" x="${num(m.x + m.width / 2)}" y="${num(m.y + m.height / 2)}" text-anchor="middle" dominant-baseline="middle">${escaped(m.label)}</text>`;
    return `<g${thingOf(m)}>${rect}${label}</g>`;
  }
  if (m.kind === 'line') {
    const points = m.points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
    const arrow = m.arrow ? ' marker-end="url(#gn-mark-arrow)"' : '';
    return `<polyline class="gn-mark-line"${thingOf(m)} points="${points}" fill="none"${arrow}/>`;
  }
  return `<text class="gn-mark-text"${thingOf(m)} x="${num(m.x)}" y="${num(m.y)}">${escaped(m.text)}</text>`;
}

/** The SVG the core draws from `marks`, in `space`: markup in any label or name is drawn as text. */
export function marksSvg(marks: readonly DiagramMark[], space: DiagramSpace): string {
  const arrow =
    '<defs><marker id="gn-mark-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z"/></marker></defs>';
  const w = num(space.width),
    h = num(space.height);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="gn-plugin-diagram" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${arrow}${marks.map(markSvg).join('')}</svg>`;
}

/** The SVG drawn from the marks `plugin`'s diagram type `d` gives for `shape` in `space`, each call timed; or why not. */
export async function drawnDiagram(
  plugin: string,
  d: PluginDiagram,
  shape: GraphShape,
  space: DiagramSpace,
  awaited: PluginCalls['awaited'],
): Promise<PluginResult<string>> {
  const what = `The diagram type ${d.title}`;
  const size = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (!size(space.width) || !size(space.height))
    return { ok: false, plugin, message: `${what} of ${plugin} was not drawn: the space has no width and height.` };
  const given = diagramGiven(shape, space);
  const r = await awaited(plugin, what, () => d.draw(given));
  if (!r.ok) return r;
  const marks = marksOf(r.value, given.space);
  if (typeof marks === 'string') return { ok: false, plugin, message: `${what} of ${plugin} was not drawn: ${marks}.` };
  return { ok: true, value: marksSvg(marks, given.space) };
}
