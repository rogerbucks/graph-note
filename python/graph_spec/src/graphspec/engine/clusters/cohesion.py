"""How tightly each cluster holds together, and its centroid's stated certainty (editor spec §31).

This is the twin of the JavaScript library's src/clusters/cohesion.js. The shared cases in
packages/graph-spec/test/cohesion-cases.json prove both give the same answers.

A centroid's certainty alone can hide friction: a loose, disputed cluster may average out as well
as a tight one. So each cluster gets a cohesion score from two things (centroid_cohesion):
- density: the share of its members' pairs joined by a link, any link but MEMBER_OF;
- support: the share of its members not contested. A member that is a cluster counts its own
  score, so friction deep down shows at the top.
The score is the mean of the two. The stated certainty keeps the centroid's high end and
multiplies its low end by the score, so friction widens the range.

Doubt stays local by default. A cluster may opt in to a floor, with `floor: true` on the cluster
or by naming it in `floor`. Its stated certainty is then never above that of its least certain
member (parent_floor_optional). A member that is a cluster counts its own stated certainty. In a
cycle of clusters, the cluster met again counts its unfloored certainty and a support of 1, so the
answer still ends.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from ...rules.likelihood import RANGE
from ...rules.plain_graph import Graph
from .centroids import centroids_of
from .clusters import MEMBER_OF

# The certainty of a member that states a fact, with no likelihood word: certain.
FACT = (100, 100)
# The status of a member a join or a person disputes.
CONTESTED = "contested"


def _range_of(graph, m):
    """A member's own range: its likelihood word's, or certain."""
    word = graph.p(m).get("likelihood")
    return tuple(RANGE[word]) if isinstance(word, str) and word in RANGE else FACT


def _links_inside(graph, members):
    """How many of a cluster's members' pairs a link joins, each pair once either way."""
    inside, pairs = set(members), set()
    for s, kind, d, *_ in graph.edges:
        if kind != MEMBER_OF and s != d and s in inside and d in inside:
            pairs.add((s, d) if s < d else (d, s))
    return len(pairs)


def cluster_certainty(graph: Graph, floor: Iterable[str] = (), **options: Any) -> dict:
    """Each cluster's cohesion and the certainty its centroid states (editor spec §31).

    `floor` names the clusters that opt in to a floor, beside those written with `floor: true`.
    The other options go to centroids_of.
    """
    found = centroids_of(graph, **options)
    centroids = found["centroids"]
    by_cluster = {c["cluster"]: c for c in centroids}
    floored = set(floor)
    for c in centroids:
        if c["cluster"] in graph.nodes and graph.p(c["cluster"]).get("floor") is True:
            floored.add(c["cluster"])

    scores: dict = {}
    stated: dict = {}
    open_: set = set()

    def member_value(m):
        """A member cluster's stated certainty, or its unfloored one while still worked out."""
        if m in stated:
            return stated[m][0]
        cert = by_cluster[m]["certainty"]
        return None if cert is None else (cert["low"], cert["high"])

    def visit(cid):
        """A cluster's score and stated certainty, its member clusters first."""
        if cid in stated:
            return
        open_.add(cid)
        c = by_cluster[cid]
        members = [b[0] for b in c["basis"]]
        for m in members:
            if m in by_cluster and m not in open_:
                visit(m)
        contested = sorted(
            m for m in members if m in graph.nodes and graph.p(m).get("status") == CONTESTED
        )
        support = 0
        for m in members:
            if m in contested:
                support += 0
            elif m in by_cluster and m in scores:
                support += scores[m]["score"]
            else:
                support += 1
        n = len(members)
        support = 1 if n == 0 else support / n
        links, possible = _links_inside(graph, members), n * (n - 1) / 2
        density = 1 if possible == 0 else links / possible
        score = (density + support) / 2
        scores[cid] = {
            "members": n,
            "links": links,
            "density": density,
            "contested": contested,
            "support": support,
            "score": score,
        }
        cert = c["certainty"]
        value = None if cert is None else (cert["low"] * score, cert["high"])
        lowest = None
        if value is not None and cid in floored:
            # The least certain member: lowest high end, then lowest low end, first among equals.
            for m in members:
                v = member_value(m) if m in by_cluster else _range_of(graph, m)
                if v is not None and (
                    lowest is None
                    or v[1] < lowest[1][1]
                    or (v[1] == lowest[1][1] and v[0] < lowest[1][0])
                ):
                    lowest = (m, v)
            if lowest is not None and (lowest[1][0] < value[0] or lowest[1][1] < value[1]):
                value = (min(value[0], lowest[1][0]), min(value[1], lowest[1][1]))
            else:
                lowest = None
        stated[cid] = (value, None if lowest is None else lowest[0])
        open_.discard(cid)

    for c in centroids:
        visit(c["cluster"])

    out = []
    for c in centroids:
        value, lowest = stated[c["cluster"]]
        out.append(
            {
                "cluster": c["cluster"],
                "centroid": c["id"],
                "certainty": c["certainty"],
                "cohesion": scores[c["cluster"]],
                "stated": None if value is None else {"low": value[0], "high": value[1]},
                "floor": c["cluster"] in floored,
                "floored_by": lowest,
            }
        )
    return {"clusters": out, "settled": found["settled"]}
