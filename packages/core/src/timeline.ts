// A timeline's order and what it shows (editor spec §15, timeline_order, timeline_show). It works out which things a
// timeline shows, and their places across it: by date, by number, as written or by links. Host-free. The Python
// library places them the same way (`graphspec/style/timeline.py`), held to it byte for byte (type_both_renderers).
import type { DiagramPlan } from './note-reading.ts';
import { dayOf } from './types-shape.ts';
import type { GraphShape, ShapeLink, ShapeThing } from './types-shape.ts';

/** Two names in the order a sort by name puts them, as JavaScript compares them (UTF-16 code units). */
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** How a timeline is ordered (timeline_order): by a date, by a number, as written, or by its links. */
export const TIMELINE_ORDERS = ['date', 'number', 'written', 'links'] as const;
/** One of the orders of a timeline. */
export type TimelineOrder = (typeof TIMELINE_ORDERS)[number];
/** What a timeline shows (timeline_show): every thing, only the dated things, or only the undated ones. */
export const TIMELINE_SHOWS = ['all', 'dated', 'undated'] as const;
/** One of the things a timeline shows. */
export type TimelineShow = (typeof TIMELINE_SHOWS)[number];

/** What a Diagram chooses of a timeline, each only for a timeline (style-graph.ts, `Diagram`). */
export interface TimelineChoice {
  /** How it is ordered; none, by date, else by links, else as written. */
  order?: TimelineOrder;
  /** For an order by date or number: the property it is ordered by; none, the first date, or the most used number. */
  by?: string;
  /** What it shows; none, every thing. */
  show?: TimelineShow;
}

/** The things a timeline shows (timeline_show): every thing, only those with a date, or only those without one. */
export function timelineShown(shape: GraphShape, show: TimelineChoice['show']): ShapeThing[] {
  if (show === 'dated') return shape.things.filter((t) => t.date !== undefined);
  if (show === 'undated') return shape.things.filter((t) => t.date === undefined);
  return shape.things;
}

/** The number property most of `things` carry; of two carried as often, the first by name. */
function mostNumbered(things: readonly ShapeThing[]): string | undefined {
  const count = new Map<string, number>();
  for (const t of things) for (const k of t.numbers?.keys() ?? []) count.set(k, (count.get(k) ?? 0) + 1);
  return [...count.keys()].sort((a, b) => (count.get(b) as number) - (count.get(a) as number) || byName(a, b))[0];
}

/**
 * The places of `things` along their `links`: each thing one place after the last of the things that link to it. They
 * are placed in the order written, each once the things before it are placed. In a loop, none is ready: the first
 * thing left is placed, after those placed already.
 */
function linkPlaces(things: readonly ShapeThing[], links: readonly ShapeLink[]): string[][] {
  const before = new Map<string, string[]>();
  for (const l of links) before.set(l.to, [...(before.get(l.to) ?? []), l.from]);
  const place = new Map<string, number>(),
    left = things.map((t) => t.key);
  while (left.length) {
    const ready = left.findIndex((k) => (before.get(k) ?? []).every((b) => place.has(b)));
    const k = left.splice(Math.max(0, ready), 1)[0] as string;
    const after = (before.get(k) ?? []).flatMap((b) => (place.has(b) ? [place.get(b) as number] : []));
    place.set(k, Math.max(-1, ...after) + 1);
  }
  const last = Math.max(...place.values());
  return Array.from({ length: last + 1 }, (_, p) => things.filter((t) => place.get(t.key) === p).map((t) => t.key));
}

/**
 * How a timeline is laid out (timeline_order, timeline_show): its things in places, first first, and those it hides.
 * - By date: each day a place, an instant on its day. The date is the property chosen, else each thing's first.
 * - By number: each number a place. The number is the property chosen, else the one most things carry.
 * - As written: each thing a place, in the order written.
 * - By links: each thing after the things that link to it.
 * Things without the date or number stand together in a last place. Say no order is chosen, or no thing shown carries
 * the value chosen. Then it is by date when a thing carries one, else by links when there are any, else as written.
 */
export function timelinePlan(shape: GraphShape, choice: TimelineChoice): DiagramPlan {
  const shown = timelineShown(shape, choice.show),
    keys = new Set(shown.map((t) => t.key));
  const links = shape.links.filter((l) => l.from !== l.to && keys.has(l.from) && keys.has(l.to));
  const by = choice.order === 'number' ? (choice.by ?? mostNumbered(shown)) : choice.by;
  const value = (order: TimelineOrder, t: ShapeThing): string | number | undefined => {
    if (order === 'number') return by === undefined ? undefined : t.numbers?.get(by);
    // a place is a day: an instant shares the place of a date on its day
    const date = choice.order === 'date' && by !== undefined ? t.dates?.get(by) : t.date;
    return date === undefined ? undefined : dayOf(date);
  };
  let order: TimelineOrder = choice.order ?? 'date';
  if ((order === 'date' || order === 'number') && !shown.some((t) => value(order, t) !== undefined))
    order = links.length ? 'links' : 'written';
  let dates: string[][];
  if (order === 'written') dates = shown.map((t) => [t.key]);
  else if (order === 'links') dates = linkPlaces(shown, links);
  else {
    const valued = shown.filter((t) => value(order, t) !== undefined);
    const places = [...new Set(valued.map((t) => value(order, t) as string | number))];
    places.sort(
      order === 'date' ? (a, b) => byName(a as string, b as string) : (a, b) => (a as number) - (b as number),
    );
    dates = places.map((p) => valued.filter((t) => value(order, t) === p).map((t) => t.key));
    const rest = shown.filter((t) => value(order, t) === undefined).map((t) => t.key);
    if (rest.length) dates.push(rest);
  }
  const hidden = shape.things.filter((t) => !keys.has(t.key)).map((t) => t.key);
  return { type: 'timeline', order, dates, ...(hidden.length ? { hidden } : {}) };
}
