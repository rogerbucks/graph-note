// Finding groups by how things link: the Louvain method (Blondel and others, 2008). It is used for a massive graph
// with no groups of its own (editor spec §53, scale_groups; wiki/Massive-graphs-design.md, way E). Things that link to
// each other more than to the rest end up in one group.
//
// Host-free and pure. It is the same every time for the same links. Things are visited in their written order, and a
// tie keeps the group a thing is already in. Links are taken both ways, and two links between the same two things
// count twice. A thing with no links stays a group of its own.
//
// It works in rounds. In each round every thing moves to the neighbouring group that gains the most. When almost
// nothing moves, each group becomes one thing of a smaller graph, and the next round starts on that. It stops when a
// round joins nothing. Plain number arrays keep it fast.

/** The most passes over the things in one round, so a graph that keeps moving still stops. */
const PASSES = 20;
/** A pass that moves no more than one thing in this many ends its round. */
const SETTLED = 1000;
/** The most rounds, each on a smaller graph. */
const ROUNDS = 12;

/** The number at `i` of a list of numbers, where `i` is known to be in it. */
export const at = (list: ArrayLike<number>, i: number): number => list[i] as number;

/** Links as three lists of the same length: from, to, and how much each counts. */
interface Pairs {
  a: Int32Array;
  b: Int32Array;
  w: Float64Array;
}

/** For each thing, its neighbours (`to`, from `start[i]` to `start[i + 1]`) and how much each link counts. */
interface Links {
  start: Int32Array;
  to: Int32Array;
  weight: Float64Array;
}

/** The links of `n` things, each pair taken both ways. A thing's links to itself are left out. */
function linksOf(n: number, { a, b, w }: Pairs): Links {
  const start = new Int32Array(n + 1);
  for (let e = 0; e < a.length; e++) {
    const x = at(a, e),
      y = at(b, e);
    if (x === y) continue;
    start[x + 1] = at(start, x + 1) + 1;
    start[y + 1] = at(start, y + 1) + 1;
  }
  for (let i = 0; i < n; i++) start[i + 1] = at(start, i + 1) + at(start, i);
  const fill = start.slice(0, n),
    to = new Int32Array(at(start, n)),
    weight = new Float64Array(at(start, n));
  for (let e = 0; e < a.length; e++) {
    const x = at(a, e),
      y = at(b, e);
    if (x === y) continue;
    const fx = at(fill, x),
      fy = at(fill, y);
    to[fx] = y;
    weight[fx] = at(w, e);
    to[fy] = x;
    weight[fy] = at(w, e);
    fill[x] = fx + 1;
    fill[y] = fy + 1;
  }
  return { start, to, weight };
}

/** `group` numbered again from 0, in the order of each group's first thing. Gives how many groups there are. */
function renumber(group: Int32Array): number {
  const number = new Int32Array(group.length).fill(-1);
  let groups = 0;
  for (let i = 0; i < group.length; i++) {
    const g = at(group, i);
    if (at(number, g) < 0) number[g] = groups++;
    group[i] = at(number, g);
  }
  return groups;
}

/**
 * One round: each thing moves to the neighbouring group that gains the most, until almost nothing moves. `degree` is
 * each thing's weight of links, its links to itself counted too. Gives each thing's group, numbered from 0 in order of
 * first thing, how many groups there are, and whether anything moved.
 */
function moveRound(n: number, { start, to, weight }: Links, degree: Float64Array, total: number) {
  const group = Int32Array.from({ length: n }, (_, i) => i),
    sum = Float64Array.from(degree),
    near = new Float64Array(n).fill(-1),
    seen = new Int32Array(n);
  let movedAtAll = false;
  for (let pass = 0; pass < PASSES; pass++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const own = at(group, i),
        k = at(degree, i);
      let count = 0;
      for (let e = at(start, i); e < at(start, i + 1); e++) {
        const g = at(group, at(to, e));
        if (at(near, g) < 0) {
          near[g] = 0;
          seen[count++] = g;
        }
        near[g] = at(near, g) + at(weight, e);
      }
      sum[own] = at(sum, own) - k;
      // the gain of joining group g: the links to it, less what chance alone would give
      let best = own,
        bestGain = Math.max(0, at(near, own)) - (at(sum, own) * k) / total;
      for (let s = 0; s < count; s++) {
        const g = at(seen, s),
          gain = at(near, g) - (at(sum, g) * k) / total;
        if (gain > bestGain + 1e-12) {
          best = g;
          bestGain = gain;
        }
        near[g] = -1;
      }
      near[own] = -1;
      sum[best] = at(sum, best) + k;
      if (best !== own) {
        group[i] = best;
        moved++;
        movedAtAll = true;
      }
    }
    // a pass that moves almost nothing ends the round: what is left gains too little to wait for
    if (moved <= n / SETTLED) break;
  }
  return { group, groups: renumber(group), moved: movedAtAll };
}

/** The links between groups, for the smaller graph: links inside a group drop out, links between groups stay. */
function between(pairs: Pairs, group: Int32Array): Pairs {
  let kept = 0;
  for (let e = 0; e < pairs.a.length; e++) if (at(group, at(pairs.a, e)) !== at(group, at(pairs.b, e))) kept++;
  const a = new Int32Array(kept),
    b = new Int32Array(kept),
    w = new Float64Array(kept);
  for (let e = 0, j = 0; e < pairs.a.length; e++) {
    const ga = at(group, at(pairs.a, e)),
      gb = at(group, at(pairs.b, e));
    if (ga === gb) continue;
    a[j] = ga;
    b[j] = gb;
    w[j++] = at(pairs.w, e);
  }
  return { a, b, w };
}

/**
 * The group of each of `n` things, from its links as [from, to] by the things' numbers (0 to n - 1). Groups are
 * numbered from 0, in the order of their first thing.
 */
export function louvain(n: number, links: readonly (readonly [number, number])[]): number[] {
  const of = Int32Array.from({ length: n }, (_, i) => i);
  let pairs: Pairs = {
    a: Int32Array.from(links, (l) => l[0]),
    b: Int32Array.from(links, (l) => l[1]),
    w: new Float64Array(links.length).fill(1),
  };
  let weights = new Float64Array(n);
  for (const [a, b] of links)
    if (a !== b) {
      weights[a] = at(weights, a) + 1;
      weights[b] = at(weights, b) + 1;
    }
  const total = weights.reduce((s, d) => s + d, 0);
  let size = n;
  for (let round = 0; round < ROUNDS && total > 0; round++) {
    const { group, groups, moved } = moveRound(size, linksOf(size, pairs), weights, total);
    if (!moved) break;
    for (let i = 0; i < n; i++) of[i] = at(group, at(of, i));
    // each group becomes one thing of a smaller graph
    const next = new Float64Array(groups);
    for (let i = 0; i < size; i++) next[at(group, i)] = at(next, at(group, i)) + at(weights, i);
    pairs = between(pairs, group);
    weights = next;
    size = groups;
  }
  renumber(of);
  return Array.from(of);
}
