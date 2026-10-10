// The things of a style graph checked against each other (editor spec §6, nudge_problems; §7): nudges that conflict — two
// directions, beside and before on one pair, a thing in two groups, a loop of befores — a view set both to fade and to
// hide, a view saved as shown twice, and a colour given two meanings in one view or path. Each is a problem with a fix;
// the first written is kept and the later left out, so what is kept never conflicts.
import type { Problem } from './note-reading.ts';
import type { Checked } from './style-checks.ts';
import { emptyStyle, styleProblem } from './style-graph.ts';
import type { Look, Nudge, StyleGraph } from './style-graph.ts';

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

/** The style a checked style graph gives, once its things are checked against each other, and the problems found. */
export function settle(checked: Checked, graph: string): { style: StyleGraph; problems: Problem[] } {
  const problems: Problem[] = [],
    style = emptyStyle();
  const { kept, direction } = settleNudges(checked.nudges, graph, problems);
  style.nudges = kept;
  if (direction) style.direction = direction;
  style.shows = checked.shows;
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
