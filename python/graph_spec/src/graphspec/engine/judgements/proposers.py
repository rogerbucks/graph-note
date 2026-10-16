"""Who proposed a Proposal, asked of Grafeo (§23 rule 6, §24 H3 rule 4): the Proposal is
WAS_ATTRIBUTED_TO a Ref to a Model; for one release the old form, through ASSOCIATED_WITH on its
activity, is still read. The same answers as graphspec.rules.proposers."""

from __future__ import annotations

from typing import TYPE_CHECKING

from graphspec.engine.judgements.basis import resolve_ref
from graphspec.engine.queries import Q

if TYPE_CHECKING:
    from grafeo import GrafeoDB


def proposers_of(db: GrafeoDB, jg: str) -> dict[str, list[set[str]]]:
    """Each Proposal of judgement graph jg, with the labels of every proposer named, in either
    form; leaves db on jg."""
    db.set_graph(jg)
    out: dict[str, list[set[str]]] = {
        r["p"]: [] for r in Q(db, "MATCH (p:Proposal) RETURN p.id AS p")
    }
    for r in Q(
        db,
        "MATCH (p:Proposal)-[:WAS_ATTRIBUTED_TO]->(m:Ref) RETURN p.id AS p, m.ref AS m, m.graph AS g",  # noqa: E501  # one literal: embedded_queries reads it whole
    ) + Q(
        db,
        "MATCH (p:Proposal)-[:WAS_GENERATED_BY]->(:Activity)-[:ASSOCIATED_WITH]->(m:Ref) RETURN p.id AS p, m.ref AS m, m.graph AS g",  # noqa: E501  # one literal: embedded_queries reads it whole
    ):
        # a Ref that names no graph resolves to nothing
        labels = resolve_ref(db, jg, {"ref": r["m"], "graph": r["g"]})[1] if r["g"] else set()
        out[r["p"]].append(labels)
    db.set_graph(jg)
    return out
