// The style graph's choices for how the whole graph or one view is drawn, each checked on its own (editor spec §15,
// §25). They are where arrowheads are hidden (Arrows) and the diagram type (Diagram). So is how links are routed and
// whether they are merged into trunks (Links). What is sound is kept. Each fault is a problem on its line with its fix,
// and the thing is left out.
import type { Problem } from './note-reading.ts';
import { ARROWHEADS, DIAGRAM_TYPES, ON_OFF, ROUTINGS, orList } from './style-graph.ts';
import type { Arrows, Diagram, Links } from './style-graph.ts';
import type { RawThing, StyledNames } from './style-checks.ts';
import { reader } from './style-reader.ts';
import { word } from './words.ts';

const inView = (view: string | undefined) => (view === undefined ? {} : { view });
/** That `key` must be one of `among`. */
const mustBe = (key: string, among: readonly string[]) => word('styling.must-be', { key, among: orList(among) });
/** The words of `among` as GQL writes them, each in quotes. */
const quoted = (among: readonly string[]) => orList(among.map((w) => `'${w}'`));
const aType = () => word('styling.what.type');

/**
 * Where arrowheads are hidden or shown, checked (§15). It is show or hide, for every link or the links of a
 * relationship type the graph has. It holds in the whole graph or in a view, whose name is the user's own.
 */
export function arrowsOf(raw: RawThing, names: StyledNames, out: Problem[]): Arrows | null {
  const r = reader(raw, names, out),
    before = out.length;
  if (raw.props.arrowheads === undefined) {
    r.missing(word('styling.arrows.missing'), word('styling.arrows.add', { among: quoted(ARROWHEADS) }));
    return null;
  }
  const arrowheads = r.word('arrowheads', ARROWHEADS, mustBe('arrowheads', ARROWHEADS));
  const type = r.name('type', names.types, aType()),
    view = r.text('view');
  if (!arrowheads || out.length !== before) return null;
  return { arrowheads, ...inView(view), ...(type === undefined ? {} : { type }), at: raw.at };
}

/** What a Diagram's relationship is for (§15): the branches of a tree, and nothing else. */
export const treeOnly = () => word('styling.diagram.tree-only');

/**
 * The diagram type chosen, checked (§15, type_remembered). It is one of the types, in the whole graph or a view, whose
 * name is the user's own. For a tree, it names a relationship type the graph has, which no other type takes.
 */
export function diagramOf(raw: RawThing, names: StyledNames, out: Problem[]): Diagram | null {
  const r = reader(raw, names, out),
    before = out.length;
  if (raw.props.type === undefined) {
    r.missing(word('styling.diagram.missing'), word('styling.diagram.add', { among: quoted(DIAGRAM_TYPES) }));
    return null;
  }
  const type = r.word('type', DIAGRAM_TYPES, (written) => word('styling.diagram.unknown', { written }));
  const relationship = r.name('relationship', names.types, aType()),
    view = r.text('view');
  if (type && relationship !== undefined && type !== 'tree')
    r.report(treeOnly(), word('styling.diagram.tree-only.fix'));
  if (!type || out.length !== before) return null;
  return { type, ...inView(view), ...(relationship === undefined ? {} : { relationship }), at: raw.at };
}

/**
 * How links are drawn, checked (§25, untangle_routing, untangle_merge). It is a routing of the three, merging on or
 * off, or both. It holds in the whole graph or in a view, whose name is the user's own.
 */
export function linksOf(raw: RawThing, names: StyledNames, out: Problem[]): Links | null {
  const r = reader(raw, names, out),
    before = out.length;
  if (raw.props.routing === undefined && raw.props.merge === undefined) {
    r.missing(word('styling.links.missing'), word('styling.links.add', { among: quoted(ROUTINGS) }));
    return null;
  }
  const routing = r.word('routing', ROUTINGS, (written) =>
    word('styling.links.routing-unknown', { written, among: orList(ROUTINGS) }),
  );
  const merge = r.word('merge', ON_OFF, mustBe('merge', ON_OFF)),
    view = r.text('view');
  if (out.length !== before) return null;
  return {
    ...(routing === undefined ? {} : { routing }),
    ...(merge === undefined ? {} : { merge }),
    ...inView(view),
    at: raw.at,
  };
}
