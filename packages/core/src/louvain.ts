// Finding groups by how things link: the Louvain method. It lives in the graph spec library. So clusters (§31) and
// big-graph groups (§53, scale_groups) are found by one method (wiki/Clusters-design.md). This module gives the core
// its name for it, and a typed reader of number lists.
import gs from '@thoughtknot/graph-spec';

/** The number at `i` of a list of numbers, where `i` is known to be in it. */
export const at = (list: ArrayLike<number>, i: number): number => list[i] as number;

/**
 * The group of each of `n` things, from its links as [from, to] by the things' numbers (0 to n - 1). Groups are
 * numbered from 0, in the order of their first thing.
 */
export const louvain: (n: number, links: readonly (readonly [number, number])[]) => number[] = gs.louvain;
