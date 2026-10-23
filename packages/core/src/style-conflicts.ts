// The things of a style graph checked against each other (editor spec §6, nudge_problems; §7; §14; §15). The conflicts:
// - nudges that conflict: two directions, beside and before on one pair, a thing in two groups, a loop of befores;
// - a view set both to fade and to hide, or a view saved as shown twice;
// - a colour given two meanings in one view or path;
// - a property switched both on and off for one kind, thing or type in one view;
// - arrowheads both hidden and shown for the same links in one view;
// - two diagram types for the whole graph or one view, or links set to move two ways in one view;
// - two routings or two choices of merging links (§25).
// Each is a problem with a fix. The first written is kept and the later left out, so what is kept never conflicts.
import type { Problem } from './note-reading.ts';
import type { Checked } from './style-checks.ts';
import { emptyStyle, styleProblem } from './style-graph.ts';
import type { Arrows, Diagram, Flow, Links, Look, Nudge, Show, StyleAt, StyleGraph } from './style-graph.ts';
import { word } from './words.ts';

/** The fix of every conflict, made when said so it is in the language of the moment. */
const remove = () => word('styling.remove-one');

/** The path of befores from `from` to `to`, if there is one: the things in order, both ends included. */
function chain(after: Map<string, string[]>, from: string, to: string): string[] | null {
  const came = new Map<string, string>([[from, from]]),
    queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i] as string;
    if (at === to) {
      const path = [at];
      while (path[0] !== from) path.unshift(came.get(path[0] as string) as string);
      return path;
    }
    for (const next of after.get(at) ?? [])
      if (!came.has(next)) {
        came.set(next, at);
        queue.push(next);
      }
  }
  return null;
}

/** The nudges that conflict with none written before them, and a problem for each one that does. */
function settleNudges(nudges: Nudge[], graph: string, out: Problem[]): { kept: Nudge[]; direction?: string } {
  const kept: Nudge[] = [],
    pairs = new Map<string, Nudge>(),
    groups = new Map<string, Nudge>(),
    after = new Map<string, string[]>();
  let direction: Nudge | undefined;
  const conflict = (n: Nudge, message: string) => out.push(styleProblem(graph, n.at, 'GN808', message, remove()));
  for (const n of nudges) {
    if (n.word === 'direction') {
      if (direction && direction.direction !== n.direction) {
        conflict(
          n,
          word('styling.conflict.direction', {
            direction: n.direction ?? '',
            line: String(direction.at.line),
            first: direction.direction ?? '',
          }),
        );
        continue;
      }
      direction ??= n;
    } else if (n.word === 'group') {
      const first = groups.get(n.thing as string);
      if (first && first.group !== n.group) {
        const [thing, group] = [n.thing ?? '', n.group ?? ''];
        conflict(
          n,
          word('styling.conflict.groups', { thing, first: first.group ?? '', line: String(first.at.line), group }),
        );
        continue;
      }
      groups.set(n.thing as string, first ?? n);
    } else {
      const [a, b] = [n.thing as string, n.other as string],
        pair = [a, b].sort().join('\u0000'),
        first = pairs.get(pair);
      if (first && first.word !== n.word) {
        const [thing, other] = [first.thing ?? '', first.other ?? ''];
        conflict(n, word('styling.conflict.beside-before', { thing, other, line: String(first.at.line) }));
        continue;
      }
      if (n.word === 'before') {
        const loop = chain(after, b, a);
        if (loop) {
          // the loop is joined by the nudge word before, as the style graph writes it
          conflict(n, word('styling.conflict.loop', { loop: [...loop, b].join(' before ') }));
          continue;
        }
        after.set(a, [...(after.get(a) ?? []), b]);
      }
      if (!first) pairs.set(pair, n);
    }
    kept.push(n);
  }
  return direction?.direction ? { kept, direction: direction.direction } : { kept };
}

/** The looks, each colour given one meaning in each view or path: a second meaning is a problem, and is not drawn. */
function settleLooks(looks: Look[], graph: string, out: Problem[]): Look[] {
  const meant = new Map<string, Look>();
  return looks.flatMap((l): Look[] => {
    if (!l.colour) return [l];
    const scope = l.view !== undefined ? `view ${l.view}` : `path ${l.path}`,
      key = `${scope}\u0000${l.colour}`,
      first = meant.get(key);
    if (!first) meant.set(key, l);
    if (!first || first.means === l.means) return [l];
    out.push(
      styleProblem(
        graph,
        l.at,
        'GN808',
        word(l.view !== undefined ? 'styling.conflict.colour-view' : 'styling.conflict.colour-path', {
          colour: l.colour,
          means: first.means ?? '',
          view: l.view ?? '',
          path: l.path ?? '',
          line: String(first.at.line),
        }),
        word('styling.conflict.colour.fix'),
      ),
    );
    const { colour: _colour, means: _means, ...rest } = l;
    return rest.line || rest.format ? [rest] : [];
  });
}

/**
 * The things of one kind that conflict with none written before them. Two that choose for the same place (`placeOf`)
 * differently (`choiceOf`) are a problem on the later, which is left out. The same choice written twice is kept.
 */
function settleChoices<T extends { at: StyleAt }>(
  things: T[],
  placeOf: (t: T) => string,
  choiceOf: (t: T) => string,
  said: (first: T, later: T) => string,
  graph: string,
  out: Problem[],
): T[] {
  const first = new Map<string, T>();
  return things.filter((t) => {
    const was = first.get(placeOf(t));
    if (!was) first.set(placeOf(t), t);
    if (!was || choiceOf(was) === choiceOf(t)) return true;
    out.push(styleProblem(graph, t.at, 'GN808', said(was, t), remove()));
    return false;
  });
}

/** The line a first choice was written on, as a sentence says it. */
const lineOf = (t: { at: StyleAt }) => String(t.at.line);

/** The properties shown, each switched one way only for each kind, thing or type in each view. */
const settleShows = (shows: Show[], graph: string, out: Problem[]): Show[] =>
  settleChoices(
    shows,
    (s) => [s.view ?? '', s.kind ?? '', s.thing ?? '', s.type ?? '', s.property].join('\u0000'),
    (s) => s.inline,
    (was, s) =>
      word(s.view === undefined ? 'styling.conflict.show' : 'styling.conflict.show-view', {
        property: s.property,
        of: s.kind ?? s.thing ?? s.type ?? '',
        first: was.inline,
        line: lineOf(was),
        inline: s.inline,
        view: s.view ?? '',
      }),
    graph,
    out,
  );

/** Where arrowheads are hidden or shown, each chosen one way only for every link or a type, in each view. */
const settleArrows = (arrows: Arrows[], graph: string, out: Problem[]): Arrows[] =>
  settleChoices(
    arrows,
    (a) => [a.view ?? '', a.type ?? ''].join('\u0000'),
    (a) => a.arrowheads,
    (was, a) =>
      word(
        a.type === undefined
          ? a.view === undefined
            ? 'styling.conflict.arrows-all'
            : 'styling.conflict.arrows-all-view'
          : a.view === undefined
            ? 'styling.conflict.arrows-type'
            : 'styling.conflict.arrows-type-view',
        { type: a.type ?? '', view: a.view ?? '', first: was.arrowheads, line: lineOf(was), arrowheads: a.arrowheads },
      ),
    graph,
    out,
  );

/** A diagram type as a sentence says it: its type, and for a tree the relationship it follows. */
const typeSaid = (d: Diagram) =>
  d.relationship === undefined
    ? d.type
    : word('styling.conflict.type-along', { type: d.type, relationship: d.relationship });

/** The diagram types chosen, one for the whole graph and one for each view (§15). */
const settleDiagrams = (diagrams: Diagram[], graph: string, out: Problem[]): Diagram[] =>
  settleChoices(
    diagrams,
    (d) => d.view ?? '',
    typeSaid,
    (was, d) =>
      word(d.view === undefined ? 'styling.conflict.diagram' : 'styling.conflict.diagram-view', {
        view: d.view ?? '',
        first: typeSaid(was),
        line: lineOf(was),
        type: typeSaid(d),
      }),
    graph,
    out,
  );

/**
 * How links are drawn (§25): one routing and one choice of merging for the whole graph and for each view. A Links that
 * conflicts with an earlier one in either is left out whole.
 */
function settleLinks(links: Links[], graph: string, out: Problem[]): Links[] {
  const routed = settleChoices(
    links.filter((l) => l.routing !== undefined),
    (l) => l.view ?? '',
    (l) => l.routing ?? '',
    (was, l) =>
      word(l.view === undefined ? 'styling.conflict.routing' : 'styling.conflict.routing-view', {
        view: l.view ?? '',
        first: was.routing ?? '',
        line: lineOf(was),
        routing: l.routing ?? '',
      }),
    graph,
    out,
  );
  const merged = settleChoices(
    links.filter((l) => l.merge !== undefined),
    (l) => l.view ?? '',
    (l) => l.merge ?? '',
    (was, l) =>
      word(l.view === undefined ? 'styling.conflict.merge' : 'styling.conflict.merge-view', {
        view: l.view ?? '',
        first: was.merge ?? '',
        line: lineOf(was),
        merge: l.merge ?? '',
      }),
    graph,
    out,
  );
  return links.filter((l) => (!l.routing || routed.includes(l)) && (!l.merge || merged.includes(l)));
}

/** A Flow's movement as a sentence says it: its motion, and what it means. */
const flowSaid = (f: Flow) =>
  f.means === undefined ? f.motion : word('styling.conflict.flow-meaning', { motion: f.motion, means: f.means });

/** Where links move, each moved one way only for every link or a type, in each view (§7). */
const settleFlows = (flows: Flow[], graph: string, out: Problem[]): Flow[] =>
  settleChoices(
    flows,
    (f) => [f.view ?? '', f.type ?? ''].join('\u0000'),
    (f) => [f.motion, f.means ?? ''].join('\u0000'),
    (was, f) =>
      word(
        f.type === undefined
          ? f.view === undefined
            ? 'styling.conflict.flows-all'
            : 'styling.conflict.flows-all-view'
          : f.view === undefined
            ? 'styling.conflict.flows-type'
            : 'styling.conflict.flows-type-view',
        { type: f.type ?? '', view: f.view ?? '', first: flowSaid(was), line: lineOf(was), flow: flowSaid(f) },
      ),
    graph,
    out,
  );

/** The style a checked style graph gives, once its things are checked against each other, and the problems found. */
export function settle(checked: Checked, graph: string): { style: StyleGraph; problems: Problem[] } {
  const problems: Problem[] = [],
    style = emptyStyle();
  const { kept, direction } = settleNudges(checked.nudges, graph, problems);
  style.nudges = kept;
  if (direction) style.direction = direction;
  style.shows = settleShows(checked.shows, graph, problems);
  style.arrows = settleArrows(checked.arrows, graph, problems);
  style.diagrams = settleDiagrams(checked.diagrams, graph, problems);
  style.flows = settleFlows(checked.flows, graph, problems);
  style.links = settleLinks(checked.links, graph, problems);
  style.looks = settleLooks(checked.looks, graph, problems);
  // a box's picture is the most particular Picture's, the first written of two alike (picture.ts): none conflicts
  style.pictures = checked.pictures;
  // a graph's filter is the first written for it (filter-saved.ts): none conflicts
  style.filters = checked.filters;
  const viewAt = new Map<string, number>();
  for (const { view, outside, at } of checked.views) {
    const first = style.views.get(view);
    if (first && first.outside !== outside)
      problems.push(
        styleProblem(
          graph,
          at,
          'GN808',
          word('styling.conflict.view', { view, first: first.outside, line: String(viewAt.get(view)), outside }),
          remove(),
        ),
      );
    else if (!first) {
      style.views.set(view, { outside });
      viewAt.set(view, at.line);
    }
  }
  const shownAt = new Map<string, number>();
  for (const { view, at, ...shown } of checked.shown) {
    if (shownAt.has(view))
      problems.push(
        styleProblem(
          graph,
          at,
          'GN808',
          word('styling.conflict.shown-twice', { view, line: String(shownAt.get(view)) }),
          remove(),
        ),
      );
    else {
      style.shown.set(view, shown);
      shownAt.set(view, at.line);
    }
  }
  return { style, problems };
}
