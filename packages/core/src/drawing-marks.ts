// Drawing marks: the one picture format every diagram type gives back (editor spec §43, plugin_interface). The
// built-in types and the plug-in types both draw as marks, so the core draws, checks and speeds up all of them alike.
// - A mark is data, never markup: a kind, numbers for where it goes, and a style token for how it looks.
// - Each mark has an id that stays the same between drawings, so a large drawing can change only what changed.
// - Text is a mark of its own, a label, so it can be measured, culled and read out on its own.
// - A mark may name the thing or link it draws, a group it sits in, its order on top, and words a screen reader says.
// - A link mark may name the keys of the two things it joins, so a renderer needs no lookup back into the graph.
// - Every number is in the drawing's own CSS pixels, at scale 1.
import type { DiagramMark, DiagramSpace, MarkPoint } from './plugin-diagrams.ts';

/** The kinds of mark: a box, a link through points, a label, an arrowhead, and a group drawn around other marks. */
export const DRAW_MARK_KINDS = ['box', 'link', 'label', 'arrowhead', 'group'] as const;
/** One kind of mark. */
export type DrawMarkKind = (typeof DRAW_MARK_KINDS)[number];

/** What a mark stands for, for a screen reader: a thing, a link, a group, or only a picture. */
export type DrawMarkRole = 'thing' | 'link' | 'group' | 'picture';

/** A box's outline. The core draws each one. */
export const BOX_SHAPES = ['rect', 'round', 'ellipse', 'diamond', 'cylinder', 'note', 'hexagon'] as const;
/** One box outline. */
export type BoxShape = (typeof BOX_SHAPES)[number];

/** What every mark has, whatever its kind. */
interface MarkCommon {
  /** The same id in every drawing of the same graph: the thing's key, or the link's key and a part number. */
  id: string;
  /** How it looks, as a token the theme sets, such as `thing` or `link.dashed`. Never colour or CSS. */
  style: string;
  /** The key of the thing or link it draws, when it draws one. */
  of?: string;
  /** The id of the group mark it sits in. */
  group?: string;
  /** Its order on top: higher is drawn later. Marks of the same order keep the order given. */
  z?: number;
  /** What a screen reader says for it. */
  name?: string;
  /** What it stands for, for a screen reader. */
  role?: DrawMarkRole;
  /** How wide its line is, when not the usual. */
  lineWidth?: number;
}

/**
 * The exact outline a layout drew a shape with: points, and whether they are a curve (a start, then sets of three). A
 * painter may draw it for a perfect match, or draw the shape from its kind and box instead.
 */
export interface MarkOutline {
  points: MarkPoint[];
  curve?: boolean;
}

/** A mark: where it goes, as numbers, by kind. */
export type DrawMark = MarkCommon &
  (
    | { kind: 'box'; x: number; y: number; width: number; height: number; shape?: BoxShape; outline?: MarkOutline }
    | { kind: 'link'; points: MarkPoint[]; curve?: boolean; from?: string; to?: string; outline?: MarkOutline }
    | {
        kind: 'label';
        x: number;
        y: number;
        text: string;
        size: number;
        anchor: 'start' | 'middle' | 'end';
        maxWidth?: number;
        /** The font's family, such as Helvetica, when the layout names one. */
        font?: string;
      }
    | { kind: 'arrowhead'; x: number; y: number; angle: number; size: number; outline?: MarkOutline }
    | { kind: 'group'; x: number; y: number; width: number; height: number; outline?: MarkOutline }
  );

/** A box around marks: its corner, width and height. */
export interface MarkBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The most marks one drawing may hold. A drawing of thousands of things fits. */
export const DRAW_MARK_LIMIT = 100_000;
/** The longest a label, an id, a name or a style token may be, in characters. */
export const DRAW_TEXT_LIMIT = 500;

const STYLE = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/;
const FONT = /^[A-Za-z][A-Za-z0-9 -]*$/;
/** The most points one outline may hold. */
const OUTLINE_LIMIT = 10_000;

/** A copy of an outline, held to finite points, or null when it is not one. */
function outlineOf(raw: unknown): MarkOutline | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const points = Array.isArray(o.points) ? (o.points as unknown[]) : [];
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const at = (p: unknown) => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]);
  if (points.length < 2 || points.length > OUTLINE_LIMIT || !points.every(at)) return null;
  if (o.curve === true && (points.length - 1) % 3 !== 0) return null;
  const copied = points.map((p) => [...(p as MarkPoint)] as MarkPoint);
  return { points: copied, ...(o.curve === true ? { curve: true } : {}) };
}
const ROLES: readonly string[] = ['thing', 'link', 'group', 'picture'];
const ANCHORS: readonly string[] = ['start', 'middle', 'end'];

type Raw = Record<string, unknown>;

/** A copy of one mark, holding only what a mark may, or why it is refused. */
function drawMarkOf(raw: unknown, space: DiagramSpace): DrawMark | string {
  if (!raw || typeof raw !== 'object') return 'not an object';
  const m = raw as Raw;
  const inX = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= space.width;
  const inY = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= space.height;
  const size = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= DRAW_TEXT_LIMIT;
  if (!text(m.id)) return 'a mark with no id';
  if (typeof m.style !== 'string' || !STYLE.test(m.style) || m.style.length > DRAW_TEXT_LIMIT)
    return `a mark whose style is not a token, such as thing or link.dashed`;
  for (const k of ['of', 'group', 'name'] as const)
    if (m[k] !== undefined && !text(m[k])) return `a mark whose ${k} is not a short text`;
  if (m.z !== undefined && !Number.isInteger(m.z)) return 'a mark whose order on top is not a whole number';
  if (m.role !== undefined && !ROLES.includes(m.role as string))
    return 'a mark whose role is not a thing, a link, a group or a picture';
  if (m.lineWidth !== undefined && !size(m.lineWidth)) return 'a mark whose line width is not a size';
  const outline = m.outline === undefined ? undefined : outlineOf(m.outline);
  if (outline === null) return 'a mark whose outline is not finite points, or a curve of a start and sets of three';
  const exact = outline ? { outline } : {};
  const common: MarkCommon = { id: m.id as string, style: m.style };
  for (const k of ['of', 'group', 'name', 'z', 'role', 'lineWidth'] as const)
    if (m[k] !== undefined) Object.assign(common, { [k]: m[k] });
  const area = () => {
    const { x, y, width: w, height: h } = m;
    return (
      size(w) && size(h) && inX(x) && inY(y) && inX((x as number) + (w as number)) && inY((y as number) + (h as number))
    );
  };
  const place = { x: m.x as number, y: m.y as number };
  if (m.kind === 'box' || m.kind === 'group') {
    if (!area()) return `a ${m.kind} outside the space it was given`;
    const rect = { ...place, width: m.width as number, height: m.height as number };
    if (m.kind === 'group') return { ...common, kind: 'group', ...rect, ...exact };
    if (m.shape !== undefined && !(BOX_SHAPES as readonly unknown[]).includes(m.shape))
      return `a box whose shape is not one of ${BOX_SHAPES.join(', ')}`;
    const shape = m.shape === undefined ? {} : { shape: m.shape as BoxShape };
    return { ...common, kind: 'box', ...rect, ...shape, ...exact };
  }
  if (m.kind === 'link') {
    const points = Array.isArray(m.points) ? (m.points as unknown[]) : [];
    const at = (p: unknown) => Array.isArray(p) && p.length === 2 && inX(p[0]) && inY(p[1]);
    if (points.length < 2 || !points.every(at)) return 'a link that is not two or more points in the space';
    if (m.curve === true && (points.length - 1) % 3 !== 0)
      return 'a curved link whose points are not a start and sets of three';
    for (const k of ['from', 'to'] as const)
      if (m[k] !== undefined && !text(m[k])) return `a link whose ${k} is not a short text`;
    const copied = points.map((p) => [...(p as MarkPoint)] as MarkPoint);
    const ends = {
      ...(m.from === undefined ? {} : { from: m.from as string }),
      ...(m.to === undefined ? {} : { to: m.to as string }),
    };
    return { ...common, kind: 'link', points: copied, ...(m.curve === true ? { curve: true } : {}), ...ends, ...exact };
  }
  if (m.kind === 'label') {
    if (!inX(m.x) || !inY(m.y)) return 'a label outside the space it was given';
    if (!text(m.text)) return `a label that is not text of ${DRAW_TEXT_LIMIT} characters or fewer`;
    if (!size(m.size)) return 'a label with no text size';
    if (!ANCHORS.includes(m.anchor as string)) return 'a label not anchored at its start, middle or end';
    if (m.maxWidth !== undefined && !size(m.maxWidth)) return 'a label whose widest is not a size';
    if (m.font !== undefined && (typeof m.font !== 'string' || !FONT.test(m.font) || m.font.length > 100))
      return 'a label whose font is not a family name';
    const label = { ...place, text: m.text as string, size: m.size as number, anchor: m.anchor as 'start' };
    return {
      ...common,
      kind: 'label',
      ...label,
      ...(m.maxWidth === undefined ? {} : { maxWidth: m.maxWidth as number }),
      ...(m.font === undefined ? {} : { font: m.font }),
    };
  }
  if (m.kind === 'arrowhead') {
    if (!inX(m.x) || !inY(m.y)) return 'an arrowhead outside the space it was given';
    if (typeof m.angle !== 'number' || !Number.isFinite(m.angle)) return 'an arrowhead with no angle';
    if (!size(m.size)) return 'an arrowhead with no size';
    return { ...common, kind: 'arrowhead', ...place, angle: m.angle, size: m.size as number, ...exact };
  }
  return `a mark of the kind ${JSON.stringify(m.kind)}, which is not one of ${DRAW_MARK_KINDS.join(', ')}`;
}

/** Copies of the marks a diagram type gave back, or why they are refused. Every id must be its own. */
export function drawMarksOf(raw: unknown, space: DiagramSpace): DrawMark[] | string {
  if (!Array.isArray(raw)) return 'it gave back no list of marks';
  if (raw.length > DRAW_MARK_LIMIT) return `it gave back ${raw.length} marks, over the ${DRAW_MARK_LIMIT} allowed`;
  const marks: DrawMark[] = [];
  const ids = new Set<string>();
  for (const [i, r] of (raw as unknown[]).entries()) {
    const m = drawMarkOf(r, space);
    if (typeof m === 'string') return `mark ${i + 1} is ${m}`;
    if (ids.has(m.id)) return `mark ${i + 1} has the id ${JSON.stringify(m.id)}, which an earlier mark has`;
    ids.add(m.id);
    marks.push(m);
  }
  const groups = new Set(marks.filter((m) => m.kind === 'group').map((m) => m.id));
  const lost = marks.find((m) => m.group !== undefined && !groups.has(m.group));
  if (lost)
    return `the mark ${JSON.stringify(lost.id)} sits in the group ${JSON.stringify(lost.group)}, which no group mark is`;
  return marks;
}

/** The box one mark covers. A label's is its anchor point, widened to its widest when it names one. */
export function markBounds(m: DrawMark): MarkBounds {
  if (m.kind === 'box' || m.kind === 'group') return { x: m.x, y: m.y, width: m.width, height: m.height };
  if (m.kind === 'link') {
    const xs = m.points.map((p) => p[0]),
      ys = m.points.map((p) => p[1]);
    const x = Math.min(...xs),
      y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  if (m.kind === 'arrowhead') return { x: m.x - m.size, y: m.y - m.size, width: m.size * 2, height: m.size * 2 };
  const w = m.maxWidth ?? 0;
  const left = m.anchor === 'start' ? m.x : m.anchor === 'end' ? m.x - w : m.x - w / 2;
  return { x: left, y: m.y - m.size, width: w, height: m.size };
}

/** The box all of `marks` cover, or null for none. */
export function marksBounds(marks: readonly DrawMark[]): MarkBounds | null {
  if (!marks.length) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const m of marks) {
    const b = markBounds(m);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** `marks` in the order they are drawn: by order on top, and in the order given where that is the same. */
export function drawOrder(marks: readonly DrawMark[]): DrawMark[] {
  return marks
    .map((m, i) => [m, i] as const)
    .sort(([a, i], [b, j]) => (a.z ?? 0) - (b.z ?? 0) || i - j)
    .map(([m]) => m);
}

/** A plug-in's marks (boxes, lines and text) in the one format. Ids come from the thing drawn and the place given. */
export function fromPluginMarks(marks: readonly DiagramMark[]): DrawMark[] {
  const out: DrawMark[] = [];
  for (const [i, m] of marks.entries()) {
    const id = `${m.thing ?? 'mark'}#${i}`;
    const of = m.thing === undefined ? {} : { of: m.thing };
    if (m.kind === 'box') {
      out.push({ id, style: 'plugin.box', kind: 'box', x: m.x, y: m.y, width: m.width, height: m.height, ...of });
      if (m.label !== undefined) {
        const centre = { x: m.x + m.width / 2, y: m.y + m.height / 2 };
        out.push({
          id: `${id}.label`,
          style: 'plugin.label',
          kind: 'label',
          ...centre,
          text: m.label,
          size: 12,
          anchor: 'middle',
          maxWidth: m.width,
          ...of,
        });
      }
    } else if (m.kind === 'line') {
      out.push({ id, style: 'plugin.line', kind: 'link', points: m.points.map((p) => [...p] as MarkPoint), ...of });
      if (m.arrow) {
        const [x0, y0] = m.points[m.points.length - 2] as MarkPoint,
          [x1, y1] = m.points[m.points.length - 1] as MarkPoint;
        const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
        out.push({ id: `${id}.arrow`, style: 'plugin.line', kind: 'arrowhead', x: x1, y: y1, angle, size: 8, ...of });
      }
    } else
      out.push({
        id,
        style: 'plugin.text',
        kind: 'label',
        x: m.x,
        y: m.y,
        text: m.text,
        size: 12,
        anchor: 'start',
        ...of,
      });
  }
  return out;
}
