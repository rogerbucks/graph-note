"""The clusters of a graph (editor spec §31): the written ones, and the ones found by links.

Each membership says which kind it is, and each counts 1/N for a thing in N clusters
(cluster_kind_recorded, multiple_membership). See wiki/Clusters-design.md, step 3. This is the
twin of the JavaScript library's src/clusters/clusters.js. The shared cases in
packages/graph-spec/test/cluster-cases.json prove both give the same clusters.

A written cluster is a thing labelled Cluster. Its members link to it with MEMBER_OF. A member
may be another cluster. A MEMBER_OF link to a thing that is not a Cluster makes no membership.

Found clusters are never written. Louvain finds them over every thing that is not a cluster, by
every link but MEMBER_OF. A group of one thing is not a cluster. A found cluster's confidence is
the share of its members' links that stay inside it.
"""

from __future__ import annotations

from ...rules.plain_graph import Graph
from .louvain import louvain

# The label of a written cluster, and the link that joins a member to it.
CLUSTER = "Cluster"
MEMBER_OF = "MEMBER_OF"

# The kinds a membership can have.
KINDS = ("asserted", "found")


def _written_clusters(graph):
    """The written clusters, in written order, each with its members in written order."""
    order = {i: n for n, i in enumerate(graph.nodes)}
    out = []
    for cid in graph.labelled(CLUSTER):
        members = list(dict.fromkeys(e[0] for e in graph.inc(cid, MEMBER_OF)))
        members = sorted((m for m in members if m in graph.nodes), key=order.__getitem__)
        out.append({"id": cid, "kind": "asserted", "members": members, "confidence": None})
    return out


def _found_clusters(graph):
    """The clusters Louvain finds over the things that are not clusters, named `found:` and
    their first member."""
    things = [i for i in graph.nodes if not graph.has(i, CLUSTER)]
    index = {i: n for n, i in enumerate(things)}
    links = [
        [index[s], index[d]]
        for s, typ, d, _ in graph.edges
        if typ != MEMBER_OF and s in index and d in index
    ]
    group_of = louvain(len(things), links)
    groups: dict[int, list] = {}
    for n, i in enumerate(things):
        groups.setdefault(group_of[n], []).append(i)
    found = []
    for members in groups.values():
        if len(members) < 2:
            continue
        inside = set(members)
        touching = staying = 0
        for a, b in links:
            s, d = things[a], things[b]
            if s != d and (s in inside or d in inside):
                touching += 1
                if s in inside and d in inside:
                    staying += 1
        found.append(
            {
                "id": f"found:{members[0]}",
                "kind": "found",
                "members": members,
                "confidence": staying / touching if touching else 1,
            }
        )
    return found


def clusters_of(graph: Graph, kind: str | None = None) -> dict:
    """The clusters of a graph and every membership in them.

    `kind` keeps only "asserted" or only "found" clusters, as a view filtered by kind shows
    them. A thing's weight in each of its clusters is 1/N, where N counts the clusters shown.
    """
    if kind is not None and kind not in KINDS:
        raise ValueError(f"a cluster kind is one of {', '.join(KINDS)}")
    clusters = (_written_clusters(graph) if kind != "found" else []) + (
        _found_clusters(graph) if kind != "asserted" else []
    )
    count: dict = {}
    for c in clusters:
        for m in c["members"]:
            count[m] = count.get(m, 0) + 1
    memberships = [
        {"thing": m, "cluster": c["id"], "kind": c["kind"], "weight": 1 / count[m]}
        for c in clusters
        for m in c["members"]
    ]
    return {"clusters": clusters, "memberships": memberships}
