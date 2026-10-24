"""Which things in different graphs are one (editor spec §27, same_as_across_graphs; risk ARCH-6).

Inside a graph, a thing's name is its id, in every note that holds a block of it. Across graphs,
two things are one only when a written SAME_AS link says so. It goes from a thing to a Ref naming
the other (`ref` and `graph`, as §23's Refs do). Things of the same name in two graphs with no
such link stay two: they are listed as a guess, never joined. A Ref that names nothing is listed
too. This is the twin of the JavaScript library's src/mesh/same-as.js, and
packages/graph-spec/test/same-as-cases.json holds both to the same answers.
"""

from __future__ import annotations

from typing import Any

from graphspec.rules.plain_graph import World


def _where(graph: str, key: str) -> str:
    """A thing's name across the world: its graph and its key, `graph/key`."""
    return f"{graph}/{key}"


def same_as(world: World) -> dict[str, Any]:
    """The things the world's SAME_AS links make one, each set as sorted `graph/key` names. Also
    the Refs that name nothing (`unresolved`), and the names held by things in two or more graphs
    with no link between them (`guesses`)."""
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        while x in parent and parent[x] != x:
            x = parent[x]
        return x

    def join(a: str, b: str) -> None:
        for x in (a, b):
            parent.setdefault(x, x)
        ra, rb = sorted((find(a), find(b)))
        parent[rb] = ra

    unresolved = []
    graphs = sorted(world.graphs)
    for graph in graphs:
        g = world.graphs[graph]
        for start, typ, end, _ in g.edges:
            if typ != "SAME_AS":
                continue
            if not g.has(end, "Ref"):
                join(_where(graph, start), _where(graph, end))
                continue
            ref = g.p(end)
            there = world.graphs.get(ref.get("graph"))
            if there is not None and ref.get("ref") in there.nodes:
                join(_where(graph, start), _where(ref["graph"], ref["ref"]))
            else:
                unresolved.append(
                    {
                        "graph": graph,
                        "thing": start,
                        "ref": str(ref.get("ref")),
                        "in": str(ref.get("graph")),
                    }
                )
    sets: dict[str, list[str]] = {}
    for x in parent:
        sets.setdefault(find(x), []).append(x)
    ones = sorted((sorted(s) for s in sets.values()), key=lambda s: s[0])
    # the same name in two graphs, with no SAME_AS joining them: a guess for a person to confirm
    by_key: dict[str, list[str]] = {}
    for graph in graphs:
        for key, (labels, _) in world.graphs[graph].nodes.items():
            if "Ref" not in labels:
                by_key.setdefault(key, []).append(_where(graph, key))
    guesses = sorted(
        (
            {"name": name, "things": at}
            for name, at in by_key.items()
            if len(at) > 1 and len({find(x) for x in at}) > 1
        ),
        key=lambda x: x["name"],
    )
    return {"ones": ones, "unresolved": unresolved, "guesses": guesses}
