"""The centroid of each cluster (editor spec §31): a derived thing that sums its cluster up.

See wiki/Clusters-design.md, step 4. This is the twin of the JavaScript library's
src/clusters/centroids.js. The shared cases in packages/graph-spec/test/centroid-cases.json prove
both give the same centroids.

A centroid holds how many members its cluster has, their weight, the kinds they are, and a
certainty range. Each member counts its 1/N weight (multiple_membership). A member that is itself
a cluster counts as one member of kind Centroid, with its own centroid's certainty
(recursive_centroids). So atoms sum up into molecules, and molecules into cells.

Its id is a named SHA-256 hash of its cluster's id, so a rebuild gives the same id
(stored_centroids). Given the last answer, only the clusters whose members changed are worked out
again, then the clusters above them.

Clusters may sit inside each other in a cycle. So certainty is found in passes. Each pass updates
each centroid once, from the values of the pass before. Passes stop when no value moves more than
a small amount. A cluster still moving at the most passes, or when the time runs out, is flagged
unsettled, never returned as settled (centroid_cycle_guard, centroids_correct_first).
"""

from __future__ import annotations

import hashlib
import math
import time
from collections import deque
from collections.abc import Callable

from ...rules.likelihood import RANGE
from ...rules.named_hashes import named
from ...rules.plain_graph import Graph
from .clusters import clusters_of

# The most passes, so values that keep moving still stop.
PASSES = 50
# A value that moves no more than this has stopped moving.
THRESHOLD = 1e-9
# The certainty of a thing that states a fact, with no likelihood word: certain.
FACT = (100, 100)
# The kind a member that is a cluster counts as.
CENTROID = "Centroid"


def centroid_id(cluster: str) -> str:
    """The id of a cluster's centroid: the same for the same cluster, after every rebuild."""
    return named(hashlib.sha256(f"centroid:{cluster}".encode()).hexdigest())


def _basis_of(graph, cluster, weight_of, is_cluster):
    """What a centroid is worked out from: each member, its weight, kinds and likelihood word."""
    out = []
    for m in cluster["members"]:
        w = weight_of[(cluster["id"], m)]
        if m in is_cluster:
            out.append([m, w, [CENTROID], None])
            continue
        labels, props = graph.nodes[m]
        word = props.get("likelihood")
        word = word if isinstance(word, str) and word in RANGE else None
        out.append([m, w, sorted(labels), word])
    return out


def _certainty_of(basis, values, is_cluster):
    """A cluster's certainty range: the weighted mean of its members' lows and of their highs."""
    total = low = high = 0
    for m, w, _, word in basis:
        v = values.get(m) if m in is_cluster else (FACT if word is None else RANGE[word])
        if v is None:
            continue
        total += w
        low += w * v[0]
        high += w * v[1]
    return None if total == 0 else (low / total, high / total)


def _moved(a, b, threshold):
    """Whether a value moved more than the threshold. Gaining or losing a value is a move."""
    if a is None or b is None:
        return a is not b
    return abs(a[0] - b[0]) > threshold or abs(a[1] - b[1]) > threshold


def centroids_of(
    graph: Graph,
    previous: dict | None = None,
    passes: int = PASSES,
    threshold: float = THRESHOLD,
    budget: float = math.inf,
    clock: Callable[[], float] = lambda: time.monotonic() * 1000,
) -> dict:
    """Each cluster's centroid.

    `previous` is the last answer, so only what changed is worked out again. `passes` and
    `threshold` bound the passes. `budget` is the time in milliseconds by `clock`; when it runs
    out, what still moves is flagged unsettled.
    """
    started = clock()
    found = clusters_of(graph)
    clusters = found["clusters"]
    weight_of = {(m["cluster"], m["thing"]): m["weight"] for m in found["memberships"]}
    is_cluster = {c["id"] for c in clusters}
    before = {c["cluster"]: c for c in (previous["centroids"] if previous else [])}

    # The clusters whose inputs changed, or that never settled, then every cluster above them.
    bases = {c["id"]: _basis_of(graph, c, weight_of, is_cluster) for c in clusters}
    parents: dict = {}
    for c in clusters:
        for m in c["members"]:
            if m in is_cluster:
                parents.setdefault(m, []).append(c["id"])
    dirty: set = set()
    queue = deque(
        c["id"]
        for c in clusters
        if c["id"] not in before
        or not before[c["id"]]["settled"]
        or before[c["id"]]["basis"] != bases[c["id"]]
    )
    while queue:
        cid = queue.popleft()
        if cid in dirty:
            continue
        dirty.add(cid)
        queue.extend(parents.get(cid, []))
    order = [c["id"] for c in clusters if c["id"] in dirty]

    # The passes, each from the values of the pass before.
    values = {}
    for c in clusters:
        last = before.get(c["id"])
        cert = last["certainty"] if last else None
        values[c["id"]] = (cert["low"], cert["high"]) if cert else None
    moving, ran = set(order), 0
    while moving and ran < passes and not (ran > 0 and clock() - started > budget):
        nxt = {cid: _certainty_of(bases[cid], values, is_cluster) for cid in order}
        moving = {cid for cid in order if _moved(values[cid], nxt[cid], threshold)}
        values.update(nxt)
        ran += 1
    # A cluster above one still moving is not settled either.
    unsettled: set = set()
    up = deque(cid for cid in order if cid in moving)
    while up:
        cid = up.popleft()
        if cid in unsettled:
            continue
        unsettled.add(cid)
        up.extend(p for p in parents.get(cid, []) if p in dirty)

    centroids = []
    for c in clusters:
        if c["id"] not in dirty:
            centroids.append(before[c["id"]])
            continue
        basis = bases[c["id"]]
        kinds: dict = {}
        weight = 0
        for _, w, labels, _ in basis:
            weight += w
            for label in labels:
                kinds[label] = kinds.get(label, 0) + w
        v = values[c["id"]]
        centroids.append(
            {
                "id": centroid_id(c["id"]),
                "cluster": c["id"],
                "kind": c["kind"],
                "members": len(basis),
                "weight": weight,
                "kinds": {k: kinds[k] for k in sorted(kinds)},
                "certainty": None if v is None else {"low": v[0], "high": v[1]},
                "settled": c["id"] not in unsettled,
                "basis": basis,
            }
        )
    return {
        "centroids": centroids,
        "recomputed": order,
        "passes": ran,
        "settled": not unsettled,
    }
