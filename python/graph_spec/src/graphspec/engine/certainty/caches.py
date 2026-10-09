"""§20 the cached certainty values through Grafeo: latest assessments, confidence, status,
derived ranges and the certainty lens."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from graphspec.engine.certainty.scale import CONFIDENCE, both, span, words
from graphspec.engine.queries import Q

if TYPE_CHECKING:
    from grafeo import GrafeoDB


def latest_assessment(db: GrafeoDB) -> dict[str, Any]:
    """Each assessed claim's likelihood in its latest assessment: {claim id: likelihood}."""
    best = {}
    for r in Q(
        db,
        "MATCH (a:Assessment)-[:ASSESSES]->(c:Claim) RETURN c.id AS c, a.at AS at, a.likelihood AS l",  # noqa: E501  # one literal: embedded_queries reads it whole
    ):
        if r["c"] not in best or r["at"] > best[r["c"]][0]:
            best[r["c"]] = (r["at"], r["l"])
    return {c: v[1] for c, v in best.items()}


def confidence_from_evidence(db: GrafeoDB) -> dict[str, str]:
    """Each claim not derived by a rule, with the confidence its evidence gives: high for two or
    more sources and none against, moderate for more sources for than against, else low."""
    sup, con = {}, {}
    for r in Q(
        db, "MATCH (c:Claim)-[:SUPPORTED_BY]->(:Evidence)-[:FROM]->(s) RETURN c.id AS c, s.id AS s"
    ):
        sup.setdefault(r["c"], set()).add(r["s"])
    for r in Q(
        db,
        "MATCH (c:Claim)-[:CONTRADICTED_BY]->(:Evidence)-[:FROM]->(s) RETURN c.id AS c, s.id AS s",
    ):
        con.setdefault(r["c"], set()).add(r["s"])
    out = {}
    for r in Q(db, "MATCH (c:Claim) WHERE c.rule IS NULL RETURN c.id AS c"):
        s, k = sup.get(r["c"], set()), con.get(r["c"], set())
        out[r["c"]] = "high" if len(s) >= 2 and not k else "moderate" if len(s) > len(k) else "low"
    return out


def claim_status(db: GrafeoDB) -> dict[str, str]:
    """Each claim's status: confirmed if a finding confirms it, refuted if one refutes it, else
    open."""
    conf = {r["c"] for r in Q(db, "MATCH ()-[:CONFIRMS]->(c:Claim) RETURN c.id AS c")}
    ref = {r["c"] for r in Q(db, "MATCH ()-[:REFUTES]->(c:Claim) RETURN c.id AS c")}
    return {
        r["c"]: "confirmed" if r["c"] in conf else "refuted" if r["c"] in ref else "open"
        for r in Q(db, "MATCH (c:Claim) RETURN c.id AS c")
    }


def derived_ranges(db: GrafeoDB) -> dict[str, dict[str, Any]]:
    """rule:combine@1 on derived claims — both inputs true, dependence unknown; confidence the
    weakest input."""
    ins = {}
    for r in Q(
        db,
        "MATCH (d:Claim)-[:WAS_DERIVED_FROM]->(c:Claim) RETURN d.id AS d, c.likelihood AS l, c.likelihood_to AS lt, c.confidence AS k",  # noqa: E501  # one literal: embedded_queries reads it whole
    ):
        ins.setdefault(r["d"], []).append(r)
    out = {}
    for d, rs in ins.items():
        if any(span(r["l"], r["lt"]) is None for r in rs):
            continue
        iv = span(rs[0]["l"], rs[0]["lt"])
        for r in rs[1:]:
            iv = both(iv, span(r["l"], r["lt"]))
        w = words(iv).split(" to ")
        out[d] = {
            "likelihood": w[0],
            "likelihood_to": w[-1],
            "low_pct": float(iv[0]),
            "high_pct": float(iv[1]),
            "confidence": min((r["k"] for r in rs), key=CONFIDENCE.index),
        }
    return out


def certainty_lens(db: GrafeoDB) -> dict[str, str]:
    """lens:certainty@1 — confirmed, refuted, probable (whole range above even chance), doubtful
    (whole range below), open."""
    st = claim_status(db)
    return {
        r["c"]: "confirmed"
        if st[r["c"]] == "confirmed"
        else "refuted"
        if st[r["c"]] == "refuted"
        else (
            "undeclared"
            if span(r["l"], r["lt"]) is None
            else "probable"
            if span(r["l"], r["lt"])[0] >= 55
            else "doubtful"
            if span(r["l"], r["lt"])[1] <= 45
            else "open"
        )
        for r in Q(
            db, "MATCH (c:Claim) RETURN c.id AS c, c.likelihood AS l, c.likelihood_to AS lt"
        )
    }


def settled(db: GrafeoDB) -> dict[str, tuple[bool, Any]]:
    """Each claim a finding settled: {claim id: (came true?, when the finding was recorded)}."""
    return {
        r["c"]: (r["ty"] == "CONFIRMS", r["t"])
        for r in Q(
            db,
            "MATCH (f:Finding)-[r]->(c:Claim) RETURN c.id AS c, type(r) AS ty, f.recorded_at AS t",
        )
    }
