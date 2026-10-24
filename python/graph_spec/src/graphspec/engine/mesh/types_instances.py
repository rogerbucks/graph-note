"""Lasting types and the instances of them (editor spec §27, type_instance_split and
instance_inherits_type).

A type is a thing like any other, such as a reader model. An instance, such as the reader on one
desk, links to its type with INSTANCE_OF. The type may be in another graph: the link then goes to
a Ref naming it (§23), as SAME_AS does (same_as.py). A query asks about the type in general, or
about one instance.

An instance has every property of its type, unless it sets its own. Its own value wins, and
changes neither the type nor any other instance. A type may itself be an instance of a broader
type: the nearest value wins. This is the twin of the JavaScript library's
src/mesh/types-instances.js, and packages/graph-spec/test/types-instances-cases.json holds both to
the same answers.
"""

from __future__ import annotations

from typing import Any

from graphspec.rules.plain_graph import World


def type_of(world: World, graph: str, key: str) -> dict[str, str] | None:
    """The type `key` of `graph` is an instance of, as {graph, key}; None when it has none, or
    names nothing."""
    g = world.graphs.get(graph)
    links = g.out(key, "INSTANCE_OF") if g is not None else []
    if not links:
        return None
    end = links[0][2]
    if not g.has(end, "Ref"):
        return {"graph": graph, "key": end}
    ref = g.p(end)
    there = world.graphs.get(ref.get("graph"))
    if there is not None and ref.get("ref") in there.nodes:
        return {"graph": str(ref["graph"]), "key": str(ref["ref"])}
    return None


def instances_of(world: World, graph: str, key: str) -> list[dict[str, str]]:
    """The instances of the type `key` of `graph`, in any graph of the world, sorted by graph,
    then key."""
    out = []
    for name in sorted(world.graphs):
        for thing in world.graphs[name].nodes:
            t = type_of(world, name, thing)
            if t is not None and t["graph"] == graph and t["key"] == key:
                out.append({"graph": name, "key": thing})
    return sorted(out, key=lambda x: (x["graph"], x["key"]))


def inherited(world: World, graph: str, key: str) -> dict[str, Any]:
    """The properties of `key` of `graph`, its own and those it inherits from its type and the
    types above, the nearest value winning. Its id is its own, never its type's. `from` says where
    each came from, as `graph/key`."""
    props: dict[str, Any] = {}
    came: dict[str, str] = {}
    seen: set[str] = set()
    at: dict[str, str] | None = {"graph": graph, "key": key}
    while at is not None and f"{at['graph']}/{at['key']}" not in seen:
        seen.add(f"{at['graph']}/{at['key']}")
        g = world.graphs.get(at["graph"])
        if g is None or at["key"] not in g.nodes:
            break
        for k, v in g.p(at["key"]).items():
            # a thing's id is its own: a type's is never inherited
            if k not in props and not (k == "id" and at["key"] != key):
                props[k] = v
                came[k] = f"{at['graph']}/{at['key']}"
        at = type_of(world, at["graph"], at["key"])
    return {"props": props, "from": came}
