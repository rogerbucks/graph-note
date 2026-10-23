// Filters with counts on a massive graph (editor spec §53, scale_facet_counts). Roger, 22 Oct 2026: beside each kind
// or property value, say how many things it holds. The counts follow the other filters already chosen, so the reader
// sees what a choice would leave before making it.
//
// A facet is one way to sort things: their kind, or one property. Each thing has at most one value in each facet. A
// filter keeps the things whose value is one of those chosen. Facets combine: a thing is kept when every facet with a
// choice keeps it. A facet's own counts ignore its own choice, as is usual for faceted search, so its other values
// still show what choosing them would add.
//
// Host-free and pure. Counting is one pass over the things for each facet.
import type { GroupLink, Grouping, ThingGroup } from './scale-groups.ts';

/** One facet: its name, and each thing's value in it, by the thing's place in the keys; undefined where it has none. */
export interface Facet {
  name: string;
  values: readonly (string | undefined)[];
}

/** What is chosen: for each facet by name, the values kept. A facet not named, or named with none, keeps everything. */
export type Chosen = Readonly<Record<string, ReadonlySet<string>>>;

/** One value of a facet, with how many things it would hold under the other facets' choices. */
export interface FacetCount {
  value: string;
  count: number;
}

/** The things of a graph, sorted by facets, ready to be filtered and counted. */
export class FacetIndex {
  readonly keys: readonly string[];
  readonly facets: readonly Facet[];
  /** Each facet's values, most common first, ties by name, so the list keeps its order as choices change. */
  private readonly order: string[][];

  constructor(keys: readonly string[], facets: readonly Facet[]) {
    this.keys = keys;
    this.facets = facets;
    this.order = facets.map((f) => {
      const n = new Map<string, number>();
      for (const v of f.values) if (v !== undefined) n.set(v, (n.get(v) ?? 0) + 1);
      return [...n].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0)).map(([v]) => v);
    });
  }

  /** Whether the thing at place `i` is kept by every facet's choice but `skip`'s. */
  private keeps(i: number, chosen: Chosen, skip = -1): boolean {
    for (let f = 0; f < this.facets.length; f++) {
      if (f === skip) continue;
      const facet = this.facets[f] as Facet;
      const want = chosen[facet.name];
      if (!want || !want.size) continue;
      const v = facet.values[i];
      if (v === undefined || !want.has(v)) return false;
    }
    return true;
  }

  /** The keys of the things kept by `chosen`, in written order. */
  kept(chosen: Chosen): string[] {
    return this.keys.filter((_, i) => this.keeps(i, chosen));
  }

  /**
   * Each facet's values with their counts under the other facets' choices. Every value is listed, those left with
   * none at zero, in the same order whatever is chosen.
   */
  counts(chosen: Chosen): Map<string, FacetCount[]> {
    const out = new Map<string, FacetCount[]>();
    this.facets.forEach((facet, f) => {
      const n = new Map<string, number>((this.order[f] ?? []).map((v) => [v, 0]));
      for (let i = 0; i < this.keys.length; i++) {
        const v = facet.values[i];
        if (v !== undefined && this.keeps(i, chosen, f)) n.set(v, (n.get(v) ?? 0) + 1);
      }
      out.set(
        facet.name,
        [...n].map(([value, count]) => ({ value, count })),
      );
    });
    return out;
  }
}

/** The most values a property may take and still be a filter: past this, it names things rather than sorts them. */
export const FACET_VALUES_MOST = 30;

/** A property value as the words a filter lists, or undefined for one that sorts nothing, such as a list. */
function wordsOf(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v && typeof v === 'object' && 's' in v) return String(v.s);
  return undefined;
}

/**
 * The facets of a graph's things: their kind, then each property that sorts them. A property sorts them when at least
 * two things have it and it takes at most `FACET_VALUES_MOST` values. `props` gives a thing's properties by its key.
 */
export function facetsOf(
  things: readonly { key: string; kind: string }[],
  props: (key: string) => Readonly<Record<string, unknown>> = () => ({}),
  kindName = 'Kind',
): Facet[] {
  const columns = new Map<string, (string | undefined)[]>();
  things.forEach((t, i) => {
    for (const [name, v] of Object.entries(props(t.key))) {
      if (name === 'id') continue;
      const words = wordsOf(v);
      if (words === undefined) continue;
      let column = columns.get(name);
      if (!column) columns.set(name, (column = new Array<string | undefined>(things.length)));
      column[i] = words;
    }
  });
  const sorts = ([, values]: [string, (string | undefined)[]]) => {
    const set = new Set(values.filter((v) => v !== undefined));
    return values.filter((v) => v !== undefined).length >= 2 && set.size <= FACET_VALUES_MOST;
  };
  return [
    { name: kindName, values: things.map((t) => t.kind) },
    ...[...columns]
      .filter(sorts)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, values]) => ({ name, values: Array.from(values) })),
  ];
}

/**
 * `grouping` with only the things `kept` names. Each group keeps its kept things in their order. A group left empty is
 * taken away, with its links to other groups. The groups that stay keep their order. Link counts stay the whole graph's.
 */
export function keptGrouping(grouping: Grouping, kept: ReadonlySet<string>): Grouping {
  const place = new Map<number, number>();
  const groups: ThingGroup[] = [];
  grouping.groups.forEach((g, i) => {
    const keys = g.keys.filter((k) => kept.has(k));
    if (!keys.length) return;
    place.set(i, groups.length);
    groups.push({ ...g, keys });
  });
  const between: GroupLink[] = [];
  for (const l of grouping.between) {
    const from = place.get(l.from),
      to = place.get(l.to);
    if (from !== undefined && to !== undefined) between.push({ ...l, from, to });
  }
  return { by: grouping.by, groups, between };
}
