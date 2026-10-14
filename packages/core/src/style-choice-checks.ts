// The style graph's choices for how the whole graph or one view is drawn, each checked on its own (editor spec §15, §25):
// where arrowheads are hidden (Arrows), the diagram type (Diagram), and how links are routed and whether they are merged
// into trunks (Links). What is sound is kept; each fault is a problem on its line with its fix, and the thing is left out.
import type { Problem } from './note-reading.ts';
import { ARROWHEADS, DIAGRAM_TYPES, ON_OFF, ROUTINGS, orList } from './style-graph.ts';
import type { Arrows, Diagram, Links } from './style-graph.ts';
import { reader } from './style-thing-reader.ts';
import type { RawThing, StyledNames } from './style-thing-reader.ts';

const inView = (view: string | undefined) => (view === undefined ? {} : { view });

/**
 * Where arrowheads are hidden or shown, checked (§15): show or hide, for every link or the links of a relationship type
 * the graph has, in the whole graph or in a view, whose name is the user's own.
 */
export function arrowsOf(raw: RawThing, names: StyledNames, out: Problem[]): Arrows | null {
  const r = reader(raw, names, out),
    before = out.length;
  if (raw.props.arrowheads === undefined) {
    r.missing('an Arrows says show or hide', `add arrowheads: ${orList(ARROWHEADS.map((w) => `'${w}'`))}`);
    return null;
  }
  const arrowheads = r.word('arrowheads', ARROWHEADS, `arrowheads must be ${orList(ARROWHEADS)}`);
  const type = r.name('type', names.types, 'a relationship type'),
    view = r.text('view');
  if (!arrowheads || out.length !== before) return null;
  return { arrowheads, ...inView(view), ...(type === undefined ? {} : { type }), at: raw.at };
}

/** What a Diagram's relationship is for (§15): the branches of a tree, and nothing else. */
export const TREE_ONLY = 'a relationship is chosen only for a tree';

/**
 * The diagram type chosen, checked (§15, type_remembered): one of the types, in the whole graph or a view, whose name is
 * the user's own; for a tree, a relationship type the graph has, which no other type takes.
 */
export function diagramOf(raw: RawThing, names: StyledNames, out: Problem[]): Diagram | null {
  const r = reader(raw, names, out),
    before = out.length;
  if (raw.props.type === undefined) {
    r.missing('a Diagram names its type', `add type: ${orList(DIAGRAM_TYPES.map((w) => `'${w}'`))}`);
    return null;
  }
  const type = r.word('type', DIAGRAM_TYPES, '$ is not a diagram type');
  const relationship = r.name('relationship', names.types, 'a relationship type'),
    view = r.text('view');
  if (type && relationship !== undefined && type !== 'tree')
    r.report(TREE_ONLY, "remove relationship, or make it type: 'tree'");
  if (!type || out.length !== before) return null;
  return { type, ...inView(view), ...(relationship === undefined ? {} : { relationship }), at: raw.at };
}

/**
 * How links are drawn, checked (§25, untangle_routing, untangle_merge): a routing of the three, merging on or off, or
 * both, in the whole graph or in a view, whose name is the user's own.
 */
export function linksOf(raw: RawThing, names: StyledNames, out: Problem[]): Links | null {
  const r = reader(raw, names, out),
    before = out.length;
  if (raw.props.routing === undefined && raw.props.merge === undefined) {
    r.missing('a Links sets routing or merge', `add routing: ${orList(ROUTINGS.map((w) => `'${w}'`))}, or merge: 'on'`);
    return null;
  }
  const routing = r.word('routing', ROUTINGS, `$ is not a routing: links are ${orList(ROUTINGS)}`);
  const merge = r.word('merge', ON_OFF, `merge must be ${orList(ON_OFF)}`),
    view = r.text('view');
  if (out.length !== before) return null;
  return {
    ...(routing === undefined ? {} : { routing }),
    ...(merge === undefined ? {} : { merge }),
    ...inView(view),
    at: raw.at,
  };
}
