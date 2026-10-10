// What the Claude Code pane shows for a note (spec §10, a Claude Code host): its first graph, read and themed by the
// core in the host's palette from the one table, laid out by Graphviz through node (graphviz-process.ts); and always the
// same graph as lines of text, which stand in, with the reason, wherever no drawing can be (spec §9): never a blank pane.
import { chosen, directions, gqlBlocks, LAYOUT_LIMITS, PALETTES, readNote, tooLarge } from '@graph-note/core';
import type { Palette, Refusal } from '@graph-note/core';
import type { Laid } from './graphviz-process.ts';

/** One graph as the pane shows it: the SVG where it could be drawn, and always the same graph as lines of text. */
export interface GraphView {
  title: string;
  svg?: string;
  /** What the drawing says, for a reader who cannot see it; the first of `lines`. */
  alt: string;
  lines: string[];
  /** Why the graph is shown as text, when it is. */
  why?: string;
}

/** The most SVG a pane takes, in characters (the host's `Svg` element). */
export const SVG_MAX = 131072;

/** What the pane says for a note with no graph. */
export const NO_GRAPH = 'No graph in this note.';

const INSTEAD = 'It is shown as text instead.';

/** Why a graph is over the layout limits, in words. */
function refusalWords(r: Refusal): string {
  if (r.reason !== 'too-large') return `Not drawn. ${INSTEAD}`;
  const n = (x: number) => x.toLocaleString('en-GB');
  const what =
    r.limit === 'source' ? 'bytes of drawing instructions' : r.limit === 'word' ? 'characters in a word' : r.limit;
  return `Too large to draw: this graph has ${r.atLeast ? 'at least ' : ''}${n(r.count)} ${what}, and at most ${n(r.most)} are drawn. ${INSTEAD}`;
}

/** The view of a note's first graph, laid out by `lay` and themed in `palette`. */
export async function viewOf(
  note: string,
  lay: (dots: string[]) => Promise<Laid>,
  palette: Palette,
): Promise<GraphView> {
  const [drawing] = readNote(gqlBlocks(note).map((b) => b.text)).graphs.values();
  if (!drawing) return { title: 'No graph', alt: NO_GRAPH, lines: [NO_GRAPH] };

  const alt = `${drawing.graph}: ${drawing.boxes.length} things, ${drawing.links.length} links`;
  const asText = {
    title: drawing.graph,
    alt,
    lines: [alt, ...drawing.links.map((l) => `${l.from} —${l.reading}→ ${l.to}`)],
  };
  const refused = tooLarge(drawing, LAYOUT_LIMITS);
  if (refused) return { ...asText, why: refusalWords(refused) };

  const laid = directions(drawing);
  const drawn = await lay(laid.map((d) => d.dot));
  if ('why' in drawn) return { ...asText, why: drawn.why };
  const { svg } = chosen(laid, drawn.svgs, palette);
  if (svg.length > SVG_MAX)
    return { ...asText, why: `The drawing is too large for a pane (over ${SVG_MAX} characters). ${INSTEAD}` };
  return { ...asText, svg };
}

/** The palette for Claude Code's theme setting: a light theme takes the light entry, every other the dark. */
export function paletteFor(theme: string | undefined): Palette {
  return theme?.startsWith('light') ? PALETTES.light : PALETTES.dark;
}

/** The note named after /graph, without the quotes a name with spaces may be given in. */
export function notePath(args: string): string {
  const t = args.trim();
  return /^(["']).*\1$/.test(t) && t.length > 1 ? t.slice(1, -1) : t;
}
