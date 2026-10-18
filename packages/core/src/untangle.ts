// Untangling a large graph (editor spec §25, slice 3). It covers a thing and its neighbours alone, and the legend
// bringing a kind or a relationship type forward or hiding it. It covers the shortest path between two things, finding
// a thing, and walking the links by arrow key. Host-free and pure: each says only what to show, hide or bring forward.
// So the host changes the drawing and nothing else (untangle_data_untouched). Nothing here is written to the note.
// Nothing is kept past the drawing but the legend's choices. A host writes those into the style graph when the user
// saves a view as shown (untangle-saved.ts).
import { adjacency, edgesOf, within } from './focus.ts';
import type { FocusDepth, FocusEdge, Kept } from './focus.ts';
import { propertiesOf } from './inspector.ts';
import type { GraphDrawing, NoteReading } from './note-reading.ts';
import type { LegendChoice } from './untangle-saved.ts';

const stepsWord = (n: number): string => `${n} step${n === 1 ? '' : 's'}`;
const SEPARATOR = ' · ';

/** The things within `steps` links of a thing and the links among them, either way along each: the drawing filtered to them. */
export function neighbourhood(edges: readonly FocusEdge[], key: string, steps: FocusDepth): Kept {
  const things = new Set(within(edges, key, steps).keys()),
    shown = new Set<number>();
  edges.forEach((e, i) => {
    if (things.has(e.from) && things.has(e.to)) shown.add(i);
  });
  return { things, edges: shown };
}

/** What the banner over a filtered drawing says: the filter, by the thing's words, and how far it reaches. */
export function neighbourhoodWords(text: string, reach: number): string {
  return `Showing only ${text} and the things within ${stepsWord(reach)} of it.`;
}

/** One line of the legend: a kind of thing or a relationship type of the drawing, and how many of it are drawn. */
export interface LegendItem {
  /** `kind:Option` or `type:ANSWERS`, which the host hands back to choose it. */
  id: string;
  what: 'kind' | 'type';
  name: string;
  /** What the legend says: the kind as written, a type as its reading. */
  label: string;
  count: number;
}

/** The kinds and relationship types of a drawing, kinds first, each by name, with how many of each are drawn. */
export function kindLegend(d: GraphDrawing): LegendItem[] {
  const kinds = new Map<string, number>(),
    types = new Map<string, { label: string; count: number }>();
  for (const b of d.boxes)
    for (const k of b.kind.split(SEPARATOR).filter(Boolean)) kinds.set(k, (kinds.get(k) ?? 0) + 1);
  for (const l of [...d.links, ...d.estimates.filter((e) => e.kind === 'name')]) {
    const t = types.get(l.type);
    types.set(l.type, { label: l.reading, count: (t?.count ?? 0) + 1 });
  }
  const byName = <T>(m: Map<string, T>) => [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return [
    ...byName(kinds).map(([name, count]): LegendItem => ({
      id: `kind:${name}`,
      what: 'kind',
      name,
      label: name,
      count,
    })),
    ...byName(types).map(([name, t]): LegendItem => ({
      id: `type:${name}`,
      what: 'type',
      name,
      label: t.label,
      count: t.count,
    })),
  ];
}

/** How the legend has a line: as it is, brought forward with the rest faded, or hidden. */
export type LegendState = 'normal' | 'forward' | 'hidden';

/**
 * The legend's choices for one drawing. Choosing a kind or a relationship type brings it forward and fades the rest.
 * Choosing it again hides it, and once more puts it back (untangle_legend). Held by the drawing alone. They are saved
 * only when the user saves a view as shown, written then by its host from `choices` (untangle-saved.ts). `restore`
 * gives them back when that view opens. Any other drawing opened again starts with every line as it is.
 */
export class LegendFilter {
  private readonly chosen = new Map<string, 'forward' | 'hidden'>();

  /** How a line stands now. */
  state(id: string): LegendState {
    return this.chosen.get(id) ?? 'normal';
  }

  /** Each line brought forward or hidden, as a view saved as shown keeps it: kinds first, then types, each by name. */
  choices(): LegendChoice[] {
    const order = (id: string) => (id.startsWith('kind:') ? 0 : 1);
    return [...this.chosen]
      .map(([id, state]) => ({ id, state }))
      .sort((a, b) => order(a.id) - order(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** Puts the lines as a view saved as shown keeps them, every other line as it is. */
  restore(choices: readonly LegendChoice[]): void {
    this.chosen.clear();
    for (const c of choices) if (c.state === 'forward' || c.state === 'hidden') this.chosen.set(c.id, c.state);
  }

  /** Moves a line on to its next state and says which it is in now: normal, forward, hidden, and round again. */
  choose(id: string): LegendState {
    const was = this.state(id);
    if (was === 'normal') this.chosen.set(id, 'forward');
    else if (was === 'forward') this.chosen.set(id, 'hidden');
    else this.chosen.delete(id);
    return this.state(id);
  }

  /** Whether any line is brought forward or hidden. */
  any(): boolean {
    return this.chosen.size > 0;
  }

  /** Puts every line back as it is. */
  reset(): void {
    this.chosen.clear();
  }

  /**
   * What the choices come to for a drawing and its links (`edgesOf`). `forward` is the things and links brought forward
   * (null when none is, so nothing is faded). `hidden` is what is hidden, with every link to a thing hidden. A kind
   * brought forward brings its things and the links among them; a type, its links and the things they join.
   */
  apply(d: GraphDrawing, edges: readonly FocusEdge[]): { forward: Kept | null; hidden: Kept } {
    const ofState = (state: 'forward' | 'hidden') => [...this.chosen].filter(([, s]) => s === state).map(([id]) => id);
    const kindsOf = (state: 'forward' | 'hidden') =>
        new Set(ofState(state).flatMap((id) => (id.startsWith('kind:') ? [id.slice(5)] : []))),
      typesOf = (state: 'forward' | 'hidden') =>
        new Set(ofState(state).flatMap((id) => (id.startsWith('type:') ? [id.slice(5)] : [])));
    const has = (kind: string, wanted: Set<string>) => kind.split(SEPARATOR).some((k) => wanted.has(k));
    const hidden: Kept = { things: new Set(), edges: new Set() };
    const [hiddenKinds, hiddenTypes] = [kindsOf('hidden'), typesOf('hidden')];
    for (const b of d.boxes) if (has(b.kind, hiddenKinds)) hidden.things.add(b.key);
    edges.forEach((e, i) => {
      if (hiddenTypes.has(e.type ?? '') || hidden.things.has(e.from) || hidden.things.has(e.to)) hidden.edges.add(i);
    });
    if (!ofState('forward').length) return { forward: null, hidden };
    const [forwardKinds, forwardTypes] = [kindsOf('forward'), typesOf('forward')];
    const forward: Kept = { things: new Set(), edges: new Set() };
    for (const b of d.boxes) if (has(b.kind, forwardKinds)) forward.things.add(b.key);
    const ofKinds = new Set(forward.things);
    edges.forEach((e, i) => {
      if (forwardTypes.has(e.type ?? '')) {
        forward.edges.add(i);
        forward.things.add(e.from);
        forward.things.add(e.to);
      } else if (ofKinds.has(e.from) && ofKinds.has(e.to)) forward.edges.add(i);
    });
    for (const t of hidden.things) forward.things.delete(t);
    for (const i of hidden.edges) forward.edges.delete(i);
    return { forward, hidden };
  }
}

/** A route between two things: the things along it in order, from the first, and the links it follows. */
export interface PathFound {
  things: string[];
  edges: number[];
}

/**
 * The shortest path between two things, by the fewest links, either way along each. On a tie, the one found first in
 * the drawing's order of links. A thing is no steps from itself. Null when no route joins them, or a thing is not
 * drawn.
 */
export function shortestPath(edges: readonly FocusEdge[], from: string, to: string): PathFound | null {
  const adj = adjacency(edges);
  if (from === to) return { things: [from], edges: [] };
  const came = new Map<string, [string, number] | null>([[from, null]]);
  for (let frontier = [from]; frontier.length && !came.has(to);) {
    const next: string[] = [];
    for (const at of frontier)
      for (const [i, other] of adj.get(at) ?? [])
        if (!came.has(other)) {
          came.set(other, [at, i]);
          next.push(other);
        }
    frontier = next;
  }
  if (!came.has(to)) return null;
  const things = [to],
    along: number[] = [];
  for (let at = came.get(to); at; at = came.get(at[0])) {
    things.unshift(at[0]);
    along.unshift(at[1]);
  }
  return { things, edges: along };
}

/** What is said of a path, or of there being none, by the words `text` gives each thing. */
export function pathWords(text: (key: string) => string, from: string, to: string, found: PathFound | null): string {
  if (!found) return `There is no path between ${text(from)} and ${text(to)}.`;
  return `The shortest path from ${text(from)} to ${text(to)} is ${stepsWord(found.edges.length)}: ${found.things.map(text).join(', ')}.`;
}

/** A thing found by a search: its key, its words, its kind, and why it matched — its name, or a property and its value. */
export interface Found {
  key: string;
  text: string;
  kind: string;
  via: string;
}

/** The most things a search lists; a longer list is cut here. */
export const FIND_LIMIT = 20;

/**
 * The things of a graph whose name or property value holds what was typed, whatever the case. The name is the id it is
 * written under, or its words. Names come first, then properties, each thing once, in the drawing's order
 * (untangle_find).
 */
export function find(reading: NoteReading, graph: string, query: string, limit = FIND_LIMIT): Found[] {
  const d = reading.graphs.get(graph),
    wanted = query.trim().toLowerCase();
  if (!d || !wanted) return [];
  const named = d.boxes.filter((b) => b.key.toLowerCase().includes(wanted) || b.text.toLowerCase().includes(wanted));
  const found: Found[] = named.slice(0, limit).map((b) => ({ key: b.key, text: b.text, kind: b.kind, via: 'name' }));
  const taken = new Set(named.map((b) => b.key));
  for (const b of d.boxes) {
    if (found.length >= limit) break;
    if (taken.has(b.key)) continue;
    const p = propertiesOf(reading, graph, { thing: b.key }).find((x) => x.value.toLowerCase().includes(wanted));
    if (p) found.push({ key: b.key, text: b.text, kind: b.kind, via: `${p.key}: ${p.value}` });
  }
  return found;
}

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Where an arrow key takes the selection from a thing, along its links (untangle_keyboard). It goes to the neighbour
 * most nearly in that direction, whichever way the link points. Null when none lies that way, or the key is no arrow.
 * `places` has the middle of each thing; without them, right and down go on through the thing's links, left and up
 * back.
 */
export function nextAlong(
  edges: readonly FocusEdge[],
  places: ReadonlyMap<string, { x: number; y: number }>,
  from: string,
  arrow: string,
): string | null {
  const dir = DIRECTIONS[arrow];
  const near = [...new Set((adjacency(edges).get(from) ?? []).map(([, other]) => other))].filter((k) => k !== from);
  if (!dir || !near.length) return null;
  const here = places.get(from);
  if (!here) return dir[0] + dir[1] > 0 ? (near[0] ?? null) : (near[near.length - 1] ?? null);
  let best: string | null = null,
    bestScore = Infinity;
  for (const k of near) {
    const p = places.get(k);
    if (!p) continue;
    const dx = p.x - here.x,
      dy = p.y - here.y,
      len = Math.hypot(dx, dy),
      cos = len ? (dx * dir[0] + dy * dir[1]) / len : 0;
    // within the half-plane that way; the smallest angle wins, the nearer on a tie
    const score = Math.acos(Math.min(1, cos)) + len * 1e-9;
    if (cos > 0 && score < bestScore) [best, bestScore] = [k, score];
  }
  return best;
}

/** What is brought forward when more than one thing asks: a path over the selection's focus over the legend's choice. */
export function emphasis(layers: { focus: Kept | null; forward: Kept | null; route: Kept | null }): Kept | null {
  return layers.route ?? layers.focus ?? layers.forward;
}

/** What the drawing shows, from all that has been chosen: what is brought forward (the rest faded) and what is hidden. */
export interface Layers {
  kept: Kept | null;
  hidden: Kept;
}

/**
 * The untangling of one drawing: the filter to a thing and its neighbours, the legend's choices and the path asked for.
 * They are held together and worked out into one picture (`layers`). It holds nothing of the note, only what the
 * drawing shows.
 */
export class Untangle {
  /** The legend's choices. */
  readonly legend = new LegendFilter();
  /** The thing the drawing is filtered to and how many steps out, if it is. */
  only: { key: string; steps: FocusDepth } | null = null;
  /** The two things a path was asked for between, and what was found: null for none. */
  routed: { from: string; to: string; found: PathFound | null } | null = null;
  /** The links of the drawing, as `edgesOf` gives them. */
  readonly edges: FocusEdge[];
  private readonly d: GraphDrawing;

  /** For one drawing; a view saved as shown with its legend's choices starts with them (untangle_legend). */
  constructor(d: GraphDrawing, legend: readonly LegendChoice[] = []) {
    this.d = d;
    this.edges = edgesOf(d);
    this.legend.restore(legend);
  }

  /** Filters the drawing to a thing and what lies within `steps` of it. */
  showOnly(key: string, steps: FocusDepth): void {
    this.only = { key, steps };
  }

  /** Shows the whole graph again. */
  showAll(): void {
    this.only = null;
  }

  /** Asks for the shortest path between two things; the path, or null when there is none. */
  route(from: string, to: string): PathFound | null {
    const found = shortestPath(this.edges, from, to);
    this.routed = { from, to, found };
    return found;
  }

  /** Drops the path. */
  clearRoute(): void {
    this.routed = null;
  }

  /** Whether anything is filtered, chosen or asked for. */
  active(): boolean {
    return this.only !== null || this.routed !== null || this.legend.any();
  }

  /** What to bring forward and what to hide, given what the selection keeps (null for no selection). */
  layers(focus: Kept | null): Layers {
    const { forward, hidden } = this.legend.apply(this.d, this.edges);
    const hide: Kept = { things: new Set(hidden.things), edges: new Set(hidden.edges) };
    if (this.only) {
      const shown = neighbourhood(this.edges, this.only.key, this.only.steps);
      for (const b of this.d.boxes) if (!shown.things.has(b.key)) hide.things.add(b.key);
      this.edges.forEach((_e, i) => {
        if (!shown.edges.has(i)) hide.edges.add(i);
      });
    }
    const found = this.routed?.found;
    const route = found ? { things: new Set(found.things), edges: new Set(found.edges) } : null;
    return { kept: emphasis({ focus, forward, route }), hidden: hide };
  }
}
