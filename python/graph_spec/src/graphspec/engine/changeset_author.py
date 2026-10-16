"""§24 H4: who a change set is by, asked of the database: the kind of agent its header's `by` is,
and every agent the graphs know."""

from __future__ import annotations

from collections.abc import Collection
from typing import TYPE_CHECKING

from graphspec.engine.queries import Q

if TYPE_CHECKING:
    from grafeo import GrafeoDB


def author_of(db: GrafeoDB, made: Collection[str], by: str) -> tuple[str | None, list[str]]:
    """An author is known if the graphs hold it, or the set itself declares it (§24). Returns
    (the author's kind, or None when it is not known; the ids of every agent the graphs know).

    The header's `by` reads as WAS_ATTRIBUTED_TO that agent for every change in the set
    (req:24.prov-attributed); a software agent is held to what a model is held to."""
    labels = set()
    for g in made:
        db.set_graph(g)
        for r in Q(db, f"MATCH (x {{id: '{by}'}}) RETURN labels(x) AS l"):
            labels |= set(r["l"])
    kind = (
        "Model"
        if labels & {"Model", "SoftwareAgent"}
        else "Person"
        if "Person" in labels
        else "Organization"
        if "Organization" in labels
        else None
    )
    known = set()
    for g in made:
        db.set_graph(g)
        known |= {
            r["i"]
            for r in Q(
                db,
                "MATCH (x) WHERE x:Person OR x:Organization OR x:SoftwareAgent OR x:Model RETURN x.id AS i",  # noqa: E501  # one literal: embedded_queries reads it whole
            )
        }
    return kind, sorted(known)
