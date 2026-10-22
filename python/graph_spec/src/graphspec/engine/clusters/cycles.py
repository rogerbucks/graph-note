"""Clusters inside each other in a cycle (editor spec §31, cycles_allowed_flagged).

See wiki/Clusters-design.md, step 5. This is the twin of the JavaScript library's
src/clusters/cycles.js, held to the same shared cases in packages/graph-spec/test/cycle-cases.json.

A cycle is allowed: cluster A may sit inside B, and B inside A, at any depth. Nothing refuses it
when it is written. It is flagged instead, so a view can hide or highlight the clusters in it.
"""

from __future__ import annotations

from ...rules.plain_graph import Graph
from .clusters import CLUSTER, MEMBER_OF

# The ways a view can show the clusters in a cycle.
CYCLE_VIEWS = ("hide", "highlight")


def _reach_of(graph, clusters):
    """The clusters each cluster sits inside, directly or through others."""
    inside = {
        c: [e[2] for e in graph.out(c, MEMBER_OF) if graph.has(e[2], CLUSTER)] for c in clusters
    }
    reach = {}
    for c in clusters:
        seen: set = set()
        todo = list(inside[c])
        while todo:
            d = todo.pop()
            if d in seen:
                continue
            seen.add(d)
            todo.extend(inside[d])
        reach[c] = seen
    return reach


def cluster_cycles(graph: Graph) -> list[list[str]]:
    """Each cycle of clusters, its clusters in written order, in the order of its first cluster."""
    clusters = graph.labelled(CLUSTER)
    reach = _reach_of(graph, clusters)
    placed: set = set()
    cycles = []
    for c in clusters:
        if c in placed or c not in reach[c]:
            continue
        cycle = [d for d in clusters if d in reach[c] and c in reach[d]]
        placed.update(cycle)
        cycles.append(cycle)
    return cycles


def cycle_view(graph: Graph, how: str) -> dict:
    """What a view shows of a graph's things, with its cycles hidden or highlighted.

    `shown` is every thing in written order, less the clusters in a cycle when they are hidden.
    `highlighted` is the clusters in a cycle, when highlighted.
    """
    if how not in CYCLE_VIEWS:
        raise ValueError(f"a view shows cycles in one of these ways: {', '.join(CYCLE_VIEWS)}")
    cycled = {c for cycle in cluster_cycles(graph) for c in cycle}
    every = list(graph.nodes)
    if how == "hide":
        return {"shown": [i for i in every if i not in cycled], "highlighted": []}
    return {"shown": every, "highlighted": [i for i in every if i in cycled]}
