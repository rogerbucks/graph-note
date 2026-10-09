"""§20's conformance checks on one graph: every stored certainty value equals its rule."""

from __future__ import annotations

from collections.abc import Collection
from typing import TYPE_CHECKING

from graphspec.engine.certainty.caches import (
    claim_status,
    confidence_from_evidence,
    derived_ranges,
    latest_assessment,
)
from graphspec.engine.certainty.track_record import calibration, corroboration, reliability
from graphspec.engine.queries import Q

if TYPE_CHECKING:
    from grafeo import GrafeoDB


def section20(
    db: GrafeoDB, switches: Collection[str] = frozenset()
) -> list[tuple[str, bool, str]]:
    """§20's conformance checks on one graph: every stored certainty value equals its rule. Returns
    [(label, ok, detail)]."""
    out = []
    stored = {
        r["c"]: r["p"] for r in Q(db, "MATCH (c:Claim) RETURN c.id AS c, properties(c) AS p")
    }
    if not stored:
        return out
    bands = {r["t"] for r in Q(db, "MATCH (b:LikelihoodBand) RETURN b.term AS t")}
    used = (
        {p.get("likelihood") for p in stored.values()}
        | {p.get("likelihood_to") for p in stored.values() if p.get("likelihood_to")}
        | {r["l"] for r in Q(db, "MATCH (a:Assessment) RETURN a.likelihood AS l")}
    )
    out.append(
        (
            "§20: every likelihood is a band declared in the graph",
            used <= bands,
            f"undeclared {sorted(used - bands)}",
        )
    )
    la = latest_assessment(db)
    bad = {
        c: (stored[c].get("likelihood"), v)
        for c, v in la.items()
        if stored[c].get("likelihood") != v
    }
    out.append(("§20: each claim's likelihood is its latest assessment", not bad, str(bad)))
    cf = confidence_from_evidence(db)
    bad = {
        c: (stored[c].get("confidence"), v)
        for c, v in cf.items()
        if stored[c].get("confidence") != v and stored[c].get("rule") is None
    }
    out.append(("§20: each claim's confidence is counted from its evidence", not bad, str(bad)))
    st = claim_status(db)
    bad = {c: (stored[c].get("status"), v) for c, v in st.items() if stored[c].get("status") != v}
    out.append(
        ("§20: each claim's status follows its confirmations and refutations", not bad, str(bad))
    )
    dv = derived_ranges(db)
    bad = {
        d: v
        for d, v in dv.items()
        if any(
            stored[d].get(k) != x
            for k, x in v.items()
            if not (k == "likelihood_to" and x == v["likelihood"] and stored[d].get(k) is None)
        )
    }
    if dv:
        out.append(
            (
                "§20: each derived claim's range and confidence equal rule:combine@1 "
                "on its inputs",
                not bad,
                str(bad),
            )
        )
    unassessed = sorted(set(stored) - set(la) - {c for c, p in stored.items() if p.get("rule")})
    out.append(
        (
            "§20: every claim not derived by a rule has an assessment",
            not unassessed,
            str(unassessed),
        )
    )
    if Q(db, "MATCH (k:Calibration) RETURN k LIMIT 1"):
        cal = calibration(db, "before-settlement" not in switches)
        rows = {
            (r["x"], r["w"]): r
            for r in Q(
                db,
                "MATCH (k:Calibration)-[:OF]->(x) RETURN x.id AS x, k.term AS w, k.settled AS n, k.came_true AS k, k.low_pct AS lo, k.high_pct AS hi, k.outcome AS o",  # noqa: E501  # one literal: embedded_queries reads it whole
            )
        }
        bad = sorted(
            k
            for k in set(rows) | set(cal)
            if k not in rows
            or k not in cal
            or (rows[k]["n"], rows[k]["k"], (rows[k]["lo"], rows[k]["hi"]), rows[k]["o"])
            != (cal[k]["settled"], cal[k]["came_true"], cal[k]["range"], cal[k]["verdict"])
        )
        out.append(
            (
                "§20: every calibration record equals rule:calibration@1 on the settled claims",
                not bad,
                str(bad),
            )
        )
    rel = reliability(db)
    rows = {
        r["s"]: r
        for r in Q(
            db,
            "MATCH (s) WHERE s.backed_settled IS NOT NULL RETURN s.id AS s, s.backed_settled AS n, s.backed_true AS k, s.reliability_low_pct AS lo, s.reliability_high_pct AS hi",  # noqa: E501  # one literal: embedded_queries reads it whole
        )
    }
    if rows:
        bad = sorted(
            s
            for s in rows
            if s not in rel
            or (rows[s]["n"], rows[s]["k"], (rows[s]["lo"], rows[s]["hi"]))
            != (rel[s]["backed"], rel[s]["came_true"], rel[s]["range"])
        )
        out.append(
            ("§20: every source's reliability equals rule:source-reliability@1", not bad, str(bad))
        )
    cor = (
        corroboration(db, "one-vote-per-source" not in switches)
        if Q(db, "MATCH (c:Claim {rule: 'rule:corroborate@1'}) RETURN c LIMIT 1")
        else {}
    )
    if cor:
        bad = {
            c: v
            for c, v in cor.items()
            if (stored[c].get("low_pct"), stored[c].get("high_pct")) != v
        }
        out.append(
            (
                "§20: every corroborated claim's range equals rule:corroborate@1, "
                "one vote per source",
                not bad,
                str(bad),
            )
        )
    return out
