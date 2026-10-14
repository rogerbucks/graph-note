// The style graph's shape (editor spec §2, §6, §7, §14, §15): what a style block holds once read — nudges, the properties
// shown inline, looks for views and paths, whether a view fades or hides what is outside it, how a view was shown,
// where arrowheads are hidden, the diagram type chosen, and how links move — and the words each may use. A style graph is written in the same notation as the data, in
// its own block, and never in the data.
import { distance } from './estimates.ts';
import { STYLE } from './layout.ts';
import type { Problem } from './note-reading.ts';

/** The four words a nudge may be (§6, four_nudge_words). */
export const NUDGE_WORDS = ['beside', 'before', 'group', 'direction'] as const;
/** One of the four nudge words. */
export type NudgeWord = (typeof NUDGE_WORDS)[number];

/** The lines a look may draw a box's border or a link in. */
export const LINES = ['solid', 'dashed', 'dotted', 'bold'] as const;
/** One of the lines a look may give. */
export type LineStyle = (typeof LINES)[number];

/** The formats a look may give a box's text or a link's label. */
export const FORMATS = ['plain', 'bold', 'italic'] as const;
/** One of the formats a look may give. */
export type TextFormat = (typeof FORMATS)[number];

/** What a view does with the things outside it (§7, fade_or_hide_in_style): fade is the default when none is written. */
export const OUTSIDE = ['fade', 'hide'] as const;
/** Fade or hide. */
export type Outside = (typeof OUTSIDE)[number];

/**
 * The colours styling may use (§7, styling_keeps_locked_rules): the locked style's own hues, by name — its kinds' and its
 * readings', and red and green, which it keeps for meaning (for and against). Never a raw colour value: a hue is drawn
 * through the locked blends (theme.ts, `hueColour`), so it meets the locked contrast in both themes.
 */
export const STYLE_HUES: readonly string[] = [...new Set([...STYLE.kind_hues, ...STYLE.edge_hues, 'red', 'green'])];

/** Whether a property is shown inline (§14, properties_switch): on, unless a Show switches it off. */
export const INLINE = ['on', 'off'] as const;
/** On or off. */
export type InlineSwitch = (typeof INLINE)[number];

/** Whether links are drawn with their arrowheads (§15, arrows_switchable): shown, unless the style graph hides them. */
export const ARROWHEADS = ['show', 'hide'] as const;
/** Show or hide. */
export type ArrowheadsChoice = (typeof ARROWHEADS)[number];

/** The diagram types (§15, diagram_type_set): what fits each, and how each is drawn, is in types.ts. */
export const DIAGRAM_TYPES = ['network', 'tree', 'flow', 'radial', 'lanes', 'timeline', 'table'] as const;
/** One of the diagram types. */
export type DiagramType = (typeof DIAGRAM_TYPES)[number];

/**
 * How a link moves to show flow (§7, links_show_flow): dashes running along its arrow, a dot travelling along it, or
 * still, which takes back a movement chosen for a wider place. Links are still unless a Flow moves them (link-flow.ts).
 */
export const FLOW_MOTIONS = ['dashes', 'dot', 'still'] as const;
/** One of the ways a link may move, or still. */
export type FlowMotion = (typeof FLOW_MOTIONS)[number];

/**
 * How links are drawn (§25, untangle_routing): curved, as Graphviz draws them unless told otherwise, straight, or with
 * right angles, so a dense graph can trade curves for fewer crossings.
 */
export const ROUTINGS = ['curved', 'straight', 'right-angled'] as const;
/** One of the routings. */
export type Routing = (typeof ROUTINGS)[number];

/** A switch written in the style graph: links merged into trunks (§25, untangle_merge), or a view's switches saved. */
export const ON_OFF = ['on', 'off'] as const;
/** On or off. */
export type OnOff = (typeof ON_OFF)[number];

/** The kinds of thing a style graph holds, by label. */
export const STYLE_KINDS = [
  'Nudge',
  'Show',
  'Look',
  'ViewStyle',
  'Shown',
  'Arrows',
  'Diagram',
  'Flow',
  'Links',
] as const;
/** One of the kinds of thing a style graph holds. */
export type StyleKind = (typeof STYLE_KINDS)[number];

/**
 * The keys each kind of style thing may have (§2, style_words_checked): the ones `styleEdit` writes and the checks read.
 * A key of any other name is a problem, reported with the nearest of these as its fix. A thing's `id` is its name, not a key.
 */
export const STYLE_KEYS: Record<StyleKind, readonly string[]> = {
  Nudge: ['word', 'thing', 'other', 'group', 'direction'],
  Show: ['property', 'kind', 'thing', 'type', 'view', 'inline'],
  Look: ['view', 'path', 'thing', 'kind', 'from', 'type', 'to', 'colour', 'line', 'format', 'means'],
  ViewStyle: ['view', 'outside'],
  Shown: ['view', 'zoom', 'x', 'y', 'frame', 'selected', 'labels', 'hubs', 'groups', 'merge'],
  Arrows: ['arrowheads', 'view', 'type'],
  Diagram: ['type', 'view', 'relationship'],
  Flow: ['motion', 'means', 'type', 'view'],
  Links: ['view', 'routing', 'merge'],
};

/** A word as a sentence says it before a kind's name: `an Arrows`, `a Show`. */
export const article = (word: string): string => (/^[AEIOU]/i.test(word) ? 'an' : 'a');

/** Where a thing of the style graph is written: its block (index in the note), its line there (1 = the graph line), its id. */
export interface StyleAt {
  block: number;
  line: number;
  id: string;
}

/** A nudge to the layout (§6): beside and before name two things, group a thing and its group, direction a direction. */
export interface Nudge {
  word: NudgeWord;
  thing?: string;
  other?: string;
  /** The group's label, as drawn on the box around its things. */
  group?: string;
  /** One of the locked style's directions (`STYLE.directions`). */
  direction?: string;
  at: StyleAt;
}

/**
 * A property switched on or off for showing inline (§14, properties_switch): for every thing of a kind, for one thing, or
 * for every link of a relationship type; in the whole graph, or in one view (properties_remembered). Drawn below the text
 * of its box or link (inline-properties.ts).
 */
export interface Show {
  property: string;
  kind?: string;
  thing?: string;
  /** A relationship type: the property of each of its links. */
  type?: string;
  /** The view it is chosen for; none, the whole graph. */
  view?: string;
  inline: InlineSwitch;
  at: StyleAt;
}

/**
 * Whether links are drawn with their arrowheads (§15, arrows_switchable): for every link, or for the links of one
 * relationship type; in the whole graph, or in one view. Shown unless hidden (arrows_shown_unless_hidden; arrows.ts).
 */
export interface Arrows {
  arrowheads: ArrowheadsChoice;
  /** The view it is chosen for; none, the whole graph. */
  view?: string;
  /** The relationship type whose links it is for; none, every link. */
  type?: string;
  at: StyleAt;
}

/**
 * The diagram type chosen (§15, type_remembered): for the whole graph, or for one view; for a tree, the relationship it
 * follows. Drawn only while the data fits it (types.ts, `diagramFor`).
 */
export interface Diagram {
  type: DiagramType;
  /** The view it is chosen for; none, the whole graph. */
  view?: string;
  /** For a tree: the relationship type whose links are its branches; none, the one that makes the best tree. */
  relationship?: string;
  at: StyleAt;
}

/**
 * How links are drawn (§25): their routing (untangle_routing), and whether the links running between the same two
 * groups are merged into shared trunks (untangle_merge); for the whole graph, or for one view.
 */
export interface Links {
  routing?: Routing;
  merge?: OnOff;
  /** The view it is chosen for; none, the whole graph. */
  view?: string;
  at: StyleAt;
}

/**
 * How links move (§7, flow_in_style_graph): for every link, or the links of one relationship type; in the whole graph,
 * or in one view. A moving link always says what its movement means (`means`, motion_not_alone), in its legend and to a
 * screen reader, and carries an icon on its label. Still unless a Flow moves it (link-flow.ts).
 */
export interface Flow {
  motion: FlowMotion;
  /** What the movement means, in words: required for dashes and a dot, so movement is never the only signal. */
  means?: string;
  /** The view it is chosen for; none, the whole graph. */
  view?: string;
  /** The relationship type whose links it is for; none, every link. */
  type?: string;
  at: StyleAt;
}

/** A link, by its two ends and its relationship type. */
export interface LinkTarget {
  from: string;
  type: string;
  to: string;
}

/** A look (§7, styled_paths_and_views): within one view or one path, the colour, line and format of a thing, kind or link. */
export interface Look {
  view?: string;
  path?: string;
  thing?: string;
  kind?: string;
  link?: LinkTarget;
  /** A hue of `STYLE_HUES`, always with `means`, so the legend says what it means. */
  colour?: string;
  line?: LineStyle;
  format?: TextFormat;
  means?: string;
  at: StyleAt;
}

/** What a view does with the things outside it. */
export interface ViewStyle {
  outside: Outside;
}

/** An area of the drawing, in its own units. */
export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How a view was shown, saved when the user asked (§7, view_saved_as_shown): only what was written and could be read;
 * with the View menu's switches as they stood (§25, view_switch_view_only).
 */
export interface Shown {
  zoom?: number;
  x?: number;
  y?: number;
  frame?: Frame;
  selected?: string;
  labels?: OnOff;
  hubs?: OnOff;
  groups?: OnOff;
  merge?: OnOff;
}

/** A graph's style, read from its style blocks and checked: only what is sound is here; the rest is in the problems. */
export interface StyleGraph {
  nudges: Nudge[];
  shows: Show[];
  looks: Look[];
  /** Each view's setting for what is outside it, by view name. */
  views: Map<string, ViewStyle>;
  /** How each view was shown, by view name. */
  shown: Map<string, Shown>;
  /** The direction a direction nudge sets, if any. */
  direction?: string;
  /** Where arrowheads are hidden or shown again, in the order written. */
  arrows: Arrows[];
  /** The diagram types chosen, for the whole graph or a view, in the order written. */
  diagrams: Diagram[];
  /** Where links move, and how, in the order written; none, every link still (flow_in_style_graph). */
  flows: Flow[];
  /** How links are routed and whether they are merged, for the whole graph or a view, in the order written. */
  links: Links[];
}

/** Where styling applies: a view, or a path; with neither, the plain drawing, which keeps the locked style. */
export interface StyleScope {
  view?: string;
  path?: string;
}

/** What a look is asked for: a thing, with its kinds as a box shows them (`A · B`), or a link. */
export type StyleTarget = { thing: string; kind?: string } | { link: LinkTarget };

/** The look of a thing or link, for the host to draw: a named hue, never a raw value; a line; a format. */
export interface ThingLook {
  hue?: string;
  line?: LineStyle;
  format?: TextFormat;
}

/** One row of a legend: a colour, and what it means. */
export interface LegendEntry {
  colour: string;
  means: string;
}

/** A style graph with nothing in it: the locked style. */
export function emptyStyle(): StyleGraph {
  return {
    nudges: [],
    shows: [],
    looks: [],
    views: new Map(),
    shown: new Map(),
    arrows: [],
    diagrams: [],
    flows: [],
    links: [],
  };
}

/**
 * A problem with the style of `graph`, on the line of the style thing at `at`: an error, as what it names is left out of
 * the style, and the graph is drawn without it. Listed with the graph it styles, so it is shown with that drawing.
 */
export function styleProblem(
  graph: string,
  at: StyleAt,
  message: string,
  fix: string,
  edit: Pick<Problem, 'replace' | 'span'> = {},
): Problem {
  return { graph, block: at.block, line: at.line, severity: 'error', message, fix, ...edit };
}

/** Words joined as a sentence lists them: "a, b or c". */
export const orList = (xs: readonly string[]): string =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`;

/**
 * The fix for a word that is not one of `among`: the nearest by edit distance — always, when `always` is set (a nudge's
 * word, §6); otherwise only when it is close (within two letters, or half the word) — else the list to choose from.
 * Case is ignored on both sides, so 'tb' is fixed to TB, the direction it means.
 */
export function wordFix(written: string, among: readonly string[], always = false): { fix: string; nearest?: string } {
  let best = Infinity,
    nearest: string | undefined;
  for (const w of among) {
    const d = distance(written.toLowerCase(), w.toLowerCase());
    if (d < best) [best, nearest] = [d, w];
  }
  if (nearest !== undefined && (always || best <= Math.max(2, Math.floor(written.length / 2))))
    return { fix: `change ${written} to ${nearest}`, nearest };
  return { fix: `change ${written} to ${among.length > 2 ? 'one of ' : ''}${orList(among)}` };
}
