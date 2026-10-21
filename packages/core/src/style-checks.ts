// Checking each thing of a style graph (editor spec §2, style_graph_checked; §6; §7; §14; §15, the arrowheads and the
// diagram type; §7, how links move; §25, how links are routed and merged; §18, a picture on a box): its kind, its words,
// its values and every name it uses, against the graph it styles. What is sound is kept. Each fault is a problem on its
// line with its fix. The part at fault is left out of the style, or the whole thing when nothing of it can be used. The
// choices for how a graph or a view is drawn are checked in style-choice-checks.ts. Every thing is read through
// style-reader.ts.
import { STYLE } from './layout.ts';
import { flowOf } from './link-flow.ts';
import type { Problem } from './note-reading.ts';
import { pictureOf } from './picture.ts';
import { arrowsOf, diagramOf, linksOf } from './style-choice-checks.ts';
import {
  FORMATS,
  INLINE,
  LINES,
  NUDGE_WORDS,
  ON_OFF,
  OUTSIDE,
  STYLE_HUES,
  STYLE_KINDS,
  orList,
  styleProblem,
} from './style-graph.ts';
import type {
  Arrows,
  Diagram,
  Flow,
  Links,
  Look,
  Nudge,
  Picture,
  Show,
  Shown,
  StyleAt,
  StyleKind,
  ViewStyle,
} from './style-graph.ts';
import { reader } from './style-reader.ts';
import { readFrame, unknownKeys } from './style-words.ts';
import { legendChecked } from './untangle-saved.ts';
import { word as say } from './words.ts';

export { treeOnly } from './style-choice-checks.ts';

/** One thing of a style graph as read: its kinds, its properties, where it is, and where each property's text is. */
export interface RawThing {
  labels: string[];
  props: Record<string, unknown>;
  at: StyleAt;
  /** Where a property's quoted text is written: its 0-based line in the block and the characters it spans. */
  span(key: string): Problem['span'];
  /** Where a property's key is written: its 0-based line in the block and the characters it spans. */
  keySpan(key: string): Problem['span'];
  /** Set when the thing writes a key its kind does not know: what it lacks may be that key, misspelt, so is not yet said. */
  misspelt?: boolean;
}

/** The names of the graph a style graph styles, which every name in the style must be one of. */
export interface StyledNames {
  graph: string;
  things: Set<string>;
  kinds: Set<string>;
  types: Set<string>;
  paths: Set<string>;
  /** The property names of a kind's things, of one thing, or of a relationship type's links. */
  properties(of: { kind?: string; thing?: string; type?: string }): Set<string>;
}

/** What each thing of a style graph gives, checked one by one, before the things are checked against each other. */
export interface Checked {
  nudges: Nudge[];
  shows: Show[];
  looks: Look[];
  views: (ViewStyle & { view: string; at: StyleAt })[];
  shown: (Shown & { view: string; at: StyleAt })[];
  arrows: Arrows[];
  diagrams: Diagram[];
  flows: Flow[];
  links: Links[];
  pictures: Picture[];
  problems: Problem[];
}

/** The words a style check says, each made when said so it is in the language of the moment. */
const four = () => say('styling.nudge.four-words'),
  aThing = () => say('styling.what.thing'),
  thingId = () => say('styling.what.thing-id');
/** That `key` must be one of `among`. */
const mustBe = (key: string, among: readonly string[]) => say('styling.must-be', { key, among: orList(among) });
/** The words of `among` as GQL writes them, each in quotes. */
const quoted = (among: readonly string[]) => orList(among.map((w) => `'${w}'`));
const KINDS = `${STYLE_KINDS.slice(0, -1).join(', ')} or ${STYLE_KINDS.at(-1)}`;
/** The View menu's switches a view saved as shown keeps (§25, view_switch_view_only). */
const SAVED_SWITCHES = ['labels', 'hubs', 'groups', 'merge'] as const;

/** A nudge, checked: one of the four words, with the parts its word needs, each naming a thing of the graph. */
function nudgeOf(raw: RawThing, names: StyledNames, out: Problem[]): Nudge | null {
  const r = reader(raw, names, out),
    before = out.length;
  if (raw.props.word === undefined) {
    r.missing(four(), say('styling.nudge.add-word', { among: quoted(NUDGE_WORDS) }));
    return null;
  }
  const word = r.word('word', NUDGE_WORDS, four(), true);
  if (!word) return null;
  const n: Nudge = { word, at: raw.at };
  const has = (k: string) => raw.props[k] !== undefined;
  if (word === 'beside' || word === 'before') {
    const missing = ['thing', 'other'].find((k) => !has(k));
    if (missing) r.missing(say('styling.nudge.two-things', { word }), say('styling.add-id', { key: missing }));
    else
      [n.thing, n.other] = [
        r.name('thing', names.things, aThing(), thingId()),
        r.name('other', names.things, aThing(), thingId()),
      ];
  } else if (word === 'group') {
    if (!has('thing')) r.missing(say('styling.nudge.group'), say('styling.add-id', { key: 'thing' }));
    else if (!has('group')) r.missing(say('styling.nudge.group'), say('styling.nudge.add-group'));
    else [n.thing, n.group] = [r.name('thing', names.things, aThing(), thingId()), r.text('group')];
  } else if (!has('direction'))
    r.missing(say('styling.nudge.direction'), say('styling.nudge.add-direction', { among: quoted(STYLE.directions) }));
  else
    n.direction = r.word('direction', STYLE.directions, (written) =>
      say('styling.nudge.direction-unknown', { written }),
    );
  return out.length === before ? n : null;
}

/** What a Show is for: one kind, thing or relationship type (§14). */
export const showFor = () => say('styling.show.for');

/**
 * A property switched on or off for showing inline, checked. It names a property of the kind's things, of the thing, or
 * of the type's links. It is on unless it says off. It is in a view when it names one, whose name is the user's own.
 */
function showOf(raw: RawThing, names: StyledNames, out: Problem[]): Show | null {
  const r = reader(raw, names, out),
    before = out.length;
  const has = (k: string) => raw.props[k] !== undefined;
  const targets = ['kind', 'thing', 'type'].filter(has).length;
  if (!has('property')) r.missing(say('styling.show.property'), say('styling.add-property'));
  else if (targets > 1) r.report(showFor(), say('styling.remove-all-but-one'));
  else if (!targets) r.missing(showFor(), say('styling.show.add-target'));
  else {
    const kind = r.name('kind', names.kinds, say('styling.what.kind')),
      thing = r.name('thing', names.things, aThing(), thingId()),
      type = r.name('type', names.types, say('styling.what.type'));
    const of = kind ? { kind } : thing ? { thing } : type ? { type } : null;
    if (of) {
      const property = r.name(
        'property',
        names.properties(of),
        say('styling.what.property-of', { of: kind ?? thing ?? type ?? '' }),
        say('styling.what.property-it-has'),
      );
      const inline = raw.props.inline === undefined ? 'on' : r.word('inline', INLINE, mustBe('inline', INLINE));
      const view = r.text('view');
      if (property && inline && out.length === before)
        return { property, ...of, ...(view === undefined ? {} : { view }), inline, at: raw.at };
    }
  }
  return null;
}

/** A look, checked: one view or path, one thing, kind or link, all in the graph, and at least one change that is sound. */
function lookOf(raw: RawThing, names: StyledNames, out: Problem[]): Look | null {
  const r = reader(raw, names, out),
    has = (k: string) => raw.props[k] !== undefined;
  if (has('view') === has('path')) {
    if (has('view')) r.report(say('styling.look.view-and-path'), say('styling.remove-one'));
    else r.missing(say('styling.look.view-or-path'), say('styling.look.view-or-path.fix'));
    return null;
  }
  const targets = [has('thing'), has('kind'), has('from') && has('type') && has('to')].filter(Boolean).length;
  if (targets !== 1) {
    if (targets) r.report(say('styling.look.too-many'), say('styling.remove-all-but-one'));
    else r.missing(say('styling.look.target'), say('styling.look.target.fix'));
    return null;
  }
  if (!has('colour') && !has('line') && !has('format')) {
    r.missing(say('styling.look.change'), say('styling.look.change.fix'));
    return null;
  }
  const before = out.length,
    look: Look = { at: raw.at };
  const view = r.text('view'),
    path = r.name('path', names.paths, say('styling.what.path'), say('styling.what.path-id'));
  const thing = r.name('thing', names.things, aThing(), thingId()),
    kind = r.name('kind', names.kinds, say('styling.what.kind'));
  const from = r.name('from', names.things, aThing(), thingId()),
    type = r.name('type', names.types, say('styling.what.type')),
    to = r.name('to', names.things, aThing(), thingId());
  if (out.length > before) return null;
  Object.assign(look, view === undefined ? { path } : { view });
  if (thing !== undefined) look.thing = thing;
  else if (kind !== undefined) look.kind = kind;
  else if (from !== undefined && type !== undefined && to !== undefined) look.link = { from, type, to };
  const colour = r.word('colour', STYLE_HUES, (written) => say('styling.look.colour-unknown', { written }));
  const means = r.text('means');
  if (colour !== undefined && !means)
    r.missing(say('styling.look.means', { colour }), say('styling.look.means.fix', { colour }));
  else if (colour !== undefined) Object.assign(look, { colour, means });
  const line = r.word('line', LINES, mustBe('line', LINES)),
    format = r.word('format', FORMATS, mustBe('format', FORMATS));
  if (line) look.line = line;
  if (format) look.format = format;
  return look.colour || look.line || look.format ? look : null;
}

/** What a view does with the things outside it, checked. */
function viewStyleOf(raw: RawThing, names: StyledNames, out: Problem[]): Checked['views'][number] | null {
  const r = reader(raw, names, out);
  // a view's name cannot be checked against the graph: views are query blocks, read elsewhere, so any name is taken
  const view = r.text('view');
  if (!view) r.missing(say('styling.view-style.view'), say('styling.add-view-name'));
  if (raw.props.outside === undefined) {
    r.missing(say('styling.view-style.outside'), say('styling.view-style.outside.fix'));
    return null;
  }
  const outside = r.word('outside', OUTSIDE, mustBe('outside', OUTSIDE));
  return view && outside ? { view, outside, at: raw.at } : null;
}

/** How a view was shown, checked: each part that can be read is kept, each that cannot is a problem. */
function shownOf(raw: RawThing, names: StyledNames, out: Problem[]): Checked['shown'][number] | null {
  const r = reader(raw, names, out);
  const view = r.text('view');
  if (!view) {
    r.missing(say('styling.shown.view'), say('styling.add-view-name'));
    return null;
  }
  const shown: Checked['shown'][number] = { view, at: raw.at };
  const zoom = r.number('zoom');
  if (zoom !== undefined && zoom <= 0) r.report(say('styling.shown.zoom'), say('styling.shown.zoom.fix'));
  else if (zoom !== undefined) shown.zoom = zoom;
  for (const k of ['x', 'y'] as const) {
    const v = r.number(k);
    if (v !== undefined) shown[k] = v;
  }
  if (raw.props.frame !== undefined) {
    const written = raw.props.frame,
      read = readFrame(written);
    if ('frame' in read) shown.frame = read.frame;
    else
      r.report(
        read.message,
        read.fix,
        typeof written === 'string' && read.clean !== undefined ? r.edit('frame', written, [read.clean]) : {},
      );
  }
  const selected = r.name('selected', names.things, aThing(), thingId());
  if (selected !== undefined) shown.selected = selected;
  // the View menu's switches as they stood when it was saved (§25)
  for (const k of SAVED_SWITCHES) {
    const v = r.word(k, ON_OFF, mustBe(k, ON_OFF));
    if (v !== undefined) shown[k] = v;
  }
  // the legend's lines brought forward or hidden (§25, untangle_legend): the sound ones kept
  const legend = legendChecked(r, names);
  if (legend !== undefined) shown.legend = legend;
  return shown;
}

/** Each thing of a style graph checked on its own, in the order written: what it gives, and the problems found. */
export function checkThings(raws: RawThing[], names: StyledNames): Checked {
  const c: Checked = {
    nudges: [],
    shows: [],
    looks: [],
    views: [],
    shown: [],
    arrows: [],
    diagrams: [],
    flows: [],
    links: [],
    pictures: [],
    problems: [],
  };
  for (const raw of raws) {
    const kinds = raw.labels.filter((l) => (STYLE_KINDS as readonly string[]).includes(l));
    if (kinds.length !== 1 || raw.labels.length !== 1) {
      const other = raw.labels.find((l) => !kinds.includes(l));
      const message = other
        ? say('styling.kind-unknown', { label: other, kinds: KINDS })
        : say('styling.kind-one', { kinds: KINDS });
      c.problems.push(styleProblem(names.graph, raw.at, message, say('styling.kind.fix', { kinds: KINDS })));
      continue;
    }
    const p = c.problems;
    // a key the style graph does not know: reported on the key. The thing may not mean what it says, so it is left out.
    // Its values at fault are still reported, but not what it lacks, which may be that key: the rename comes first
    const unknown = unknownKeys(
      kinds[0] as StyleKind,
      Object.keys(raw.props),
      (key) => raw.keySpan(key),
      names.graph,
      raw.at,
    );
    p.push(...unknown);
    const kept = <T>(x: T | null): T | null => (unknown.length ? null : x);
    const thing: RawThing = unknown.length ? { ...raw, misspelt: true } : raw;
    if (kinds[0] === 'Nudge') push(c.nudges, kept(nudgeOf(thing, names, p)));
    else if (kinds[0] === 'Show') push(c.shows, kept(showOf(thing, names, p)));
    else if (kinds[0] === 'Look') push(c.looks, kept(lookOf(thing, names, p)));
    else if (kinds[0] === 'ViewStyle') push(c.views, kept(viewStyleOf(thing, names, p)));
    else if (kinds[0] === 'Arrows') push(c.arrows, kept(arrowsOf(thing, names, p)));
    else if (kinds[0] === 'Diagram') push(c.diagrams, kept(diagramOf(thing, names, p)));
    else if (kinds[0] === 'Flow') push(c.flows, kept(flowOf(thing, names, p)));
    else if (kinds[0] === 'Links') push(c.links, kept(linksOf(thing, names, p)));
    else if (kinds[0] === 'Picture') push(c.pictures, kept(pictureOf(thing, names, p)));
    else push(c.shown, kept(shownOf(thing, names, p)));
  }
  return c;
}

const push = <T>(xs: T[], x: T | null) => {
  if (x) xs.push(x);
};
