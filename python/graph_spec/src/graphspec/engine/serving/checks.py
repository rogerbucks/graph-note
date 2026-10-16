"""§24 H3's rules on a judgement graph's Servings, and the fence around served data."""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import TYPE_CHECKING, Any

from graphspec.engine.documents.classification import destination_matrix, may_serve
from graphspec.engine.judgements.proposers import proposers_of
from graphspec.engine.queries import Q

if TYPE_CHECKING:
    from grafeo import GrafeoDB


def served_rules(db: GrafeoDB, jg: str) -> list[tuple[str, bool, str]]:
    """§24 H3's rules on a judgement graph's Servings. Returns [(label, ok, detail)]."""
    db.set_graph(jg)
    out = []
    if not Q(db, "MATCH (s:Serving) RETURN s LIMIT 1") and not Q(
        db, "MATCH (p:Proposal) RETURN p LIMIT 1"
    ):
        return out
    served = {}
    for r in Q(
        db,
        "MATCH (p:Proposal)-[:USED]->(s:Serving)-[e:SERVED]->(x:Ref) RETURN p.id AS p, x.id AS x, properties(e) AS e",  # noqa: E501  # one literal: embedded_queries reads it whole
    ):
        served.setdefault(r["p"], {})[r["x"]] = r["e"]
    bad = []
    for r in Q(
        db,
        "MATCH (p:Proposal)-[e:RESTS_ON]->(x:Ref) RETURN p.id AS p, x.id AS x, properties(e) AS e",
    ):
        s = served.get(r["p"], {}).get(r["x"])
        if not s or any(s.get(k) != r["e"].get(k) for k in ("reads", "hash", "as_of")):
            bad.append((r["p"], r["x"]))
    out.append(
        (
            "§24 H3 rule 1: every pin of a proposal was served to its model — same item, "
            "same properties, same hash, same time",
            not bad,
            str(bad),
        )
    )
    m = destination_matrix()
    bad = []
    for r in Q(
        db,
        "MATCH (s:Serving)-[e:SERVED]->(x:Ref) RETURN s.id AS s, s.consumer_kind AS k, s.conditions_met AS c, e.classification AS cl, x.id AS x",  # noqa: E501  # one literal: embedded_queries reads it whole
    ):
        if not may_serve(r["k"], r["cl"], r["c"], m):
            bad.append((r["s"], r["x"], r["cl"], r["k"]))
    out.append(
        (
            "§24 H3 rule 2: no serving crossed its classification — "
            "the consumer was allowed every item served",
            not bad,
            str(bad),
        )
    )
    db.set_graph(jg)
    bad = []
    for p, who in proposers_of(db, jg).items():
        if any("Model" in labels for labels in who) and not Q(
            db, f"MATCH (:Proposal {{id: '{p}'}})-[:USED]->(:Serving) RETURN 1 AS x LIMIT 1"
        ):
            bad.append(p)
    out.append(
        (
            "§24 H3 rule 4: every proposal a model generated used a serving — "
            "it drafted from what it was shown",
            not bad,
            str(bad),
        )
    )
    return out


def fence_holds(text: str, served_values: Iterable[Any]) -> bool:
    """§24 H3 rule 3: every property text served appears only inside the fenced data block."""
    m = re.search(r"<<<data (\w+) [^\n]*>>>\n(.*)\n<<<end data \1>>>", text, re.S)
    if not m:
        return False
    outside = text[: m.start()] + text[m.end() :]
    return not any(v in outside for v in served_values if isinstance(v, str) and len(v) > 3)
