// The style graph's shape (editor spec §2, §6, §7): what a style block holds once read — nudges, the properties shown,
// looks for views and paths, whether a view fades or hides what is outside it, and how a view was shown — and the words
// each may use. A style graph is written in the same notation as the data, in its own block, and never in the data.
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

/** The kinds of thing a style graph holds, by label. */
export const STYLE_KINDS = ['Nudge', 'Show', 'Look', 'ViewStyle', 'Shown'] as const;
/** One of the kinds of thing a style graph holds. */
export type StyleKind = (typeof STYLE_KINDS)[number];

/**
 * The keys each kind of style thing may have (§2, style_words_checked): the ones `styleEdit` writes and the checks read.
 * A key of any other name is a problem, reported with the nearest of these as its fix. A thing's `id` is its name, not a key.
 */
export const STYLE_KEYS: Record<StyleKind, readonly string[]> = {
  Nudge: ['word', 'thing', 'other', 'group', 'direction'],
  Show: ['property', 'kind', 'thing'],
  Look: ['view', 'path', 'thing', 'kind', 'from', 'type', 'to', 'colour', 'line', 'format', 'means'],
  ViewStyle: ['view', 'outside'],
  Shown: ['view', 'zoom', 'x', 'y', 'frame', 'selected'],
};

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

/** A property shown inline (§7), for every thing of a kind or for one thing. Read and checked now; drawn in slice 3. */
export interface Show {
  property: string;
  kind?: string;
  thing?: string;
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

/** How a view was shown, saved when the user asked (§7, view_saved_as_shown): only what was written and could be read. */
export interface Shown {
  zoom?: number;
  x?: number;
  y?: number;
  frame?: Frame;
  selected?: string;
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
  return { nudges: [], shows: [], looks: [], views: new Map(), shown: new Map() };
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
