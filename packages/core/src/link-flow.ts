// Links that show flow by moving (editor spec §7, links_show_flow): dashes running along a link's arrow, or a dot
// travelling along it, chosen in the style graph for every link or one relationship type, in the whole graph or a view,
// and still unless a Flow moves it (flow_in_style_graph). Movement is never the only signal (motion_not_alone): a Flow
// that moves links must say what the movement means, each moving link carries an icon on its label, and its legend and
// screen-reader name say the movement and its meaning in words. The source carries only classes and the still dashes;
// the movement itself is a host's style sheet, or an export's (export-motion.ts), each still under reduced motion
// (motion_reduced_respected). The Python library writes the same source (`graphspec/style/flow.py`).
import GraphLayout from '@graph-note/graph-spec/src/graph-layout.js';
import { LINK_LINE, linkTypes } from './arrows.ts';
import { drawingSource, STYLE } from './layout.ts';
import type { GraphDrawing, Problem } from './note-reading.ts';
import type { RawThing, StyledNames } from './style-checks.ts';
import { FLOW_MOTIONS, orList } from './style-graph.ts';
import type { Flow, StyleGraph } from './style-graph.ts';
import { reader } from './style-reader.ts';

/** A way a link moves, still aside. */
export type Moving = Exclude<Flow['motion'], 'still'>;

/** The icon on a moving link's label, one for each way it moves: what it means is in the legend. */
export const FLOW_ICONS: Record<Moving, string> = { dashes: '⇢', dot: '•' };

/** How each way of moving is said in words, in a legend and to a screen reader. */
export const FLOW_WORDS: Record<Moving, string> = { dashes: 'moving dashes', dot: 'a moving dot' };

/** What a Flow that moves links lacks when it does not say what the movement means (motion_not_alone). */
export const MEANS_NEEDED = 'a link that moves must say what its movement means, so it is never told by movement alone';

/** A link that moves: its index in the order the source draws the links, how it moves, and what that means. */
export interface FlowLink {
  index: number;
  motion: Moving;
  means: string;
}

/** One row of a flow legend: the icon, the movement and its meaning, and all of it in words. */
export interface FlowLegendEntry {
  icon: string;
  motion: Moving;
  means: string;
  words: string;
}

/**
 * A Flow, checked (§7): how its links move — dashes, a dot, or still — for every link or the links of a relationship type
 * the graph has, in the whole graph or a view, whose name is the user's own; one that moves links says what the movement
 * means, or it is a problem and its links stay still.
 */
export function flowOf(raw: RawThing, names: StyledNames, out: Problem[]): Flow | null {
  const r = reader(raw, names, out),
    before = out.length;
  if (raw.props.motion === undefined) {
    r.missing('a Flow says how its links move', `add motion: ${orList(FLOW_MOTIONS.map((w) => `'${w}'`))}`);
    return null;
  }
  const motion = r.word('motion', FLOW_MOTIONS, `motion must be ${orList(FLOW_MOTIONS)}`);
  const type = r.name('type', names.types, 'a relationship type'),
    view = r.text('view'),
    means = r.text('means');
  if (motion && motion !== 'still' && !means && out.length === before)
    r.missing(MEANS_NEEDED, "add means: '<what the movement means>'");
  if (!motion || out.length !== before) return null;
  return {
    motion,
    ...(means === undefined ? {} : { means }),
    ...(view === undefined ? {} : { view }),
    ...(type === undefined ? {} : { type }),
    at: raw.at,
  };
}

/**
 * How links of `type` move in `view` (none: the whole graph): as the most particular Flow for them says — one for the view
 * over one for the whole graph, then one for the type over one for every link, the first written when two are as
 * particular — and null when they are still, as they are when no Flow says otherwise.
 */
export function flowFor(
  style: Pick<StyleGraph, 'flows'>,
  view: string | undefined,
  type: string,
): { motion: Moving; means: string } | null {
  let chosen: { flow: Flow; rank: number } | undefined;
  for (const f of style.flows) {
    if ((f.view !== undefined && f.view !== view) || (f.type !== undefined && f.type !== type)) continue;
    const rank = (f.view !== undefined ? 2 : 0) + (f.type !== undefined ? 1 : 0);
    if (!chosen || rank > chosen.rank) chosen = { flow: f, rank };
  }
  const f = chosen?.flow;
  return !f || f.motion === 'still' ? null : { motion: f.motion, means: f.means ?? '' };
}

/**
 * The links of a drawing that move in `view`, by their index among the links written (a link guessed from a near miss of
 * its type goes by the type it is taken for, as its arrowhead does); a link guessed from a near miss of a name, drawn as
 * a guess, never moves. Empty when the style graph moves none.
 */
export function flowLinks(
  drawing: Pick<GraphDrawing, 'links' | 'estimates'>,
  style: Pick<StyleGraph, 'flows'>,
  view?: string,
): FlowLink[] {
  if (!style.flows.length) return [];
  return linkTypes(drawing).flatMap((type, index) => {
    const f = flowFor(style, view, type);
    return f ? [{ index, ...f }] : [];
  });
}

/** A link line laid out from its far end (`dir=back`), so its line runs against the link. */
const BACK = ', dir=back];';

/** The opening of a link line, up to its label's text, and that text. */
const LABEL = /^( {2}"[^"]*" -> "[^"]*" \[label=")([^"]*)"/;

/**
 * The Graphviz source `dot` with each link of `flow` (indexes of its link lines, in order) marked as moving: its label
 * opened by the icon of its movement, the classes a style sheet moves it by (`graph-note-flow`, `-dashes` or `-dot`, and
 * `-back` when its line runs against it), and dashes drawn dashed, so they show when still. The arrowhead and everything
 * else of the line is as it was. With nothing to move, `dot` unchanged.
 */
export function flowSource(dot: string, flow: readonly FlowLink[]): string {
  if (!flow.length) return dot;
  const by = new Map(flow.map((f) => [f.index, f]));
  let n = -1;
  return dot
    .split('\n')
    .map((line) => {
      if (!LINK_LINE.test(line)) return line;
      const f = by.get(++n);
      if (!f) return line;
      const cls = `graph-note-flow graph-note-flow-${f.motion}${line.endsWith(BACK) ? ' graph-note-flow-back' : ''}`;
      const dashed = f.motion === 'dashes' ? ', style=dashed' : '';
      return line.replace(
        LABEL,
        (_, open: string, label: string) => `${open}${FLOW_ICONS[f.motion]} ${label}", class="${cls}"${dashed}`,
      );
    })
    .join('\n');
}

/**
 * The links whose line Graphviz draws from their far end in `rankdir` (indexes in the order drawn), as the drawing is
 * laid out, its diagram type among the rest: something moving along such a line runs backwards, so it reads forwards.
 */
export function reversedLinks(drawing: GraphDrawing, rankdir: string): number[] {
  const typed = GraphLayout.typedSource(drawingSource(drawing, rankdir as 'LR' | 'TB'), drawing.diagram, STYLE);
  return typed
    .split('\n')
    .filter((l) => LINK_LINE.test(l))
    .flatMap((l, i) => (l.endsWith(BACK) ? [i] : []));
}

/** A moving link as a screen reader hears it, after its reading: the movement, and what it means. */
export const flowSaid = (f: Pick<FlowLink, 'motion' | 'means'>): string => `${FLOW_WORDS[f.motion]}: ${f.means}`;

/** The legend of the links that move: each movement and meaning once, in the order first drawn, with its icon. */
export function flowLegend(flow: readonly FlowLink[]): FlowLegendEntry[] {
  const out: FlowLegendEntry[] = [];
  for (const f of flow)
    if (!out.some((e) => e.motion === f.motion && e.means === f.means))
      out.push({
        icon: FLOW_ICONS[f.motion],
        motion: f.motion,
        means: f.means,
        words: `${FLOW_ICONS[f.motion]} ${flowSaid(f)}`,
      });
  return out;
}
