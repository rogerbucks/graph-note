// How tightly each cluster holds together, and the certainty its centroid states because of it (editor spec §31). Its
// Python twin is graphspec/engine/clusters/cohesion.py, and the shared cases in test/cohesion-cases.json prove both give
// the same answers.
//
// A centroid's certainty alone can hide friction: a loose, disputed cluster may average out as well as a tight one. So
// each cluster gets a cohesion score from two things (centroid_cohesion):
// - density: the share of its members' pairs joined by a link, any link but MEMBER_OF;
// - support: the share of its members not contested. A member that is a cluster counts its own score, so friction deep
//   down shows at the top.
// The score is the mean of the two. The stated certainty keeps the centroid's high end and multiplies its low end by
// the score, so friction widens the range.
//
// Doubt stays local by default. A cluster may opt in to a floor, with `floor: true` on the cluster or by naming it in
// the `floor` option. Its stated certainty is then never above that of its least certain member (parent_floor_optional).
// A member that is a cluster counts its own stated certainty. In a cycle of clusters, the cluster met again counts its
// unfloored certainty and a support of 1, so the answer still ends.
'use strict';

const { centroidsOf } = require('./centroids.js');
const { MEMBER_OF } = require('./clusters.js');
const { RANGE } = require('../rules/certainty.js');

/** The certainty of a member that states a fact, with no likelihood word: certain. */
const FACT = [100, 100];
/** The status of a member a join or a person disputes. */
const CONTESTED = 'contested';

/** A member's own range: its likelihood word's, or certain. */
function rangeOf(graph, m) {
  const word = graph.p(m).likelihood;
  return typeof word === 'string' && Object.hasOwn(RANGE, word) ? RANGE[word] : FACT;
}

/** How many of a cluster's members' pairs a link joins, each pair once whichever way the link runs. */
function linksInside(graph, members) {
  const inside = new Set(members),
    pairs = new Set();
  for (const [s, type, d] of graph.edges)
    if (type !== MEMBER_OF && s !== d && inside.has(s) && inside.has(d)) pairs.add(s < d ? `${s}\n${d}` : `${d}\n${s}`);
  return pairs.size;
}

/**
 * Each cluster's cohesion and the certainty its centroid states (editor spec §31). `floor` names the clusters that opt
 * in to a floor, beside those written with `floor: true`. The other options go to centroidsOf.
 */
function clusterCertainty(graph, options = {}) {
  const { floor = [], ...rest } = options;
  const { centroids, settled } = centroidsOf(graph, rest);
  const byCluster = new Map(centroids.map((c) => [c.cluster, c]));
  const floored = new Set(floor);
  for (const c of centroids)
    if (graph.nodes.has(c.cluster) && graph.p(c.cluster).floor === true) floored.add(c.cluster);

  const scores = new Map(),
    stated = new Map(),
    open = new Set();
  // A cluster's score and stated certainty, its member clusters first. One met again in a cycle counts as whole.
  function visit(id) {
    if (stated.has(id)) return;
    open.add(id);
    const c = byCluster.get(id);
    const members = c.basis.map((b) => b[0]);
    for (const m of members) if (byCluster.has(m) && !open.has(m)) visit(m);
    const contested = members.filter((m) => graph.nodes.has(m) && graph.p(m).status === CONTESTED).sort();
    let support = 0;
    for (const m of members)
      support += contested.includes(m) ? 0 : byCluster.has(m) && scores.has(m) ? scores.get(m).score : 1;
    support = members.length === 0 ? 1 : support / members.length;
    const n = members.length,
      links = linksInside(graph, members),
      possible = (n * (n - 1)) / 2;
    const density = possible === 0 ? 1 : links / possible;
    const score = (density + support) / 2;
    scores.set(id, { members: n, links, density, contested, support, score });
    let value = c.certainty === null ? null : [c.certainty.low * score, c.certainty.high];
    let lowest = null;
    if (value !== null && floored.has(id)) {
      // The least certain member: the lowest high end, then the lowest low end, the first written among equals.
      for (const m of members) {
        const v = byCluster.has(m) ? memberValue(m) : rangeOf(graph, m);
        if (v !== null && (lowest === null || v[1] < lowest[1][1] || (v[1] === lowest[1][1] && v[0] < lowest[1][0])))
          lowest = [m, v];
      }
      if (lowest !== null && (lowest[1][0] < value[0] || lowest[1][1] < value[1]))
        value = [Math.min(value[0], lowest[1][0]), Math.min(value[1], lowest[1][1])];
      else lowest = null;
    }
    stated.set(id, { value, lowest: lowest === null ? null : lowest[0] });
    open.delete(id);
  }
  // A member cluster's stated certainty, or its unfloored one when it is still being worked out in a cycle.
  function memberValue(m) {
    if (stated.has(m)) return stated.get(m).value;
    const c = byCluster.get(m);
    return c.certainty === null ? null : [c.certainty.low, c.certainty.high];
  }
  for (const c of centroids) visit(c.cluster);

  return {
    clusters: centroids.map((c) => {
      const s = stated.get(c.cluster);
      return {
        cluster: c.cluster,
        centroid: c.id,
        certainty: c.certainty,
        cohesion: scores.get(c.cluster),
        stated: s.value === null ? null : { low: s.value[0], high: s.value[1] },
        floor: floored.has(c.cluster),
        floored_by: s.lowest,
      };
    }),
    settled,
  };
}

module.exports = { clusterCertainty };
