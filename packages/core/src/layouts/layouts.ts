// The layouts: one contract for every way of placing a graph's things (editor spec §53, layout_contract). Roger, 24 Oct
// 2026, asked for the layouts to sit behind one defined interface, so new ones can be added as we go.
//
// A layout takes a graph's shape and gives each thing a spot, in two dimensions or three, in its own units. It draws
// nothing: a view fits the spots into its space and draws marks there. Every layout keeps the same promises:
// - the same shape gives the same spots, every time;
// - given the spots from last time (warm start), it starts from them and moves them little, so a small edit moves little;
// - a key it was not given never comes back, and every key it was given does.
//
// A new layout is one file that exports a `Layout` and one line in `LAYOUTS` below. Host-free and pure.
import type { GraphShape } from '../types-shape.ts';
import { forceLayout } from '../view-types/force-view.ts';
import { forceLayout3d } from './force-3d.ts';

/** A spot in two dimensions, across and down, or in three, with up as the third. */
export type Spot<D extends 2 | 3> = D extends 2 ? [number, number] : [number, number, number];

/** Each thing's spot, by its key. */
export type Spots<D extends 2 | 3> = ReadonlyMap<string, Spot<D>>;

/** One way of placing a graph's things. */
export interface Layout<D extends 2 | 3 = 2 | 3> {
  /** Its name in a style graph or a saved view; it never changes once a layout ships. */
  readonly id: string;
  /** How many dimensions its spots have. */
  readonly dims: D;
  /** Each thing of `shape` placed, starting from `previous` where a thing has a spot already. */
  place(shape: GraphShape, previous?: Spots<D>): Map<string, Spot<D>>;
}

/** Links pull, near things push apart, on a page (view-types/force-view.ts). */
export const FORCE_2D: Layout<2> = { id: 'force', dims: 2, place: forceLayout };

/** Links pull, near things push apart, in space: depth keeps apart links a page would cross (force-3d.ts). */
export const FORCE_3D: Layout<3> = { id: 'force-3d', dims: 3, place: forceLayout3d };

/** Every layout, in the order offered. */
export const LAYOUTS: readonly Layout[] = [FORCE_2D, FORCE_3D];

/** The layout named `id`, of `dims` dimensions, or undefined where there is none. */
export function layoutById<D extends 2 | 3>(id: string, dims: D): Layout<D> | undefined {
  return LAYOUTS.find((l): l is Layout<D> => l.id === id && l.dims === dims);
}

/** The layouts of `dims` dimensions, in the order offered. */
export function layoutsOf<D extends 2 | 3>(dims: D): Layout<D>[] {
  return LAYOUTS.filter((l): l is Layout<D> => l.dims === dims);
}
