// The clusters of a graph (editor spec §31): the ones a person wrote, and the ones found by how things link. Each
// membership says which kind it is, and each counts 1/N for a thing in N clusters (cluster_kind_recorded,
// multiple_membership). See wiki/Clusters-design.md, step 3. Its Python twin is graphspec/engine/clusters/clusters.py,
// and the shared cases in test/cluster-cases.json prove both give the same clusters.
//
// A written cluster is a thing labelled Cluster. Its members link to it with MEMBER_OF. A member may be another
// cluster. A MEMBER_OF link to a thing that is not a Cluster makes no membership.
//
// Found clusters are never written. Louvain finds them over every thing that is not a cluster, by every link but
// MEMBER_OF. A group of one thing is not a cluster. A found cluster's confidence is the share of its members' links
// that stay inside it.
'use strict';

const { louvain } = require('./louvain.js');

/** The label of a written cluster. */
const CLUSTER = 'Cluster';
/** The link that joins a member to its cluster. */
const MEMBER_OF = 'MEMBER_OF';

/** The kinds a membership can have. */
const KINDS = ['asserted', 'found'];

/** The written clusters, in written order, each with its members in written order. A member is listed once. */
function writtenClusters(graph) {
  const order = new Map([...graph.nodes.keys()].map((id, i) => [id, i]));
  return graph.labelled(CLUSTER).map((id) => {
    const members = [...new Set(graph.inc(id, MEMBER_OF).map((e) => e[0]))].filter((m) => graph.nodes.has(m));
    members.sort((a, b) => order.get(a) - order.get(b));
    return { id, kind: 'asserted', members, confidence: null };
  });
}

/** The clusters Louvain finds over the things that are not clusters. Each is named `found:` and its first member. */
function foundClusters(graph) {
  const things = [...graph.nodes.keys()].filter((id) => !graph.has(id, CLUSTER));
  const index = new Map(things.map((id, i) => [id, i]));
  const links = [];
  for (const [s, type, d] of graph.edges)
    if (type !== MEMBER_OF && index.has(s) && index.has(d)) links.push([index.get(s), index.get(d)]);
  const groupOf = louvain(things.length, links);
  const groups = new Map();
  things.forEach((id, i) => {
    const g = groupOf[i];
    (groups.get(g) || groups.set(g, []).get(g)).push(id);
  });
  const found = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const inside = new Set(members);
    let touching = 0,
      staying = 0;
    for (const [s, d] of links.map(([a, b]) => [things[a], things[b]]))
      if (s !== d && (inside.has(s) || inside.has(d))) {
        touching++;
        if (inside.has(s) && inside.has(d)) staying++;
      }
    found.push({ id: `found:${members[0]}`, kind: 'found', members, confidence: touching ? staying / touching : 1 });
  }
  return found;
}

/**
 * The clusters of a graph and every membership in them. `kind` keeps only `asserted` or only `found` clusters, as a
 * view filtered by kind shows them. A thing's weight in each of its clusters is 1/N, where N counts the clusters shown.
 */
function clustersOf(graph, kind) {
  if (kind !== undefined && !KINDS.includes(kind)) throw new Error(`a cluster kind is one of ${KINDS.join(', ')}`);
  const clusters = [
    ...(kind === 'found' ? [] : writtenClusters(graph)),
    ...(kind === 'asserted' ? [] : foundClusters(graph)),
  ];
  const count = new Map();
  for (const c of clusters) for (const m of c.members) count.set(m, (count.get(m) || 0) + 1);
  const memberships = [];
  for (const c of clusters)
    for (const m of c.members) memberships.push({ thing: m, cluster: c.id, kind: c.kind, weight: 1 / count.get(m) });
  return { clusters, memberships };
}

module.exports = { CLUSTER, MEMBER_OF, KINDS, clustersOf };
