// The project plan view (editor spec §36, view_types_offered). Each thing is a row, with its name on the left. A thing
// with dates is a bar from its start to its end, across a line of days. A thing with only one date is a milestone, drawn
// as a diamond. A link is drawn from the end of one bar to the start of the next, so what waits on what shows. It is
// drawn as marks (drawing-marks.ts), so every painter draws it the same way.
//
// A thing's start is its `start` date, else the first date it carries. Its end is its `end` or `due` date, else the
// next date it carries on or after its start. Things with no date are listed after the rest, with no bar, so none is
// hidden.
//
// A key never holds a new line, so the ids this view joins with one never meet a thing's key.
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven, MarkPoint } from '../plugin-diagrams.ts';
import { dayOf, type ShapeThing } from '../types-shape.ts';

/** The share of the width kept for names on the left. */
const NAMES_SHARE = 0.25;
/** The share of a row's height a bar takes. */
const BAR_SHARE = 0.6;
/** The largest a name is drawn. */
const NAME_MOST = 12;
/** A day in milliseconds. */
const DAY = 86_400_000;

/** A thing's start and end days, YYYY-MM-DD, or null when it carries no date. The end is the start for a milestone. */
export function spanOf(t: ShapeThing): [string, string] | null {
  const dates = [...(t.dates?.values() ?? [])].map(dayOf);
  const start = t.dates?.get('start') ?? t.date;
  if (start === undefined) return null;
  const from = dayOf(start);
  const named = t.dates?.get('end') ?? t.dates?.get('due');
  const end = named !== undefined ? dayOf(named) : dates.find((d) => d > from);
  return [from, end !== undefined && end >= from ? end : from];
}

/** A day's place in time, in milliseconds. */
const time = (day: string): number => Date.parse(`${day}T00:00:00Z`);

/** The marks of `shape` drawn as a project plan in `space`. */
export function planMarks({ shape, space }: DiagramGiven): DrawMark[] {
  if (!shape.things.length) return [];
  const spans = new Map(shape.things.map((t) => [t.key, spanOf(t)]));
  // the dated things by start, then end, then as written; the undated after them, as written
  const order = shape.things
    .map((t, i) => [t, spans.get(t.key), i] as const)
    .sort(([, a, i], [, b, j]) => {
      if (!a || !b) return a ? -1 : b ? 1 : i - j;
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : i - j;
    })
    .map(([t]) => t);
  const dated = [...spans.values()].filter((s): s is [string, string] => s !== null);
  const first = dated.length ? Math.min(...dated.map(([s]) => time(s))) : 0;
  // the last day is drawn to its end, so a bar ending on it has width
  const last = dated.length ? Math.max(...dated.map(([, e]) => time(e))) + DAY : DAY;
  const names = space.width * NAMES_SHARE;
  const rh = space.height / order.length;
  const bh = rh * BAR_SHARE;
  const size = Math.min(NAME_MOST, rh * 0.6);
  const across = (day: number) => names + ((day - first) / (last - first)) * (space.width - names);
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  const bars = new Map<string, { x0: number; x1: number; y: number }>();
  const marks: DrawMark[] = [];
  order.forEach((t, r) => {
    const y = r * rh + (rh - bh) / 2;
    if (size >= 4)
      marks.push({
        kind: 'label',
        id: `${t.key}\nlabel`,
        of: t.key,
        style: 'text',
        x: names - 4,
        y: r * rh + rh / 2 + size / 3,
        text: t.text,
        size,
        anchor: 'end',
        maxWidth: Math.max(names - 8, 1),
      });
    const span = spans.get(t.key);
    if (!span) return;
    const x0 = across(time(span[0])),
      x1 = across(time(span[1]) + DAY);
    const milestone = span[0] === span[1] && !t.dates?.has('end') && !t.dates?.has('due');
    const w = milestone ? Math.min(bh, x1 - x0) : x1 - x0;
    const x = milestone ? x0 + (x1 - x0 - w) / 2 : x0;
    bars.set(t.key, { x0: x, x1: x + w, y: y + bh / 2 });
    marks.push({
      kind: 'box',
      id: t.key,
      of: t.key,
      style: milestone ? 'milestone' : 'bar',
      x,
      y,
      width: w,
      height: bh,
      ...(milestone ? { shape: 'diamond' as const } : {}),
      role: 'thing',
      name: span[0] === span[1] ? `${t.text} ${span[0]}` : `${t.text} ${span[0]} ${span[1]}`,
    });
  });
  shape.links.forEach((l, i) => {
    const a = bars.get(l.from),
      b = bars.get(l.to);
    if (!a || !b || l.from === l.to) return;
    // from the end of one bar, a short way right, down or up to the next bar's row, then into its start
    const out = Math.min(a.x1 + 4, space.width);
    const points: MarkPoint[] = [
      [a.x1, a.y],
      [out, a.y],
      [out, b.y],
      [Math.max(b.x0, 0), b.y],
    ];
    marks.push({
      kind: 'link',
      id: `link\n${i}`,
      style: 'link',
      points,
      from: l.from,
      to: l.to,
      role: 'link',
      name: `${text.get(l.from)} ${l.type} ${text.get(l.to)}`,
      z: -1,
    });
  });
  return marks;
}
