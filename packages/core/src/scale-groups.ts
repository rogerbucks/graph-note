// The groups a massive graph opens as (editor spec §53, scale_groups; wiki/Massive-graphs-design.md, way E, step 2).
// Past the drawing limit, a graph is shown first as its groups, and a group's inside is laid out when it is opened. So
// every group must be small enough to lay out quickly, and make sense to the reader.
//
// The groups a person wrote come first:
// 1. The style graph's groups (spec §25, untangle_groups), when they hold at least half the things. The things left
//    over are grouped by their links.
// 2. Else the things' kinds, when there are from 2 to 200 of them.
// 3. Else groups found by how things link (louvain.ts), each named after its most linked thing.
// A group of more than `most` things is split by its own links, and in written order when its links cannot split it.
// Host-free and pure: the same graph gives the same groups, in the same order, every time.
import type { Box, GraphDrawing } from './note-reading.ts';
import { at, louvain } from './louvain.ts';

/** The most things a group holds by default: its inside lays out with Graphviz's quick settings in about 0.1 seconds. */
export const GROUP_MOST = 500;

/** The most kinds a graph is grouped by; past this many, an overview of kinds is a crowd, so links group it instead. */
const KINDS_MOST = 200;

/** Where a graph's groups come from. */
export type GroupedBy = 'style' | 'kind' | 'links';

/** One group: its id, the words it is shown with, where it came from, and its things' keys in written order. */
export interface ThingGroup {
  id: string;
  label: string;
  by: GroupedBy;
  keys: string[];
}

/** The links running between two groups, by the groups' places in the list, and how many there are. */
export interface GroupLink {
  from: number;
  to: number;
  links: number;
}

/** A graph as groups: how the groups were chosen, the groups, and the links between them. */
export interface Grouping {
  by: GroupedBy;
  groups: ThingGroup[];
  between: GroupLink[];
}

/**
 * A drawing with its links by place, a box's place being its place in `boxes`. It holds each link's two ends, and each
 * box's links (`out`, from `start[i]` to `start[i + 1]`) and how many it has. `local` is room to number a part's
 * things, -1 where unused. So splitting a part reads only that part's links.
 */
interface Linked {
  drawing: GraphDrawing;
  place: Map<string, number>;
  from: Int32Array;
  to: Int32Array;
  start: Int32Array;
  out: Int32Array;
  degree: Int32Array;
  local: Int32Array;
}

/** `drawing` with its links by place. A link to a thing not drawn is left out. */
function linked(drawing: GraphDrawing): Linked {
  const n = drawing.boxes.length,
    place = new Map(drawing.boxes.map((b, i) => [b.key, i])),
    from = new Int32Array(drawing.links.length),
    to = new Int32Array(drawing.links.length),
    start = new Int32Array(n + 1),
    degree = new Int32Array(n);
  drawing.links.forEach((l, e) => {
    const a = place.get(l.from) ?? -1,
      b = place.get(l.to) ?? -1;
    from[e] = a;
    to[e] = b;
    if (a < 0 || b < 0) return;
    start[a + 1] = at(start, a + 1) + 1;
    degree[a] = at(degree, a) + 1;
    degree[b] = at(degree, b) + 1;
  });
  for (let i = 0; i < n; i++) start[i + 1] = at(start, i + 1) + at(start, i);
  const fill = start.slice(0, n),
    out = new Int32Array(at(start, n));
  for (let e = 0; e < from.length; e++) {
    const a = at(from, e),
      b = at(to, e);
    if (a < 0 || b < 0) continue;
    out[at(fill, a)] = b;
    fill[a] = at(fill, a) + 1;
  }
  return { drawing, place, from, to, start, out, degree, local: new Int32Array(n).fill(-1) };
}

/** The things at `places` split into groups by the links among them. */
function byLinks({ start, out, local }: Linked, places: readonly number[]): number[][] {
  places.forEach((p, i) => (local[p] = i));
  const pairs: [number, number][] = [];
  for (const p of places)
    for (let e = at(start, p); e < at(start, p + 1); e++) {
      const q = at(local, at(out, e));
      if (q >= 0) pairs.push([at(local, p), q]);
    }
  for (const p of places) local[p] = -1;
  const found = louvain(places.length, pairs),
    groups: number[][] = [];
  found.forEach((g, i) => (groups[g] ??= []).push(at(places, i)));
  return groups;
}

/** `group` split into parts of at most `most`: by its own links first, then in written order. */
function split(links: Linked, group: number[], most: number, least: number): number[][] {
  if (group.length <= most) return [group];
  const parts = pooled(byLinks(links, group), least);
  if (parts.length > 1) return parts.flatMap((p) => split(links, p, most, least));
  return Array.from({ length: Math.ceil(group.length / most) }, (_, i) => group.slice(i * most, (i + 1) * most));
}

/**
 * Small groups pooled: groups of fewer than `least` things, such as things with no links at all, are put together in
 * written order. So the overview is not a crowd of single things.
 */
function pooled(groups: number[][], least: number): number[][] {
  const big = groups.filter((g) => g.length >= least),
    small = groups.filter((g) => g.length < least).flat();
  small.sort((a, b) => a - b);
  return small.length ? [...big, small] : big;
}

/** The groups the style graph names, by label, each with its things' places, in the order first written. */
function styleGroups({ drawing, place }: Linked): Map<string, number[]> {
  const groups = new Map<string, number[]>(),
    taken = new Set<number>();
  for (const n of drawing.nudges ?? []) {
    if (n.word !== 'group' || n.group === undefined) continue;
    for (const key of [n.thing, n.other]) {
      const at = key === undefined ? undefined : place.get(key);
      if (at === undefined || taken.has(at)) continue;
      taken.add(at);
      if (!groups.has(n.group)) groups.set(n.group, []);
      groups.get(n.group)?.push(at);
    }
  }
  return groups;
}

/** Each group's places named: the given label, else "Around" its most linked thing. Two the same are numbered. */
function named(
  { drawing, degree }: Linked,
  parts: { places: number[]; label?: string; by: GroupedBy }[],
): ThingGroup[] {
  const used = new Map<string, number>(),
    labels = new Map<string, number>();
  for (const p of parts) if (p.label !== undefined) labels.set(p.label, (labels.get(p.label) ?? 0) + 1);
  return parts.map(({ places, label, by }) => {
    places.sort((a, b) => a - b);
    const box = (p: number) => drawing.boxes[p] as Box;
    const keys = places.map((p) => box(p).key);
    const hub = box(places.reduce((best, p) => (at(degree, p) > at(degree, best) ? p : best)));
    const around = `around ${hub.text || hub.key}`;
    // a label written once for many groups, as a kind split in parts, says which part too
    const base =
      label === undefined ? `A${around.slice(1)}` : (labels.get(label) ?? 0) > 1 ? `${label}, ${around}` : label;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return { id: `group:${keys[0]}`, label: n > 1 ? `${base} (${n})` : base, by, keys };
  });
}

/** The links between groups, counted, in order of the groups they run from and to. */
function linksBetween({ from, to, drawing }: Linked, groups: ThingGroup[], parts: { places: number[] }[]): GroupLink[] {
  const of = new Int32Array(drawing.boxes.length);
  parts.forEach((g, i) => g.places.forEach((p) => (of[p] = i)));
  const count = new Map<number, number>();
  for (let e = 0; e < from.length; e++) {
    if (at(from, e) < 0 || at(to, e) < 0) continue;
    const a = at(of, at(from, e)),
      b = at(of, at(to, e));
    if (a === b) continue;
    const key = a * groups.length + b;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return [...count]
    .sort(([x], [y]) => x - y)
    .map(([key, links]) => ({ from: Math.floor(key / groups.length), to: key % groups.length, links }));
}

/**
 * The groups `drawing` opens as, none over `most` things. Groups smaller than `least` are pooled, so things with no
 * links are not each a group of their own.
 */
export function groupsOf(drawing: GraphDrawing, most = GROUP_MOST, least = 5): Grouping {
  const all = drawing.boxes.map((_, i) => i),
    links = linked(drawing);
  const style = styleGroups(links),
    styled = [...style.values()].reduce((n, g) => n + g.length, 0);
  const kindCount = new Set(drawing.boxes.map((b) => b.kind)).size;
  let by: GroupedBy;
  let parts: { places: number[]; label?: string; by: GroupedBy }[];
  if (styled * 2 >= all.length && style.size) {
    by = 'style';
    const taken = new Set([...style.values()].flat());
    const rest = all.filter((i) => !taken.has(i));
    parts = [
      ...[...style].flatMap(([label, places]) =>
        split(links, places, most, least).map((p) => ({ places: p, label, by: 'style' as const })),
      ),
      ...pooled(rest.length ? byLinks(links, rest) : [], least)
        .flatMap((p) => split(links, p, most, least))
        .map((places) => ({ places, by: 'links' as const })),
    ];
  } else if (kindCount >= 2 && kindCount <= KINDS_MOST) {
    by = 'kind';
    const kinds = new Map<string, number[]>();
    drawing.boxes.forEach(({ kind }, i) => {
      if (!kinds.has(kind)) kinds.set(kind, []);
      kinds.get(kind)?.push(i);
    });
    parts = [...kinds].flatMap(([kind, places]) =>
      split(links, places, most, least).map((p) => ({ places: p, label: kind, by: 'kind' as const })),
    );
  } else {
    by = 'links';
    parts = pooled(byLinks(links, all), least)
      .flatMap((p) => split(links, p, most, least))
      .map((places) => ({ places, by: 'links' as const }));
  }
  const groups = named(links, parts);
  return { by, groups, between: linksBetween(links, groups, parts) };
}
