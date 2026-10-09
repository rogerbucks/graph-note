"""§23's rules on a judgement graph."""

from __future__ import annotations

from collections.abc import Iterable
from typing import TYPE_CHECKING

from graphspec.engine.judgements.basis import basis, judgement_hash, resolve_ref
from graphspec.engine.judgements.review import review
from graphspec.engine.queries import Q

if TYPE_CHECKING:
    from grafeo import GrafeoDB


def judgements_rules(db: GrafeoDB, jg: str, graphs: Iterable[str]) -> list[tuple[str, bool, str]]:
    """§23's rules on a judgement graph. Returns [(label, ok, detail)]."""
    out = []
    db.set_graph(jg)
    ds = {
        r["d"]: r
        for r in Q(
            db,
            "MATCH (d:Decision) RETURN d.id AS d, d.at AS at, d.content_hash AS h, d.review AS review",  # noqa: E501  # one literal: embedded_queries reads it whole
        )
    }
    bad = []
    for d in ds:
        who = [resolve_ref(db, jg, r)[1] for r in basis(db, jg, d) if r["ty"] == "DECIDED_BY"]
        if not who or any("Person" not in labels for labels in who):
            bad.append((d, [sorted(labels) for labels in who]))
    out.append(
        ("§23 rule 1: every judgement is decided by a person, never a model", not bad, str(bad))
    )
    bad = []
    for d, r in ds.items():
        for b in basis(db, jg, d):
            if b["ty"] != "RESTS_ON":
                continue
            p, _, _ = resolve_ref(db, jg, b)
            said = (b["e"].get("hash") and b["e"].get("reads")) or (
                b["e"].get("lens") and b["e"].get("bucket")
            )  # what it read, or which bucket it was in
            if p is None or not said or not b["e"].get("as_of") or b["e"]["as_of"] > r["at"]:
                bad.append((d, b["ref"]))
    out.append(
        (
            "§23 rule 2: every basis pin resolves, says what it read (or which lens bucket), "
            "and was read no later than the decision",
            not bad,
            str(bad),
        )
    )
    bad = [
        (d, b["ref"])
        for d in ds
        for b in basis(db, jg, d)
        if b["ty"] == "ASSUMES" and "Claim" not in resolve_ref(db, jg, b)[1]
    ]
    out.append(("§23 rule 3: every assumption is a claim (§20), never a fact", not bad, str(bad)))
    rv = review(db, jg)
    bad = {
        d: (r["review"], rv.get(d))
        for d, r in ds.items()
        if r["review"] is not None and r["review"] != (", ".join(rv.get(d, [])) or "none")
    }
    out.append(("§23 rule 4: a stored review equals rule:judgement-review@1", not bad, str(bad)))
    bad = []
    for g in graphs:
        if g == jg:
            continue
        db.set_graph(g)
        bad += [(g, r["r"]) for r in Q(db, f"MATCH (r:Ref {{graph: '{jg}'}}) RETURN r.id AS r")]
    db.set_graph(jg)
    out.append(
        (
            "§23 rule 5: nothing in a data graph links into the judgement graph — "
            "judgements stay out of view",
            not bad,
            str(bad),
        )
    )
    bad = []
    for r in Q(
        db,
        "MATCH (p:Proposal) OPTIONAL MATCH (p)-[:WAS_GENERATED_BY]->(a:Activity)-[:ASSOCIATED_WITH]->(m:Ref) RETURN p.id AS p, m.ref AS m, m.graph AS g, m.id AS rid",  # noqa: E501  # one literal: embedded_queries reads it whole
    ):
        if not r["m"] or "Model" not in resolve_ref(db, jg, {"ref": r["m"], "graph": r["g"]})[1]:
            bad.append(r["p"])
    out.append(
        (
            "§23 rule 6: every proposal names the activity and the model that generated it",
            not bad,
            str(bad),
        )
    )
    bad = sorted(d for d, r in ds.items() if r["h"] != judgement_hash(db, jg, d))
    out.append(
        (
            "§23 rule 7: no judgement is edited — each content hash, covering its pins, "
            "still matches (rule:judgement-hash@1)",
            not bad,
            str(bad),
        )
    )
    return out
