"""Finding groups by how things link: the Louvain method (Blondel and others, 2008).

Clusters found by an algorithm (editor spec §31, cluster_kind_recorded) and the groups a
massive graph opens as (editor spec §53, scale_groups) both use it. This is the twin of the
JavaScript library's src/clusters/louvain.js, step for step. The shared cases in
packages/graph-spec/test/louvain-cases.json prove both give the same groups.

Pure: the same links give the same groups every time. Things are visited in their written order,
and a tie keeps the group a thing is already in. Links are taken both ways, and two links between
the same two things count twice. A thing with no links stays a group of its own.
"""

from __future__ import annotations

from collections.abc import Sequence

# The most passes over the things in one round, so a graph that keeps moving still stops.
PASSES = 20
# A pass that moves no more than one thing in this many ends its round.
SETTLED = 1000
# The most rounds, each on a smaller graph.
ROUNDS = 12


def _links_of(
    n: int, a: list[int], b: list[int], w: list[float]
) -> tuple[list[int], list[int], list[float]]:
    """Each thing's neighbours, from start[i] to start[i + 1], and how much each link counts."""
    start = [0] * (n + 1)
    for x, y in zip(a, b):
        if x == y:
            continue
        start[x + 1] += 1
        start[y + 1] += 1
    for i in range(n):
        start[i + 1] += start[i]
    fill = start[:n]
    to = [0] * start[n]
    weight = [0.0] * start[n]
    for x, y, v in zip(a, b, w):
        if x == y:
            continue
        to[fill[x]] = y
        weight[fill[x]] = v
        to[fill[y]] = x
        weight[fill[y]] = v
        fill[x] += 1
        fill[y] += 1
    return start, to, weight


def _renumber(group: list[int]) -> int:
    """`group` numbered again from 0, in the order of each group's first thing.

    Gives how many groups there are.
    """
    number = [-1] * len(group)
    groups = 0
    for i, g in enumerate(group):
        if number[g] < 0:
            number[g] = groups
            groups += 1
        group[i] = number[g]
    return groups


def _move_round(
    n: int, links: tuple[list[int], list[int], list[float]], degree: list[float], total: float
) -> tuple[list[int], int, bool]:
    """One round: each thing moves to the neighbouring group that gains the most."""
    start, to, weight = links
    group = list(range(n))
    total_of = list(degree)
    near = [-1.0] * n
    seen = [0] * n
    moved_at_all = False
    for _ in range(PASSES):
        moved = 0
        for i in range(n):
            own = group[i]
            k = degree[i]
            count = 0
            for e in range(start[i], start[i + 1]):
                g = group[to[e]]
                if near[g] < 0:
                    near[g] = 0.0
                    seen[count] = g
                    count += 1
                near[g] = near[g] + weight[e]
            total_of[own] = total_of[own] - k
            # the gain of joining group g: the links to it, less what chance alone would give
            best = own
            best_gain = max(0.0, near[own]) - (total_of[own] * k) / total
            for s in range(count):
                g = seen[s]
                gain = near[g] - (total_of[g] * k) / total
                if gain > best_gain + 1e-12:
                    best = g
                    best_gain = gain
                near[g] = -1.0
            near[own] = -1.0
            total_of[best] = total_of[best] + k
            if best != own:
                group[i] = best
                moved += 1
                moved_at_all = True
        # a pass that moves almost nothing ends the round: what is left gains too little to wait
        if moved <= n / SETTLED:
            break
    groups = _renumber(group)
    return group, groups, moved_at_all


def louvain(n: int, links: Sequence[Sequence[int]]) -> list[int]:
    """The group of each of `n` things, from its links as [from, to] by the things' numbers.

    Groups are numbered from 0, in the order of their first thing.
    """
    of = list(range(n))
    a = [link[0] for link in links]
    b = [link[1] for link in links]
    w = [1.0] * len(links)
    weights = [0.0] * n
    for x, y in zip(a, b):
        if x != y:
            weights[x] += 1
            weights[y] += 1
    total = 0.0
    for d in weights:
        total += d
    size = n
    for _ in range(ROUNDS):
        if total <= 0:
            break
        links_now = _links_of(size, a, b, w)
        group, groups, moved = _move_round(size, links_now, weights, total)
        if not moved:
            break
        of = [group[g] for g in of]
        # each group becomes one thing of a smaller graph
        nxt = [0.0] * groups
        for i in range(size):
            nxt[group[i]] += weights[i]
        kept = [(group[x], group[y], v) for x, y, v in zip(a, b, w) if group[x] != group[y]]
        a = [k[0] for k in kept]
        b = [k[1] for k in kept]
        w = [k[2] for k in kept]
        weights = nxt
        size = groups
    _renumber(of)
    return of
