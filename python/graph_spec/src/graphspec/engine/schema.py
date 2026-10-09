"""§5 types through Grafeo: whether a loaded graph is typed, and what it leaves undeclared."""

from __future__ import annotations

from typing import TYPE_CHECKING

from graphspec.engine.queries import Q

if TYPE_CHECKING:
    from grafeo import GrafeoDB


def typed(db: GrafeoDB) -> bool:
    """§5: every node carries a declared label, every edge type is declared, and every declared
    edge type has both readings, forward and reverse."""
    element_types = Q(
        db,
        "MATCH (:GraphMeta)-[:DECLARES]->(t:ElementType) RETURN DISTINCT t.name AS n, t.kind AS k, t.reverse_name AS r, t.reading AS f, t.marker AS m",  # noqa: E501  # one literal: embedded_queries reads it whole
    )
    if any(t["k"] == "edge" and not (t["r"] and t["f"]) for t in element_types):
        return False
    nodes, edges = _declared(element_types)
    return (
        all(set(r["l"]) & nodes for r in Q(db, "MATCH (n) RETURN labels(n) AS l"))
        and {r["t"] for r in Q(db, "MATCH ()-[r]->() RETURN DISTINCT type(r) AS t")} <= edges
    )


def _declared(element_types):
    """§5: the node labels that type a node and the edge types declared — the graph's own, plus the
    spec's built-in vocabulary (graph_rules.SPEC_*, proved equal to the spec's meta-schema by its
    trace check). A marker never types a node alone."""
    from graphspec.rules.schema_types import SPEC_NODES, SPEC_MARKERS, SPEC_EDGES

    markers = {
        t["n"] for t in element_types if t["k"] == "node" and t.get("m") is True
    } | SPEC_MARKERS
    return ({t["n"] for t in element_types if t["k"] == "node"} | SPEC_NODES) - markers, {
        t["n"] for t in element_types if t["k"] == "edge"
    } | SPEC_EDGES


def untyped(db: GrafeoDB) -> tuple[list[str], list[str], list[str]]:
    """What §5 would refuse: node labels and edge types used but not declared, and edge types
    declared without both readings."""
    element_types = Q(
        db,
        "MATCH (:GraphMeta)-[:DECLARES]->(t:ElementType) RETURN DISTINCT t.name AS n, t.kind AS k, t.reverse_name AS r, t.reading AS f, t.marker AS m",  # noqa: E501  # one literal: embedded_queries reads it whole
    )
    nodes, edges = _declared(element_types)
    labels = {
        label
        for r in Q(db, "MATCH (n) RETURN labels(n) AS l")
        if not set(r["l"]) & nodes
        for label in r["l"]
    }
    types = {r["t"] for r in Q(db, "MATCH ()-[r]->() RETURN DISTINCT type(r) AS t")} - edges
    return (
        sorted(labels),
        sorted(types),
        sorted(t["n"] for t in element_types if t["k"] == "edge" and not (t["r"] and t["f"])),
    )
