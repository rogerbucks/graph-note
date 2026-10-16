"""§23's rules on a judgement graph, and which graphs they apply to."""

from __future__ import annotations

from typing import TYPE_CHECKING

from graphspec.rules.judgements import basis, judgement_hash, resolve, review
from graphspec.rules.proposers import proposer_warnings, proposers_of

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph
    from graphspec.rules.plain_graph import World


def judgements_rules(w: World, jg: str) -> list[tuple[str, bool, str]]:
    """§23's rules on judgement graph jg, and on the graphs of the world it refers into. Returns
    [(label, ok, detail)]."""
    g = w[jg]
    out = []
    ds = {d: g.p(d) for d in g.labelled("Decision")}
    bad = []
    for d in ds:
        who = [resolve(w, b)[1] for b in basis(w, jg, d) if b["ty"] == "DECIDED_BY"]
        if not who or any("Person" not in labels for labels in who):
            bad.append((d, [sorted(labels) for labels in who]))
    out.append(
        ("§23 rule 1: every judgement is decided by a person, never a model", not bad, str(bad))
    )
    bad = []
    for d, r in ds.items():
        for b in basis(w, jg, d):
            if b["ty"] != "RESTS_ON":
                continue
            p = resolve(w, b)[0]
            e = b["e"]
            said = (e.get("hash") and e.get("reads")) or (e.get("lens") and e.get("bucket"))
            if p is None or not said or not e.get("as_of") or e["as_of"] > r.get("at"):
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
        for b in basis(w, jg, d)
        if b["ty"] == "ASSUMES" and "Claim" not in resolve(w, b)[1]
    ]
    out.append(("§23 rule 3: every assumption is a claim (§20), never a fact", not bad, str(bad)))
    rv = review(w, jg)
    bad = {
        d: (r.get("review"), rv.get(d))
        for d, r in ds.items()
        if r.get("review") is not None and r["review"] != (", ".join(rv.get(d, [])) or "none")
    }
    out.append(("§23 rule 4: a stored review equals rule:judgement-review@1", not bad, str(bad)))
    bad = [
        (x, r)
        for x, other in w.graphs.items()
        if x != jg
        for r in other.labelled("Ref")
        if other.p(r).get("graph") == jg
    ]
    out.append(
        (
            "§23 rule 5: nothing in a data graph links into the judgement graph — "
            "judgements stay out of view",
            not bad,
            str(bad),
        )
    )
    bad = []
    for p in g.labelled("Proposal"):
        ms = proposers_of(w, g, p)
        if not ms or any("Model" not in m["labels"] for m in ms):
            bad.append(p)
    warnings = proposer_warnings(w, jg)
    out.append(
        (
            "§23 rule 6: every proposal is attributed to the model that proposed it",
            not bad,
            "; ".join([str(sorted(bad)), *("warning: " + x for x in warnings)]),
        )
    )
    bad = sorted(d for d, r in ds.items() if r.get("content_hash") != judgement_hash(w, jg, d))
    out.append(
        (
            "§23 rule 7: no judgement is edited — each content hash, covering its pins, "
            "still matches (rule:judgement-hash@1)",
            not bad,
            str(bad),
        )
    )
    return out


def is_judgement_graph(g: Graph) -> bool:
    """§23 applies to a graph that declares the judgement basis (RESTS_ON), or holds proposals or
    servings — not to every graph with a decision in it."""
    return (
        any(g.p(t).get("name") == "RESTS_ON" for t in g.labelled("ElementType"))
        or bool(g.labelled("Proposal"))
        or bool(g.labelled("Serving"))
    )
