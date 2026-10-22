// Clusters inside each other in a cycle (editor spec §31, cycles_allowed_flagged). See wiki/Clusters-design.md, step 5.
// Its Python twin is graphspec/engine/clusters/cycles.py, held to the same shared cases in test/cycle-cases.json.
//
// A cycle is allowed: cluster A may sit inside B, and B inside A, at any depth. Nothing refuses it when it is written.
// It is flagged instead, so a view can hide or highlight the clusters in it.
'use strict';

const { CLUSTER, MEMBER_OF } = require('./clusters.js');

/** The ways a view can show the clusters in a cycle. */
const CYCLE_VIEWS = ['hide', 'highlight'];

/** The clusters each cluster sits inside, directly or through others. */
function reachOf(graph, clusters) {
  const inside = new Map(
    clusters.map((c) => [
      c,
      graph
        .out(c, MEMBER_OF)
        .map((e) => e[2])
        .filter((d) => graph.has(d, CLUSTER)),
    ]),
  );
  return new Map(
    clusters.map((c) => {
      const seen = new Set();
      const todo = [...inside.get(c)];
      while (todo.length) {
        const d = todo.pop();
        if (seen.has(d)) continue;
        seen.add(d);
        todo.push(...inside.get(d));
      }
      return [c, seen];
    }),
  );
}

/** Each cycle of clusters, its clusters in written order. Cycles come in the order of their first cluster. */
function clusterCycles(graph) {
  const clusters = graph.labelled(CLUSTER);
  const reach = reachOf(graph, clusters);
  const placed = new Set();
  const cycles = [];
  for (const c of clusters) {
    if (placed.has(c) || !reach.get(c).has(c)) continue;
    const cycle = clusters.filter((d) => reach.get(c).has(d) && reach.get(d).has(c));
    for (const d of cycle) placed.add(d);
    cycles.push(cycle);
  }
  return cycles;
}

/**
 * What a view shows of a graph's things, with its cycles hidden or highlighted. `shown` is every thing in written
 * order, less the clusters in a cycle when they are hidden. `highlighted` is the clusters in a cycle, when highlighted.
 */
function cycleView(graph, how) {
  if (!CYCLE_VIEWS.includes(how))
    throw new Error(`a view shows cycles in one of these ways: ${CYCLE_VIEWS.join(', ')}`);
  const cycled = new Set(clusterCycles(graph).flat());
  const all = [...graph.nodes.keys()];
  return how === 'hide'
    ? { shown: all.filter((id) => !cycled.has(id)), highlighted: [] }
    : { shown: all, highlighted: all.filter((id) => cycled.has(id)) };
}

module.exports = { CYCLE_VIEWS, clusterCycles, cycleView };
