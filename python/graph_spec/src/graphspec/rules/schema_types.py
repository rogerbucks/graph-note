"""§5 types: the spec's built-in vocabulary, what a graph declares, and what a draft works
out from its data."""

from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph
    from graphspec.rules.plain_graph import World


# ── §5 types ────────────────────────────────────────────────────────────────────────────────
# The spec's own vocabulary, built in because a checker must run with no documents to read it from.
# The spec's meta-schema declares it as data; the spec's trace check proves this copy,
# graph_spec.py's and graph-spec-check.js's equal it.
SPEC_SCHEMA = "graph-spec@3"  # @2, 6 Oct 2026: Cardinality and Coverage (§25)
# @3, 16 Oct 2026: W3C PROV is normative for provenance (§11, §12, §24): the agent types, and USED,
# HAD_PLAN and WAS_ATTRIBUTED_TO. A Model is acceptable wherever a SoftwareAgent is, but is a type
# a graph declares for itself.
SPEC_SCHEMA_NODES = frozenset({"GraphMeta", "ElementType", "Meta", "Cardinality", "Coverage"})
SPEC_AGENTS = frozenset({"Person", "Organization", "SoftwareAgent"})
SPEC_NODES = SPEC_SCHEMA_NODES | SPEC_AGENTS
SPEC_MARKERS = frozenset({"Meta"})  # marks a schema node; never types a node by itself
SPEC_EDGES = frozenset({"DECLARES", "USED", "HAD_PLAN", "WAS_ATTRIBUTED_TO"})


def declared_in(graph: Graph) -> list[dict[str, Any]]:
    """§5: the ElementTypes that type — those the graph's GraphMeta DECLARES."""
    return [
        graph.p(i)
        for i in graph.labelled("ElementType")
        if any(graph.has(e[0], "GraphMeta") for e in graph.inc(i, "DECLARES"))
    ]


def types(
    g: Graph, shared: Graph | None = None, builtin: bool = True
) -> tuple[set[str], set[str], list[dict[str, Any]]]:
    """§5: the node types and edge types a graph declares — in its own schema, else in the shared
    one given — with the spec's built-in vocabulary unless builtin is False; and the edge types
    declared without both readings."""
    # a graph's own schema, where it has one, or the shared one it names
    if g.labelled("ElementType"):
        element_types = declared_in(g)
    else:
        element_types = declared_in(shared) if shared is not None else []
    nodes, edges = (
        {t.get("name") for t in element_types if t.get("kind") == "node"},
        {t.get("name") for t in element_types if t.get("kind") == "edge"},
    )
    markers = {
        t.get("name") for t in element_types if t.get("kind") == "node" and t.get("marker") is True
    }
    if builtin:
        nodes, edges, markers = nodes | SPEC_NODES, edges | SPEC_EDGES, markers | SPEC_MARKERS
    return (
        nodes - markers,
        edges,
        [
            t
            for t in element_types
            if t.get("kind") == "edge" and not (t.get("reverse_name") and t.get("reading"))
        ],
    )


def typed(g: Graph, shared: Graph | None = None, builtin: bool = True) -> bool:
    """§5: whether every node has a declared type, every relationship type is declared, and every
    declared edge type has both readings."""
    nodes, edges, unreversed = types(g, shared, builtin)
    return (
        not unreversed
        and all(labels & nodes for labels, _ in g.nodes.values())
        and {e[1] for e in g.edges} <= edges
    )


def untyped(
    g: Graph, shared: Graph | None = None, builtin: bool = True
) -> tuple[list[str], list[str], list[str]]:
    """What §5 would refuse: node labels and edge types used but not declared, and edge types
    declared without both readings — each sorted."""
    nodes, edges, unreversed = types(g, shared, builtin)
    return (
        sorted({x for labels, _ in g.nodes.values() if not labels & nodes for x in labels}),
        sorted({e[1] for e in g.edges} - edges),
        sorted(t["name"] for t in unreversed),
    )


def is_draft(w: World, name: str) -> bool:
    """A graph with no schema — none of its own and none named in its header — is a draft (§5,
    decided 6 Oct 2026): its kinds and relationship types are worked out from the data until it is
    locked."""
    return not w[name].labelled("ElementType") and not w.named.get(name)


def drafted(g: Graph) -> tuple[list[str], list[str]]:
    """A draft's kinds and relationship types, worked out from the data — (kinds, types), each
    sorted."""
    return sorted({x for labels, _ in g.nodes.values() for x in labels - SPEC_NODES}), sorted(
        {e[1] for e in g.edges}
    )


def _lev(a, b):
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, y in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (x != y))
    return row[-1]


def near_duplicates(names: Sequence[str]) -> list[tuple[str, str]]:
    """Pairs of names that are probably one name misspelt — FAVOURS and FAVORS, Option and Options:
    one edit apart, or two when both are eight letters or more, ignoring case and underscores. What
    a draft has instead of a schema to catch typos."""

    def n(x):
        return x.replace("_", "").lower()

    return [
        (a, b)
        for i, a in enumerate(names)
        for b in names[i + 1 :]
        if _lev(n(a), n(b)) <= (2 if min(len(n(a)), len(n(b))) >= 8 else 1)
    ]
