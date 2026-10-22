// The centroid of each cluster (editor spec §31): a derived thing that sums its cluster up. See
// wiki/Clusters-design.md, step 4. Its Python twin is graphspec/engine/clusters/centroids.py, and the shared cases in
// test/centroid-cases.json prove both give the same centroids.
//
// A centroid holds how many members its cluster has, their weight, the kinds they are, and a certainty range. Each
// member counts its 1/N weight (multiple_membership). A member that is itself a cluster counts as one member of kind
// Centroid, with its own centroid's certainty (recursive_centroids). So atoms sum up into molecules, and molecules into
// cells.
//
// Its id is a named SHA-256 hash of its cluster's id, so a rebuild gives the same id (stored_centroids). Given the last
// answer, only the clusters whose members changed are worked out again, then the clusters above them.
//
// Clusters may sit inside each other in a cycle. So certainty is found in passes. Each pass updates each centroid once,
// from the values of the pass before. Passes stop when no value moves more than a small amount. Some clusters may
// still move at the most passes, or when the time runs out. They are flagged unsettled, never returned as settled
// (centroid_cycle_guard, centroids_correct_first).
'use strict';

const { clustersOf } = require('./clusters.js');
const { sha256hex } = require('../hashing/sha256.js');
const { named } = require('../hashing/named.js');
const { RANGE } = require('../rules/certainty.js');

/** The most passes, so values that keep moving still stop. */
const PASSES = 50;
/** A value that moves no more than this has stopped moving. */
const THRESHOLD = 1e-9;
/** The certainty of a thing that states a fact, with no likelihood word: certain. */
const FACT = [100, 100];
/** The kind a member that is a cluster counts as. */
const CENTROID = 'Centroid';

/** The id of a cluster's centroid: the same for the same cluster, after every rebuild. */
const centroidId = (cluster) => named(sha256hex(`centroid:${cluster}`));

/** What a centroid is worked out from: each member, its weight, its kinds and its likelihood word. */
function basisOf(graph, cluster, weightOf, isCluster) {
  return cluster.members.map((m) => {
    const w = weightOf.get(`${cluster.id}\n${m}`);
    if (isCluster.has(m)) return [m, w, [CENTROID], null];
    const [labels, props] = graph.nodes.get(m);
    const word =
      typeof props.likelihood === 'string' && Object.hasOwn(RANGE, props.likelihood) ? props.likelihood : null;
    return [m, w, [...labels].sort(), word];
  });
}

/** A cluster's certainty range from its members' values: the weighted mean of the lows and of the highs. */
function certaintyOf(basis, values, isCluster) {
  let total = 0,
    low = 0,
    high = 0;
  for (const [m, w, , word] of basis) {
    const v = isCluster.has(m) ? values.get(m) : word === null ? FACT : RANGE[word];
    if (v === null || v === undefined) continue;
    total += w;
    low += w * v[0];
    high += w * v[1];
  }
  return total === 0 ? null : [low / total, high / total];
}

/** Whether a value moved more than the threshold. Gaining or losing a value is a move. */
const moved = (a, b, threshold) =>
  a === null || b === null ? a !== b : Math.abs(a[0] - b[0]) > threshold || Math.abs(a[1] - b[1]) > threshold;

/**
 * Each cluster's centroid. `previous` is the last answer, so only what changed is worked out again. `passes` and
 * `threshold` bound the passes. `budget` is the time in milliseconds by `clock`; when it runs out, what still moves is
 * flagged unsettled.
 */
function centroidsOf(graph, options = {}) {
  const { previous, passes = PASSES, threshold = THRESHOLD, budget = Infinity, clock = Date.now } = options;
  const started = clock();
  const { clusters, memberships } = clustersOf(graph);
  const weightOf = new Map(memberships.map((m) => [`${m.cluster}\n${m.thing}`, m.weight]));
  const isCluster = new Set(clusters.map((c) => c.id));
  const before = new Map((previous ? previous.centroids : []).map((c) => [c.cluster, c]));

  // The clusters whose inputs changed, or that never settled, then every cluster above them.
  const bases = new Map(clusters.map((c) => [c.id, basisOf(graph, c, weightOf, isCluster)]));
  const parents = new Map();
  for (const c of clusters)
    for (const m of c.members) if (isCluster.has(m)) (parents.get(m) || parents.set(m, []).get(m)).push(c.id);
  const dirty = new Set();
  const queue = clusters
    .filter((c) => {
      const last = before.get(c.id);
      return !last || !last.settled || JSON.stringify(last.basis) !== JSON.stringify(bases.get(c.id));
    })
    .map((c) => c.id);
  while (queue.length) {
    const id = queue.shift();
    if (dirty.has(id)) continue;
    dirty.add(id);
    queue.push(...(parents.get(id) || []));
  }
  const order = clusters.map((c) => c.id).filter((id) => dirty.has(id));

  // The passes, each from the values of the pass before.
  const values = new Map(
    clusters.map((c) => {
      const last = before.get(c.id);
      return [c.id, last && last.certainty ? [last.certainty.low, last.certainty.high] : null];
    }),
  );
  let moving = new Set(order),
    ran = 0;
  while (moving.size && ran < passes && !(ran > 0 && clock() - started > budget)) {
    const next = new Map(order.map((id) => [id, certaintyOf(bases.get(id), values, isCluster)]));
    moving = new Set(order.filter((id) => moved(values.get(id), next.get(id), threshold)));
    for (const [id, v] of next) values.set(id, v);
    ran++;
  }
  // A cluster above one still moving is not settled either.
  const unsettled = new Set();
  const up = [...moving];
  while (up.length) {
    const id = up.shift();
    if (unsettled.has(id)) continue;
    unsettled.add(id);
    up.push(...(parents.get(id) || []).filter((p) => dirty.has(p)));
  }

  const centroids = clusters.map((c) => {
    const basis = bases.get(c.id);
    const last = before.get(c.id);
    if (!dirty.has(c.id)) return last;
    const kinds = {};
    let weight = 0;
    for (const [, w, labels] of basis) {
      weight += w;
      for (const l of labels) kinds[l] = (kinds[l] || 0) + w;
    }
    const v = values.get(c.id);
    return {
      id: centroidId(c.id),
      cluster: c.id,
      kind: c.kind,
      members: basis.length,
      weight,
      kinds: Object.fromEntries(
        Object.keys(kinds)
          .sort()
          .map((k) => [k, kinds[k]]),
      ),
      certainty: v === null ? null : { low: v[0], high: v[1] },
      settled: !unsettled.has(c.id),
      basis,
    };
  });
  return { centroids, recomputed: order, passes: ran, settled: unsettled.size === 0 };
}

module.exports = { PASSES, THRESHOLD, centroidId, centroidsOf };
