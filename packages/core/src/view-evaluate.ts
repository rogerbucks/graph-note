// What a view shows (editor spec §7: views_agree_with_grafeo, empty_view). It is a view put to the graph the core
// already holds, never to a copy of it. The things it returns are those Grafeo returns for the view's query. The links
// are every link of the graph whose two ends are in the view. For how one thing reaches another, they are the links of
// the routes found. For a walked path, they are its steps in order. A view that matches nothing says so, in a sentence
// that also says what to change.
//
// Grafeo takes a quantified pattern such as -[]->{1,6} as a walk. It may use the same link again (found by running the
// queries, 11 Oct 2026). So take a route of up to k steps from a to b. A thing is on one when its steps from a and its
// steps on to b add up to k or fewer. A link is on one when the steps to its start, the link itself and the steps on
// from its end do. That takes two breadth-first searches, however many routes there are.
import type { Graph } from '@thoughtknot/graph-spec';
import { formatList } from './locale-formats.ts';
import { pathsOf } from './paths.ts';
import type { PathReading } from './paths.ts';
import type { ViewSpec } from './view-profile.ts';
import { word } from './words.ts';

type Edge = Graph['edges'][number];

/**
 * What a view returns: its things (ids), and the links to draw with them (indexes into the graph's drawn links). When
 * nothing matches, it holds a sentence saying so.
 */
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

const or = (xs: string[]) => formatList(xs, 'disjunction');

/** Nothing matches: no things, no links, and the sentence. */
const nothing = (why: string): ViewResult => ({ things: [], links: [], empty: true, why });

const noThing = (names: string[]) => word('views.empty.no-thing', { count: names.length, names: or(names) });

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
 * A view put to a graph of a reading, giving what Grafeo gives for the view's query:
 * - a hand-picked set is the things named that the graph holds;
 * - everything near a thing is it and whatever is 1 to 3 links from it in either direction;
 * - how one thing reaches another is the things and links on the routes of up to 6 steps;
 * - some kinds is the things of those kinds;
 * - a walked path is the Path and its steps in order.
 *
 * The links are indexes into the graph's drawn links. A view that matches nothing is `empty`, with a sentence saying so
 * and what to change. Things with no box (a schema's) are walked through but never returned, as they are never drawn.
 */
export function evaluate(view: ViewSpec, reading: PathReading, graph: string): ViewResult {
  const drawing = reading.graphs.get(graph),
    g = reading.world[graph];
  // a graph with nothing written in it is not in the reading at all, so the two are said alike
  if (!drawing || !g || !drawing.boxes.length) return nothing(word('views.empty.no-things', { graph }));
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
      if (!wanted.length) return nothing(word('views.empty.none-picked'));
      if (!here.length) return nothing(noThing(gone));
      return { things: here, links: among(new Set(here)), empty: false, ...(gone.length ? { missing: gone } : {}) };
    }
    case 'near': {
      if (!text.has(view.id)) return nothing(noThing([view.id]));
      // as Grafeo has it, a thing with no links is matched by no route, so nothing is near it
      if (!neighbours(g, view.id, true, true).length)
        return nothing(word('views.empty.no-links', { thing: say(view.id) }));
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
        const ends = { from: say(view.from), to: say(view.to), count: most };
        return nothing(word(directed ? 'views.empty.not-reached' : 'views.empty.not-connected', ends));
      }
      return { things: drawn.filter((id) => ids.has(id)), links: linksOf(used), empty: false };
    }
    case 'kinds': {
      const wanted = new Set(view.kinds),
        here = new Set(drawn.filter((id) => [...(g.nodes.get(id)?.[0] ?? [])].some((k) => wanted.has(k))));
      if (!here.size) return nothing(word('views.empty.no-kind', { kinds: or(view.kinds) }));
      return shown(here);
    }
    case 'path': {
      const path = pathsOf(reading, graph).find((p) => p.id === view.path);
      if (!path || !g.has(view.path, 'Path'))
        return nothing(
          g.nodes.has(view.path)
            ? word('views.empty.not-path', { thing: say(view.path) })
            : word('views.empty.no-path', { path: view.path }),
        );
      const walk = path.steps.filter((s) => !s.missing).map((s) => s.key);
      if (!walk.length)
        return nothing(word(path.empty ? 'views.empty.no-steps' : 'views.empty.steps-gone', { path: path.title }));
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
