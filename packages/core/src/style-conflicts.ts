// The things of a style graph checked against each other (editor spec §6, nudge_problems; §7; §14; §15): nudges that
// conflict — two directions, beside and before on one pair, a thing in two groups, a loop of befores — a view set both to
// fade and to hide, a view saved as shown twice, a colour given two meanings in one view or path, a property switched both
// on and off for one kind, thing or type in one view, arrowheads both hidden and shown for the same links in one view,
// two diagram types for the whole graph or one view, and links set to move two ways in one view. Each is a problem with
// a fix; the first written is kept and the later left out, so what is kept never conflicts.
import type { Problem } from './note-reading.ts';
import type { Checked } from './style-checks.ts';
import { emptyStyle, styleProblem } from './style-graph.ts';
import type { Arrows, Diagram, Flow, Look, Nudge, Show, StyleAt, StyleGraph } from './style-graph.ts';

const REMOVE = 'remove one of them';

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
  const conflict = (n: Nudge, message: string) => out.push(styleProblem(graph, n.at, message, REMOVE));
  for (const n of nudges) {
    if (n.word === 'direction') {
      if (direction && direction.direction !== n.direction) {
        conflict(
          n,
          `this direction nudge (${n.direction}) conflicts with the one on line ${direction.at.line} (${direction.direction})`,
        );
        continue;
      }
      direction ??= n;
    } else if (n.word === 'group') {
      const first = groups.get(n.thing as string);
      if (first && first.group !== n.group) {
        conflict(n, `${n.thing} is in two groups, ${first.group} (line ${first.at.line}) and ${n.group}`);
        continue;
      }
      groups.set(n.thing as string, first ?? n);
    } else {
      const [a, b] = [n.thing as string, n.other as string],
        pair = [a, b].sort().join('\u0000'),
        first = pairs.get(pair);
      if (first && first.word !== n.word) {
        conflict(
          n,
          `${first.thing} and ${first.other} cannot be both beside and before each other: this conflicts with line ${first.at.line}`,
        );
        continue;
      }
      if (n.word === 'before') {
        const loop = chain(after, b, a);
        if (loop) {
          conflict(n, `this before nudge closes a loop: ${[...loop, b].join(' before ')}`);
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
        `${l.colour} already means ${first.means} in ${scope} (line ${first.at.line})`,
        'use another colour, or the same meaning',
      ),
    );
    const { colour: _colour, means: _means, ...rest } = l;
    return rest.line || rest.format ? [rest] : [];
  });
}

/**
 * The things of one kind that conflict with none written before them: two that choose for the same place (`placeOf`)
 * differently (`choiceOf`) are a problem on the later, which is left out; the same choice written twice is kept.
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
    out.push(styleProblem(graph, t.at, said(was, t), REMOVE));
    return false;
  });
}

const inView = (view: string | undefined) => (view === undefined ? '' : ` in view ${view}`);

/** The properties shown, each switched one way only for each kind, thing or type in each view. */
const settleShows = (shows: Show[], graph: string, out: Problem[]): Show[] =>
  settleChoices(
    shows,
    (s) => [s.view ?? '', s.kind ?? '', s.thing ?? '', s.type ?? '', s.property].join('\u0000'),
    (s) => s.inline,
    (was, s) =>
      `${s.property} of ${s.kind ?? s.thing ?? s.type} is switched both ${was.inline} (line ${was.at.line}) and ${s.inline}${inView(s.view)}`,
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
      `the arrowheads of ${a.type ?? 'every link'} ${a.view === undefined ? 'in the whole graph' : `in view ${a.view}`} ` +
      `are set to both ${was.arrowheads} (line ${was.at.line}) and ${a.arrowheads}`,
    graph,
    out,
  );

/** A diagram type as a sentence says it: its type, and for a tree the relationship it follows. */
const typeSaid = (d: Diagram) => `${d.type}${d.relationship === undefined ? '' : ` along ${d.relationship}`}`;

/** The diagram types chosen, one for the whole graph and one for each view (§15). */
const settleDiagrams = (diagrams: Diagram[], graph: string, out: Problem[]): Diagram[] =>
  settleChoices(
    diagrams,
    (d) => d.view ?? '',
    typeSaid,
    (was, d) =>
      `the diagram type of ${d.view === undefined ? 'the whole graph' : `view ${d.view}`} is set to both ` +
      `${typeSaid(was)} (line ${was.at.line}) and ${typeSaid(d)}`,
    graph,
    out,
  );

/** A Flow's movement as a sentence says it: its motion, and what it means. */
const flowSaid = (f: Flow) => `${f.motion}${f.means === undefined ? '' : `, meaning ${f.means}`}`;

/** Where links move, each moved one way only for every link or a type, in each view (§7). */
const settleFlows = (flows: Flow[], graph: string, out: Problem[]): Flow[] =>
  settleChoices(
    flows,
    (f) => [f.view ?? '', f.type ?? ''].join('\u0000'),
    (f) => [f.motion, f.means ?? ''].join('\u0000'),
    (was, f) =>
      `the links of ${f.type ?? 'every type'} ${f.view === undefined ? 'in the whole graph' : `in view ${f.view}`} ` +
      `are set to move both as ${flowSaid(was)} (line ${was.at.line}), and as ${flowSaid(f)}`,
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
  style.looks = settleLooks(checked.looks, graph, problems);
  const viewAt = new Map<string, number>();
  for (const { view, outside, at } of checked.views) {
    const first = style.views.get(view);
    if (first && first.outside !== outside)
      problems.push(
        styleProblem(
          graph,
          at,
          `view ${view} is set to both ${first.outside} (line ${viewAt.get(view)}) and ${outside}`,
          REMOVE,
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
        styleProblem(graph, at, `view ${view} is saved as shown twice, here and on line ${shownAt.get(view)}`, REMOVE),
      );
    else {
      style.shown.set(view, shown);
      shownAt.set(view, at.line);
    }
  }
  return { style, problems };
}
