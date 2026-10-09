"""§20's checks on a plain graph: every stored certainty value equals its rule."""

from __future__ import annotations

from collections.abc import Collection
from typing import TYPE_CHECKING

from graphspec.rules.certainty import (
    calibration,
    claim_status,
    confidence_from_evidence,
    corroboration,
    derived_ranges,
    latest_assessment,
    reliability,
)

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph


def section20(g: Graph, switches: Collection[str] = frozenset()) -> list[tuple[str, bool, str]]:
    """§20's checks on one graph: every stored certainty value equals its rule. Returns [(label,
    ok, detail)]."""
    out = []
    stored = {c: g.p(c) for c in g.labelled("Claim")}
    if not stored:
        return out
    bands = {g.p(b).get("term") for b in g.labelled("LikelihoodBand")}
    used = (
        {p.get("likelihood") for p in stored.values()}
        | {p.get("likelihood_to") for p in stored.values() if p.get("likelihood_to")}
        | {g.p(a).get("likelihood") for a in g.labelled("Assessment")}
    )
    out.append(
        (
            "§20: every likelihood is a band declared in the graph",
            used <= bands,
            f"undeclared {sorted(x for x in used - bands if x)}",
        )
    )
    la = latest_assessment(g)
    bad = {
        c: (stored[c].get("likelihood"), v)
        for c, v in la.items()
        if stored[c].get("likelihood") != v
    }
    out.append(("§20: each claim's likelihood is its latest assessment", not bad, str(bad)))
    cf = confidence_from_evidence(g)
    bad = {
        c: (stored[c].get("confidence"), v)
        for c, v in cf.items()
        if stored[c].get("confidence") != v and stored[c].get("rule") is None
    }
    out.append(("§20: each claim's confidence is counted from its evidence", not bad, str(bad)))
    st = claim_status(g)
    bad = {c: (stored[c].get("status"), v) for c, v in st.items() if stored[c].get("status") != v}
    out.append(
        ("§20: each claim's status follows its confirmations and refutations", not bad, str(bad))
    )
    dv = derived_ranges(g)
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
    if g.labelled("Calibration"):
        cal = calibration(g, "before-settlement" not in switches)
        rows = {}
        for k in g.labelled("Calibration"):
            p = g.p(k)
            for _, _, x, _ in g.out(k, "OF"):
                rows[(x, p.get("term"))] = (
                    p.get("settled"),
                    p.get("came_true"),
                    (p.get("low_pct"), p.get("high_pct")),
                    p.get("outcome"),
                )
        bad = sorted(
            k
            for k in set(rows) | set(cal)
            if k not in rows
            or k not in cal
            or rows[k]
            != (cal[k]["settled"], cal[k]["came_true"], cal[k]["range"], cal[k]["verdict"])
        )
        out.append(
            (
                "§20: every calibration record equals rule:calibration@1 on the settled claims",
                not bad,
                str(bad),
            )
        )
    rel = reliability(g)
    rows = {s: g.p(s) for s in g.nodes if g.p(s).get("backed_settled") is not None}
    if rows:
        bad = sorted(
            s
            for s, p in rows.items()
            if s not in rel
            or (
                p.get("backed_settled"),
                p.get("backed_true"),
                (p.get("reliability_low_pct"), p.get("reliability_high_pct")),
            )
            != (rel[s]["backed"], rel[s]["came_true"], rel[s]["range"])
        )
        out.append(
            ("§20: every source's reliability equals rule:source-reliability@1", not bad, str(bad))
        )
    cor = corroboration(g, "one-vote-per-source" not in switches)
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
