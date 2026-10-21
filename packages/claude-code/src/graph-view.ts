// What the Claude Code pane shows for a note (spec §10, a Claude Code host):
// - its first graph, read and themed by the core in the host's palette from the one table. Graphviz lays it out through
//   node (graphviz-process.ts).
// - always the same graph as lines of text. They stand in, with the reason, wherever no drawing can be (spec §9).
// It is never a blank pane.
import {
  chosen,
  directions,
  formatCount,
  gqlBlocks,
  LAYOUT_LIMITS,
  PALETTES,
  readNote,
  tooLarge,
  word,
} from '@thoughtknot/core';
import type { Palette, Refusal } from '@thoughtknot/core';
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
export const noGraph = (): string => word('cc.no-graph');

/** What the pane says for a note whose graph blocks hold nothing yet. */
export const emptyGraph = (): string => word('cc.empty-graph');

const instead = () => word('cc.instead');

/** Why a graph is over the layout limits, in words. */
function refusalWords(r: Refusal): string {
  if (r.reason !== 'too-large') return word('cc.not-drawn', { instead: instead() });
  const n = formatCount;
  if (r.limit === 'text-bytes' || r.limit === 'text-lines') {
    const unit = word(r.limit === 'text-bytes' ? 'cc.unit.bytes' : 'cc.unit.lines');
    return word('cc.too-large-to-read', { size: n(r.count), unit, most: n(r.most) });
  }
  const what = r.limit === 'source' ? word('cc.unit.source') : r.limit === 'word' ? word('cc.unit.word') : r.limit;
  const size = r.atLeast ? word('cc.at-least', { size: n(r.count) }) : n(r.count);
  return word('cc.too-large-to-draw', { size, what, most: n(r.most), instead: instead() });
}

/** The view of a note's first graph, laid out by `lay` and themed in `palette`. */
export async function viewOf(
  note: string,
  lay: (dots: string[]) => Promise<Laid>,
  palette: Palette,
): Promise<GraphView> {
  const blocks = gqlBlocks(note);
  const reading = readNote(blocks.map((b) => b.text));
  if (reading.tooLarge) {
    const why = refusalWords(reading.tooLarge);
    return { title: word('cc.title.too-large'), alt: why, lines: [why], why };
  }
  const [drawing] = reading.graphs.values();
  if (!drawing) {
    const errors = reading.problems.filter((p) => p.severity === 'error');
    if (!errors.length && blocks.length)
      return { title: word('cc.title.empty'), alt: emptyGraph(), lines: [emptyGraph()] };
    if (!errors.length) return { title: word('cc.title.no-graph'), alt: noGraph(), lines: [noGraph()] };
    const alt = word('cc.not-read');
    const at = (p: (typeof errors)[number]) => (blocks[p.block]?.line ?? 0) + p.line;
    const lines = errors.map((p) => word('cc.problem-line', { line: at(p), message: p.message }));
    return { title: word('cc.title.not-read'), alt, lines: [alt, ...lines] };
  }

  const alt = word('cc.alt', {
    graph: drawing.graph,
    things: word('cc.things', { count: drawing.boxes.length }),
    links: word('cc.links', { count: drawing.links.length }),
  });
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
    return { ...asText, why: word('cc.too-large-for-pane', { most: SVG_MAX, instead: instead() }) };
  return { ...asText, svg };
}

/**
 * The pane's palette: the one that follows the system, carrying both the light and the dark colours and choosing by
 * prefers-color-scheme. The mod API says nothing of the desktop app's appearance. Claude Code's theme setting is the
 * terminal's, which draws no picture. So nothing is guessed, and the drawing takes the scheme the app hands its pages.
 */
export const PANE_PALETTE: Palette = PALETTES.system;

/** The note named after /graph, without the quotes a name with spaces may be given in. */
export function notePath(args: string): string {
  const t = args.trim();
  return /^(["']).*\1$/.test(t) && t.length > 1 ? t.slice(1, -1) : t;
}
