// What a view shows (editor spec §7: views_agree_with_grafeo, empty_view): a view put to the graph the core already holds,
// never to a copy of it. The things it returns are those Grafeo returns for the view's query; the links are every link of
// the graph whose two ends are in the view (for how one thing reaches another, the links of the routes found; for a walked
// path, its steps in order). A view that matches nothing says so, in a sentence that also says what to change.
//
// Grafeo takes a quantified pattern such as -[]->{1,6} as a walk: it may use the same link again (found by running the
// queries, 11 Oct 2026). So a thing is on a route of up to k steps from a to b when its steps from a and its steps on to b
// add up to k or fewer, and a link is when the steps to its start, the link itself and the steps on from its end do:
// two breadth-first searches, however many routes there are.
import type { Graph } from '@graph-note/graph-spec';
import { pathsOf } from './paths.ts';
import type { PathReading } from './paths.ts';
import type { ViewSpec } from './view-profile.ts';

type Edge = Graph['edges'][number];

/** What a view returns: its things (ids), the links to draw with them (indexes into the graph's drawn links), and, when nothing matches, a sentence saying so. */
export interface ViewResult {
  things: string[];
  /** Indexes into `reading.graphs.get(graph).links`, in the order the view shows them (a walked path: by step). */
  links: number[];
  /** Set when the view matches nothing: `why` then says so and what to change. A blank drawing is never shown. */
  empty: boolean;
  why?: string;
  /** The names the view asks for that the graph does not hold; the rest of the view is still returned. */
  missing?: string[];
  /** A walked path only: the things stepped to, in order, a thing once for every time the walk reaches it. */
  walk?: string[];
}

const or = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);
const steps = (n: number) => `${n} step${n === 1 ? '' : 's'}`;

/** Nothing matches: no things, no links, and the sentence. */
const nothing = (why: string): ViewResult => ({ things: [], links: [], empty: true, why });

const noThing = (names: string[]) =>
  `No thing is called ${or(names)}: pick ${names.length > 1 ? 'others' : 'another'}, or change the view`;

/** The things one link away from a thing: forwards only, or either way. */
function neighbours(g: Graph, at: string, forwards: boolean, backwards: boolean): string[] {
  return [...(forwards ? g.out(at).map((e) => e[2]) : []), ...(backwards ? g.inc(at).map((e) => e[0]) : [])];
}

/** How many links each thing is from `start`, up to `most`, following links forwards, backwards or both. */
function spread(g: Graph, start: string, most: number, forwards: boolean, backwards: boolean): Map<string, number> {
  const dist = new Map([[start, 0]]);
  for (let frontier = [start], d = 1; frontier.length && d <= most; d++) {
    const next: string[] = [];
    for (const at of frontier)
      for (const to of neighbours(g, at, forwards, backwards))
        if (!dist.has(to)) {
          dist.set(to, d);
          next.push(to);
        }
    frontier = next;
  }
  return dist;
}

/**
 * A view put to a graph of a reading, giving what Grafeo gives for the view's query: a hand-picked set is the things named
 * that the graph holds; everything near a thing is it and whatever is 1 to 3 links from it in either direction; how one
 * thing reaches another is the things and links on the routes of up to 6 steps; some kinds is the things of those kinds;
 * a walked path is the Path and its steps in order. The links are indexes into the graph's drawn links. A view that
 * matches nothing is `empty`, with a sentence saying so and what to change. Things with no box (a schema's) are walked
 * through but never returned, as they are never drawn.
 */
export function evaluate(view: ViewSpec, reading: PathReading, graph: string): ViewResult {
  const drawing = reading.graphs.get(graph),
    g = reading.world[graph];
  // a graph with nothing written in it is not in the reading at all, so the two are said alike
  if (!drawing || !g || !drawing.boxes.length)
    return nothing(`Graph ${graph} has no things in this note: add some, or change the view`);
  const text = new Map(drawing.boxes.map((b) => [b.key, b.text])),
    say = (id: string) => text.get(id) ?? id,
    drawn = [...text.keys()];
  // the drawn links are the graph's links between drawn things, in order: the index of one is its place among them
  const index = new Map<Edge, number>();
  for (const e of g.edges) if (text.has(e[0]) && text.has(e[2])) index.set(e, index.size);
  const linksOf = (edges: Iterable<Edge>) =>
    [...new Set([...edges].flatMap((e) => index.get(e) ?? []))].sort((a, b) => a - b);
  const among = (ids: ReadonlySet<string>) => linksOf(g.edges.filter((e) => ids.has(e[0]) && ids.has(e[2])));
  const shown = (ids: ReadonlySet<string>): ViewResult => ({
    things: drawn.filter((id) => ids.has(id)),
    links: among(ids),
    empty: false,
  });

  switch (view.kind) {
    case 'picked': {
      const wanted = [...new Set(view.ids)],
        gone = wanted.filter((id) => !text.has(id)),
        here = wanted.filter((id) => text.has(id));
      if (!wanted.length) return nothing('Nothing is picked: pick a thing, or change the view');
      if (!here.length) return nothing(noThing(gone));
      return { things: here, links: among(new Set(here)), empty: false, ...(gone.length ? { missing: gone } : {}) };
    }
    case 'near': {
      if (!text.has(view.id)) return nothing(noThing([view.id]));
      // as Grafeo has it, a thing with no links is matched by no route, so nothing is near it
      if (!neighbours(g, view.id, true, true).length)
        return nothing(`${say(view.id)} has no links, so nothing is near it: pick another thing, or change the view`);
      return shown(new Set(spread(g, view.id, view.depth, true, true).keys()));
    }
    case 'reaches': {
      const gone = [view.from, view.to].filter((id) => !text.has(id));
      if (gone.length) return nothing(noThing([...new Set(gone)]));
      const { directed, steps: most } = view,
        from = spread(g, view.from, most, true, !directed),
        to = spread(g, view.to, most, !directed, true),
        // a link is on a route when the steps to its start, itself, and the steps on from its end are no more than `most`
        on = (a: string, b: string) => (from.get(a) ?? Infinity) + 1 + (to.get(b) ?? Infinity) <= most,
        used = g.edges.filter((e) => on(e[0], e[2]) || (!directed && on(e[2], e[0]))),
        ids = new Set(used.flatMap((e) => [e[0], e[2]]));
      if (!used.length) {
        const [a, b] = [say(view.from), say(view.to)];
        return nothing(
          directed
            ? `${a} does not reach ${b} in up to ${steps(most)}: allow either direction, or change the view`
            : `${a} and ${b} are not connected in up to ${steps(most)}: pick other things, or change the view`,
        );
      }
      return { things: drawn.filter((id) => ids.has(id)), links: linksOf(used), empty: false };
    }
    case 'kinds': {
      const wanted = new Set(view.kinds),
        here = new Set(drawn.filter((id) => [...(g.nodes.get(id)?.[0] ?? [])].some((k) => wanted.has(k))));
      if (!here.size) return nothing(`No thing is a ${or(view.kinds)}: pick other kinds, or change the view`);
      return shown(here);
    }
    case 'path': {
      const path = pathsOf(reading, graph).find((p) => p.id === view.path);
      if (!path || !g.has(view.path, 'Path'))
        return nothing(
          g.nodes.has(view.path)
            ? `${say(view.path)} is not a path: pick a path, or change the view`
            : `No path is called ${view.path}: pick another, or change the view`,
        );
      const walk = path.steps.filter((s) => !s.missing).map((s) => s.key);
      if (!walk.length)
        return nothing(
          path.empty
            ? `The path ${path.title} has no steps: record a walk, or change the view`
            : `Every step of the path ${path.title} is gone from the graph: restore a step, or change the view`,
        );
      const ordered = g
        .out(view.path, 'STEP')
        .map((e, i) => ({ e, at: typeof e[3].seq === 'number' ? e[3].seq : Infinity, i }))
        .sort((x, y) => x.at - y.at || x.i - y.i);
      return {
        things: [view.path, ...new Set(walk)].filter((id) => text.has(id)),
        links: ordered.flatMap((x) => index.get(x.e) ?? []),
        empty: false,
        walk,
      };
    }
  }
}
