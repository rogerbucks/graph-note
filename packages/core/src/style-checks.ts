// Checking each thing of a style graph (editor spec §2, style_graph_checked; §6; §7; §14; §15): its kind, its words, its values and
// every name it uses, against the graph it styles. What is sound is kept; each fault is a problem on its line with its
// fix, and the part at fault — or the whole thing, when nothing of it can be used — is left out of the style.
import { nearest } from './estimates.ts';
import { STYLE } from './layout.ts';
import type { Problem } from './note-reading.ts';
import {
  ARROWHEADS,
  FORMATS,
  INLINE,
  LINES,
  NUDGE_WORDS,
  OUTSIDE,
  STYLE_HUES,
  STYLE_KINDS,
  orList,
  styleProblem,
  wordFix,
} from './style-graph.ts';
import type { Arrows, Look, Nudge, Show, Shown, StyleAt, StyleKind, ViewStyle } from './style-graph.ts';
import { readFrame, unknownKeys } from './style-words.ts';

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
  problems: Problem[];
}

const FOUR = 'a nudge must be one of four words: beside, before, group or direction';
const KINDS = `${STYLE_KINDS.slice(0, -1).join(', ')} or ${STYLE_KINDS.at(-1)}`;

/** Reads one thing's properties, reporting each fault: a value of the wrong type, a word not allowed, a name not there. */
function reader(raw: RawThing, names: StyledNames, out: Problem[]) {
  const report = (message: string, fix: string, edit: Pick<Problem, 'replace' | 'span'> = {}) =>
    out.push(styleProblem(names.graph, raw.at, message, fix, edit));
  const edit = (key: string, written: string, by: string[]) => {
    const span = raw.span(key);
    return by.length ? { replace: { written, with: by }, ...(span ? { span } : {}) } : {};
  };
  const r = {
    report,
    edit,
    /** A fault of something absent, said unless a misspelt key may be it: the rename comes first, then this is said. */
    missing(message: string, fix: string) {
      if (!raw.misspelt) report(message, fix);
    },
    text(key: string): string | undefined {
      const v = raw.props[key];
      if (v === undefined || typeof v === 'string') return v;
      report(`${key} must be text`, `write ${key} in quotes`);
      return undefined;
    },
    number(key: string): number | undefined {
      const v = raw.props[key];
      if (v === undefined || (typeof v === 'number' && Number.isFinite(v))) return v;
      report(`${key} must be a number`, `write ${key} as a number, such as ${key}: 1`);
      return undefined;
    },
    /** A word of `among`, or undefined and a problem. */
    word<T extends string>(key: string, among: readonly T[], message: string, always = false): T | undefined {
      const v = r.text(key);
      if (v === undefined || (among as readonly string[]).includes(v)) return v as T | undefined;
      const { fix, nearest: near } = wordFix(v, among, always);
      report(
        message.replace('$', () => v),
        fix,
        edit(key, v, near ? [near] : []),
      );
      return undefined;
    },
    /** A name of the styled graph, or undefined and a problem whose fix is the nearest name. */
    name(key: string, among: Set<string>, what: string, fixWhat = what): string | undefined {
      const v = r.text(key);
      if (v === undefined || among.has(v)) return v;
      const near = nearest(v, among),
        by = !near ? [] : 'one' in near ? [near.one] : near.several;
      report(
        `${v} is not ${what} in graph ${names.graph}`,
        by.length
          ? `change ${v} to ${by.length > 1 ? 'the one you mean: ' : ''}${orList(by)}`
          : `write ${fixWhat} in graph ${names.graph}, or remove it`,
        edit(key, v, by),
      );
      return undefined;
    },
  };
  return r;
}

/** A nudge, checked: one of the four words, with the parts its word needs, each naming a thing of the graph. */
function nudgeOf(raw: RawThing, names: StyledNames, out: Problem[]): Nudge | null {
  const r = reader(raw, names, out),
    before = out.length;
  if (raw.props.word === undefined) {
    r.missing(FOUR, `add word: ${orList(NUDGE_WORDS.map((w) => `'${w}'`))}`);
    return null;
  }
  const word = r.word('word', NUDGE_WORDS, FOUR, true);
  if (!word) return null;
  const n: Nudge = { word, at: raw.at };
  const has = (k: string) => raw.props[k] !== undefined;
  if (word === 'beside' || word === 'before') {
    const missing = ['thing', 'other'].find((k) => !has(k));
    if (missing) r.missing(`a ${word} nudge names two things: thing and other`, `add ${missing}: '<id>'`);
    else
      [n.thing, n.other] = [
        r.name('thing', names.things, 'a thing', 'the id of a thing'),
        r.name('other', names.things, 'a thing', 'the id of a thing'),
      ];
  } else if (word === 'group') {
    if (!has('thing')) r.missing('a group nudge names a thing and its group', "add thing: '<id>'");
    else if (!has('group')) r.missing('a group nudge names a thing and its group', "add group: '<the group's label>'");
    else [n.thing, n.group] = [r.name('thing', names.things, 'a thing', 'the id of a thing'), r.text('group')];
  } else if (!has('direction'))
    r.missing(
      'a direction nudge names its direction',
      `add direction: ${orList(STYLE.directions.map((d) => `'${d}'`))}`,
    );
  else n.direction = r.word('direction', STYLE.directions, '$ is not a direction the locked style lays out in');
  return out.length === before ? n : null;
}

/** What a Show is for: one kind, thing or relationship type (§14). */
export const SHOW_FOR = 'a Show is for one kind, thing or relationship type';

/**
 * A property switched on or off for showing inline, checked: a property of the kind's things, of the thing, or of the
 * type's links, that it names; on unless it says off; in a view when it names one, whose name is the user's own.
 */
function showOf(raw: RawThing, names: StyledNames, out: Problem[]): Show | null {
  const r = reader(raw, names, out),
    before = out.length;
  const has = (k: string) => raw.props[k] !== undefined;
  const targets = ['kind', 'thing', 'type'].filter(has).length;
  if (!has('property')) r.missing('a Show names the property to show', "add property: '<name>'");
  else if (targets > 1) r.report(SHOW_FOR, 'remove all but one of them');
  else if (!targets) r.missing(SHOW_FOR, "add kind: '<Kind>', thing: '<id>' or type: '<TYPE>'");
  else {
    const kind = r.name('kind', names.kinds, 'a kind'),
      thing = r.name('thing', names.things, 'a thing', 'the id of a thing'),
      type = r.name('type', names.types, 'a relationship type');
    const of = kind ? { kind } : thing ? { thing } : type ? { type } : null;
    if (of) {
      const property = r.name(
        'property',
        names.properties(of),
        `a property of ${kind ?? thing ?? type}`,
        'a property it has',
      );
      const inline =
        raw.props.inline === undefined ? 'on' : r.word('inline', INLINE, `inline must be ${orList(INLINE)}`);
      const view = r.text('view');
      if (property && inline && out.length === before)
        return { property, ...of, ...(view === undefined ? {} : { view }), inline, at: raw.at };
    }
  }
  return null;
}

/**
 * Where arrowheads are hidden or shown, checked (§15): show or hide, for every link or the links of a relationship type
 * the graph has, in the whole graph or in a view, whose name is the user's own.
 */
function arrowsOf(raw: RawThing, names: StyledNames, out: Problem[]): Arrows | null {
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
  return { arrowheads, ...(view === undefined ? {} : { view }), ...(type === undefined ? {} : { type }), at: raw.at };
}

/** A look, checked: one view or path, one thing, kind or link, all in the graph, and at least one change that is sound. */
function lookOf(raw: RawThing, names: StyledNames, out: Problem[]): Look | null {
  const r = reader(raw, names, out),
    has = (k: string) => raw.props[k] !== undefined;
  if (has('view') === has('path')) {
    if (has('view')) r.report('a look is for one view or one path, not both', 'remove one of them');
    else
      r.missing(
        "a look is for a view or a path: add view: '<name>' or path: '<id>'",
        "add view: '<name>' or path: '<id>'",
      );
    return null;
  }
  const targets = [has('thing'), has('kind'), has('from') && has('type') && has('to')].filter(Boolean).length;
  if (targets !== 1) {
    if (targets) r.report('a look styles one thing, kind or link, not more', 'remove all but one of them');
    else
      r.missing('a look styles one thing, kind or link: add thing, kind, or from, type and to', 'add what it styles');
    return null;
  }
  if (!has('colour') && !has('line') && !has('format')) {
    r.missing(
      'a look changes a colour, a line or a format: add one',
      "add colour, line or format, such as line: 'dashed'",
    );
    return null;
  }
  const before = out.length,
    look: Look = { at: raw.at };
  const view = r.text('view'),
    path = r.name('path', names.paths, 'a path', 'the id of a path');
  const thing = r.name('thing', names.things, 'a thing', 'the id of a thing'),
    kind = r.name('kind', names.kinds, 'a kind');
  const from = r.name('from', names.things, 'a thing', 'the id of a thing'),
    type = r.name('type', names.types, 'a relationship type'),
    to = r.name('to', names.things, 'a thing', 'the id of a thing');
  if (out.length > before) return null;
  Object.assign(look, view === undefined ? { path } : { view });
  if (thing !== undefined) look.thing = thing;
  else if (kind !== undefined) look.kind = kind;
  else if (from !== undefined && type !== undefined && to !== undefined) look.link = { from, type, to };
  const colour = r.word('colour', STYLE_HUES, '$ is not a colour of the locked style');
  const means = r.text('means');
  if (colour !== undefined && !means)
    r.missing(
      `${colour} has no meaning written, so the legend cannot say what it means`,
      `add means: '<what ${colour} means here>'`,
    );
  else if (colour !== undefined) Object.assign(look, { colour, means });
  const line = r.word('line', LINES, `line must be ${orList(LINES)}`),
    format = r.word('format', FORMATS, `format must be ${orList(FORMATS)}`);
  if (line) look.line = line;
  if (format) look.format = format;
  return look.colour || look.line || look.format ? look : null;
}

/** What a view does with the things outside it, checked. */
function viewStyleOf(raw: RawThing, names: StyledNames, out: Problem[]): Checked['views'][number] | null {
  const r = reader(raw, names, out);
  // a view's name cannot be checked against the graph: views are query blocks, read elsewhere, so any name is taken
  const view = r.text('view');
  if (!view) r.missing('a ViewStyle names its view', "add view: '<the view's name>'");
  if (raw.props.outside === undefined) {
    r.missing('a ViewStyle says fade or hide', "add outside: 'fade' or 'hide'");
    return null;
  }
  const outside = r.word('outside', OUTSIDE, `outside must be ${orList(OUTSIDE)}`);
  return view && outside ? { view, outside, at: raw.at } : null;
}

/** How a view was shown, checked: each part that can be read is kept, each that cannot is a problem. */
function shownOf(raw: RawThing, names: StyledNames, out: Problem[]): Checked['shown'][number] | null {
  const r = reader(raw, names, out);
  const view = r.text('view');
  if (!view) {
    r.missing('a Shown names its view', "add view: '<the view's name>'");
    return null;
  }
  const shown: Checked['shown'][number] = { view, at: raw.at };
  const zoom = r.number('zoom');
  if (zoom !== undefined && zoom <= 0)
    r.report('zoom must be a number above 0', 'write a zoom above 0, such as zoom: 1');
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
  const selected = r.name('selected', names.things, 'a thing', 'the id of a thing');
  if (selected !== undefined) shown.selected = selected;
  return shown;
}

/** Each thing of a style graph checked on its own, in the order written: what it gives, and the problems found. */
export function checkThings(raws: RawThing[], names: StyledNames): Checked {
  const c: Checked = { nudges: [], shows: [], looks: [], views: [], shown: [], arrows: [], problems: [] };
  for (const raw of raws) {
    const kinds = raw.labels.filter((l) => (STYLE_KINDS as readonly string[]).includes(l));
    if (kinds.length !== 1 || raw.labels.length !== 1) {
      const other = raw.labels.find((l) => !kinds.includes(l));
      const message = other
        ? `${other} is not a kind of thing a style graph holds: ${KINDS}`
        : `a thing of a style graph is one of ${KINDS}`;
      c.problems.push(styleProblem(names.graph, raw.at, message, `write it as one of ${KINDS}, or remove it`));
      continue;
    }
    const p = c.problems;
    // a key the style graph does not know: reported on the key; the thing may not mean what it says, so it is left out
    // (its values at fault are still reported, but not what it lacks, which may be that key: the rename comes first)
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
    else push(c.shown, kept(shownOf(thing, names, p)));
  }
  return c;
}

const push = <T>(xs: T[], x: T | null) => {
  if (x) xs.push(x);
};
