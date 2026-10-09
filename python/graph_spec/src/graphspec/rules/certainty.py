"""§20 certainty worked out from a plain graph: latest assessments, confidence, status,
derived ranges, calibration, reliability and corroboration."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from graphspec.rules.likelihood import (
    CONFIDENCE,
    RANGE,
    both,
    corroborate,
    span,
    verdict,
    wilson,
    words,
)

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph


def latest_assessment(g: Graph) -> dict[str, Any]:
    """Each assessed claim's likelihood in its latest assessment: {claim id: likelihood}."""
    best = {}
    for a in g.labelled("Assessment"):
        for _, _, c, _ in g.out(a, "ASSESSES"):
            if not g.has(c, "Claim"):
                continue
            at = g.p(a).get("at")
            if c not in best or at > best[c][0]:
                best[c] = (at, g.p(a).get("likelihood"))
    return {c: v[1] for c, v in best.items()}


def _sources(g, c, typ):
    return {
        s
        for _, _, e, _ in g.out(c, typ)
        if g.has(e, "Evidence")
        for _, _, s, _ in g.out(e, "FROM")
    }


def confidence_from_evidence(g: Graph) -> dict[str, str]:
    """Each claim not derived by a rule, with the confidence its evidence gives: high for two or
    more sources and none against, moderate for more sources for than against, else low."""
    out = {}
    for c in g.labelled("Claim"):
        if g.p(c).get("rule") is not None:
            continue
        s, k = _sources(g, c, "SUPPORTED_BY"), _sources(g, c, "CONTRADICTED_BY")
        out[c] = "high" if len(s) >= 2 and not k else "moderate" if len(s) > len(k) else "low"
    return out


def claim_status(g: Graph) -> dict[str, str]:
    """Each claim's status: confirmed if a finding confirms it, refuted if one refutes it, else
    open."""
    conf = {c for c in g.labelled("Claim") if g.inc(c, "CONFIRMS")}
    ref = {c for c in g.labelled("Claim") if g.inc(c, "REFUTES")}
    return {
        c: "confirmed" if c in conf else "refuted" if c in ref else "open"
        for c in g.labelled("Claim")
    }


def derived_ranges(g: Graph) -> dict[str, dict[str, Any]]:
    """rule:combine@1 on each derived claim whose inputs all have ranges — both inputs true,
    dependence unknown; its confidence the weakest input's."""
    out = {}
    for d in g.labelled("Claim"):
        rs = [g.p(c) for _, _, c, _ in g.out(d, "WAS_DERIVED_FROM") if g.has(c, "Claim")]
        if not rs or any(span(r.get("likelihood"), r.get("likelihood_to")) is None for r in rs):
            continue
        iv = span(rs[0].get("likelihood"), rs[0].get("likelihood_to"))
        for r in rs[1:]:
            iv = both(iv, span(r.get("likelihood"), r.get("likelihood_to")))
        w = words(iv).split(" to ")
        out[d] = {
            "likelihood": w[0],
            "likelihood_to": w[-1],
            "low_pct": float(iv[0]),
            "high_pct": float(iv[1]),
            "confidence": min((r.get("confidence") for r in rs), key=CONFIDENCE.index),
        }
    return out


def settled(g: Graph) -> dict[str, tuple[bool, Any]]:
    """Each claim a finding settled: {claim id: (came true?, when the finding was recorded)}."""
    out = {}
    for f in g.labelled("Finding"):
        for _, ty, c, _ in g.out(f):
            if ty in ("CONFIRMS", "REFUTES") and g.has(c, "Claim"):
                out[c] = (ty == "CONFIRMS", g.p(f).get("recorded_at"))
    return out


def calibration(g: Graph, before_settlement: bool = True) -> dict[tuple[str, str], dict[str, Any]]:
    """rule:calibration@1 — per assessor and word, only the last assessment recorded before the
    claim was settled (any, when before_settlement is False): how many settled, how many came
    true, their Wilson range and verdict."""
    outcomes = settled(g)
    last = {}
    for a in g.labelled("Assessment"):
        for _, _, c, _ in g.out(a, "ASSESSES"):
            if not g.has(c, "Claim"):
                continue
            for _, _, x, _ in g.out(a, "BY"):
                w, t = g.p(a).get("likelihood"), g.p(a).get("recorded_at")
                if c not in outcomes or (before_settlement and t >= outcomes[c][1]):
                    continue
                if (x, c) not in last or t > last[(x, c)][1]:
                    last[(x, c)] = (w, t)
    tally = {}
    for (x, c), (w, _) in last.items():
        n, k = tally.get((x, w), (0, 0))
        tally[(x, w)] = (n + 1, k + outcomes[c][0])
    return {
        xw: {
            "settled": n,
            "came_true": k,
            "range": wilson(k, n),
            "verdict": verdict(wilson(k, n), RANGE[xw[1]]),
        }
        for xw, (n, k) in tally.items()
    }


def reliability(g: Graph) -> dict[str, dict[str, Any]]:
    """rule:source-reliability@1 — over the distinct settled claims each source backed: how many,
    how many came true, and their Wilson range."""
    outcomes = settled(g)
    rec = {}
    for c in g.labelled("Claim"):
        if c in outcomes:
            for s in _sources(g, c, "SUPPORTED_BY"):
                rec.setdefault(s, set()).add(c)
    return {
        s: {
            "backed": len(cs),
            "came_true": sum(outcomes[c][0] for c in cs),
            "range": wilson(sum(outcomes[c][0] for c in cs), len(cs)),
        }
        for s, cs in rec.items()
    }


def corroboration(g: Graph, one_vote_per_source: bool = True) -> dict[str, tuple[float, float]]:
    """rule:corroborate@1 on each claim that names it: its range from the reliability of the
    sources backing it, one vote per source unless one_vote_per_source is False."""
    reliabilities = reliability(g)
    out = {}
    for c in g.labelled("Claim"):
        if g.p(c).get("rule") != "rule:corroborate@1":
            continue
        rows = [
            s
            for _, _, e, _ in g.out(c, "SUPPORTED_BY")
            if g.has(e, "Evidence")
            for _, _, s, _ in g.out(e, "FROM")
        ]
        srcs = sorted(set(rows)) if one_vote_per_source else rows
        out[c] = corroborate([reliabilities[s]["range"] for s in srcs], g.p(c).get("base_pct"))
    return out
