// A tag for each colour a view's looks use (editor spec §44, colour_never_alone). A look that sets only a colour would
// be told on the drawing by that colour alone. So each colour of the legend has a numbered tag: ①, ②, ③ and on.
// Each box or link the colour is on carries the tag, and the legend gives it beside the meaning.
import type { LegendEntry } from './style-graph.ts';

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

/** The tag of the n-th colour, from 0: a circled number up to 20, then the number in brackets. */
export const lookTag = (n: number): string => CIRCLED[n] ?? `(${n + 1})`;

/** Each colour of a legend with its tag, in the legend's order. */
export const lookTags = (legend: readonly LegendEntry[]): Map<string, string> =>
  new Map(legend.map((e, i) => [e.colour, lookTag(i)]));
