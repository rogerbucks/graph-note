// Focus on a selection, and the highlight under the pointer (editor spec §25, slice 3). It says which things and links
// stay at full strength when a thing or a link is selected, and how far that reaches. Host-free and pure: it says only
// what is kept. The host fades the rest, so nothing here moves, hides or changes a thing, and nothing is written to the
// note.
import type { GraphDrawing } from './note-reading.ts';

/** One link as focus sees it: the two things it joins and, where the drawing has it, its relationship type. */
export interface FocusEdge {
  from: string;
  to: string;
  type?: string;
}

/** What is selected: a thing, by its key, or a link, by its place among the drawing's links (`edgesOf`). */
export type FocusTarget = { thing: string } | { edge: number };

/** What stays at full strength: the things by key, and the links by their place among the drawing's links. */
export interface Kept {
  things: Set<string>;
  edges: Set<number>;
}

/** How many steps along its links focus reaches from a thing: one, or two. */
export type FocusDepth = 1 | 2;

/**
 * How a faded thing is drawn (focus_readable): lighter, never gone. Its outline is no heavier than the drawing's
 * ordinary line (1), and its fill is none. Its words and labels are at `text` of their strength. That is the most that
 * still leaves the worst of them at 4.5:1, a yellow label on the light page. `focus.test.js` works it out in both
 * themes. Lines and outlines keep their colour and their full strength, so they keep their 3:1. A line is never drawn
 * thinner than that ordinary width.
 */
export const FADE = { fill: 0, width: 1, text: 0.95 } as const;

/** How a thing kept at full strength is drawn beyond its colour (focus_readable): a heavier outline than a faded one. */
export const KEPT = { width: 2 } as const;

/** The depth a setting names: `two` is two steps, anything else the default, one. */
export function depthOf(setting: string): FocusDepth {
  return setting === 'two' ? 2 : 1;
}

/**
 * The links of a drawing as its SVG draws them, in order: each written link, then each estimate of a name. An estimate
 * of a type is the written link it stands for. The position in this list is the number of the SVG's edge, less one.
 */
export function edgesOf(d: GraphDrawing): FocusEdge[] {
  return [
    ...d.links.map((l) => ({ from: l.from, to: l.to, type: l.type })),
    ...d.estimates.filter((e) => e.kind === 'name').map((e) => ({ from: e.from, to: e.to, type: e.type })),
  ];
}

/** Where estimate `n` of the drawing's estimates sits among `edgesOf`'s links; -1 when there is none. */
export function estimateEdge(d: GraphDrawing, n: number): number {
  const e = d.estimates[n];
  if (!e) return -1;
  if (e.kind === 'type') return e.index ?? -1;
  return d.links.length + d.estimates.slice(0, n).filter((x) => x.kind === 'name').length;
}

/** Each thing's links, in the order of the links: the place of the link and the thing at its other end. */
export function adjacency(edges: readonly FocusEdge[]): Map<string, [number, string][]> {
  const out = new Map<string, [number, string][]>();
  const add = (at: string, i: number, other: string) => {
    const list = out.get(at);
    if (list) list.push([i, other]);
    else out.set(at, [[i, other]]);
  };
  edges.forEach((e, i) => {
    add(e.from, i, e.to);
    if (e.to !== e.from) add(e.to, i, e.from);
  });
  return out;
}

/** Every thing within `steps` links of `key`, either way along each, with how many links away it is. */
export function within(edges: readonly FocusEdge[], key: string, steps: number): Map<string, number> {
  const adj = adjacency(edges);
  const away = new Map([[key, 0]]);
  for (let frontier = [key], d = 1; frontier.length && d <= steps; d++) {
    const next: string[] = [];
    for (const at of frontier)
      for (const [, other] of adj.get(at) ?? [])
        if (!away.has(other)) {
          away.set(other, d);
          next.push(other);
        }
    frontier = next;
  }
  return away;
}

/**
 * What a selection keeps at full strength (focus_neighbours, focus_link, focus_depth). A thing keeps itself, its links
 * and the things at their other ends, and with `depth` 2 those things' links and the things beyond. A link keeps itself
 * and the two things it joins, however far focus reaches. A link that is not there gives no focus.
 */
export function focusOf(edges: readonly FocusEdge[], target: FocusTarget, depth: FocusDepth = 1): Kept | null {
  if ('edge' in target) {
    const e = edges[target.edge];
    return e ? { things: new Set([e.from, e.to]), edges: new Set([target.edge]) } : null;
  }
  const adj = adjacency(edges),
    kept: Kept = { things: new Set([target.thing]), edges: new Set() };
  for (let frontier = [target.thing], d = 1; frontier.length && d <= depth; d++) {
    const next: string[] = [];
    for (const at of frontier)
      for (const [i, other] of adj.get(at) ?? []) {
        kept.edges.add(i);
        if (!kept.things.has(other)) {
          kept.things.add(other);
          next.push(other);
        }
      }
    frontier = next;
  }
  return kept;
}

/**
 * What the highlight under the pointer, the keyboard focus or a touch's tap marks (hover_highlight). It is a thing
 * alone, or a link and the two things it joins. A link that is not there highlights nothing.
 */
export function highlightOf(edges: readonly FocusEdge[], target: FocusTarget): Kept | null {
  if ('thing' in target) return { things: new Set([target.thing]), edges: new Set() };
  return focusOf(edges, target);
}

/** The selection of one drawing, and so its focus: set by selecting, cleared by an empty tap or Escape (focus_cleared). */
export class FocusState {
  /** What is selected, if anything. */
  target: FocusTarget | null = null;

  /** Selects a thing or a link, which moves the focus to it. */
  select(target: FocusTarget): void {
    this.target = target;
  }

  /** Clears the selection and the focus; true when there was something to clear, so Escape can leave full screen otherwise. */
  clear(): boolean {
    const had = this.target !== null;
    this.target = null;
    return had;
  }

  /** What the selection keeps at full strength, `depth` steps out; null when nothing is selected, so nothing is faded. */
  kept(edges: readonly FocusEdge[], depth: FocusDepth): Kept | null {
    return this.target ? focusOf(edges, this.target, depth) : null;
  }
}
