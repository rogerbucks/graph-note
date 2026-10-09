"""§20 track records through Grafeo: calibration, source reliability and corroboration."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from graphspec.engine.certainty.caches import settled
from graphspec.engine.certainty.scale import RANGE, corroborate, verdict, wilson
from graphspec.engine.queries import Q

if TYPE_CHECKING:
    from grafeo import GrafeoDB


def calibration(
    db: GrafeoDB, before_settlement: bool = True
) -> dict[tuple[str, str], dict[str, Any]]:
    """rule:calibration@1 — per assessor and word, only the last assessment recorded before the
    claim was settled."""
    outcomes = settled(db)
    last = {}
    for r in Q(
        db,
        "MATCH (a:Assessment)-[:ASSESSES]->(c:Claim) MATCH (a)-[:BY]->(x) RETURN c.id AS c, x.id AS x, a.likelihood AS w, a.recorded_at AS t",  # noqa: E501  # one literal: embedded_queries reads it whole
    ):
        if r["c"] not in outcomes or (before_settlement and r["t"] >= outcomes[r["c"]][1]):
            continue
        if (r["x"], r["c"]) not in last or r["t"] > last[(r["x"], r["c"])][1]:
            last[(r["x"], r["c"])] = (r["w"], r["t"])
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


def reliability(db: GrafeoDB) -> dict[str, dict[str, Any]]:
    """rule:source-reliability@1 — over the distinct settled claims each source backed."""
    outcomes = settled(db)
    rec = {}
    for r in Q(
        db,
        "MATCH (c:Claim)-[:SUPPORTED_BY]->(:Evidence)-[:FROM]->(s) RETURN DISTINCT c.id AS c, s.id AS s",  # noqa: E501  # one literal: embedded_queries reads it whole
    ):
        if r["c"] in outcomes:
            rec.setdefault(r["s"], set()).add(r["c"])
    return {
        s: {
            "backed": len(cs),
            "came_true": sum(outcomes[c][0] for c in cs),
            "range": wilson(sum(outcomes[c][0] for c in cs), len(cs)),
        }
        for s, cs in rec.items()
    }


def corroboration(
    db: GrafeoDB, one_vote_per_source: bool = True
) -> dict[str, tuple[float, float]]:
    """rule:corroborate@1 on each claim that names it: its range from the reliability of the
    sources backing it, one vote per source unless one_vote_per_source is False."""
    reliabilities = reliability(db)
    out = {}
    for c in Q(
        db, "MATCH (c:Claim {rule: 'rule:corroborate@1'}) RETURN c.id AS c, c.base_pct AS b"
    ):
        rows = Q(
            db,
            f"MATCH (c:Claim {{id: '{c['c']}'}})-[:SUPPORTED_BY]->(e:Evidence)-[:FROM]->(s) RETURN e.id AS e, s.id AS s",  # noqa: E501  # one literal: embedded_queries reads it whole
        )
        srcs = sorted({r["s"] for r in rows}) if one_vote_per_source else [r["s"] for r in rows]
        out[c["c"]] = corroborate([reliabilities[s]["range"] for s in srcs], c["b"])
    return out


def calibrated_marker(db: GrafeoDB) -> dict[str, list[str]]:
    """Each assessor, with the words its calibration records find calibrated, sorted."""
    return {
        r["x"]: sorted(
            x["w"]
            for x in Q(
                db,
                f"MATCH (k:Calibration {{outcome: 'calibrated'}})-[:OF]->(x {{id: '{r['x']}'}}) RETURN k.term AS w",  # noqa: E501  # one literal: embedded_queries reads it whole
            )
        )
        for r in Q(db, "MATCH ()-[:BY]->(x) RETURN DISTINCT x.id AS x")
    }


def sources_of(db: GrafeoDB, claim: str) -> set[str]:
    """The sources of the evidence for or against a claim."""
    return {
        r["s"]
        for r in Q(
            db,
            f"MATCH (c:Claim {{id: '{claim}'}})-[:SUPPORTED_BY|CONTRADICTED_BY]->(:Evidence)-[:FROM]->(s) RETURN s.id AS s",  # noqa: E501  # one literal: embedded_queries reads it whole
        )
    }
