"""§24 servings: what a consumer may be served, and the rules on a judgement graph's
Servings."""

from __future__ import annotations

from typing import TYPE_CHECKING

from graphspec.rules.proposers import proposers_of

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import World


# ── §24 servings ────────────────────────────────────────────────────────────────────────────
def may_serve(
    kind: str | None,
    cls: str | None,
    conditions_met: bool | None,
    matrix: dict[str, dict[str, str]],
) -> bool:
    """Whether the destination matrix lets a consumer of this kind be served an item of this class;
    a conditional one needs its conditions met."""
    v = matrix.get(kind, {}).get(cls)
    return v == "yes" or (v == "conditional" and bool(conditions_met))


def served_rules(
    w: World, jg: str, matrix: dict[str, dict[str, str]]
) -> list[tuple[str, bool, str]]:
    """§24 H3's rules on judgement graph jg's Servings and proposals, against the destination
    matrix. Returns [(label, ok, detail)]."""
    g = w[jg]
    out = []
    if not g.labelled("Serving") and not g.labelled("Proposal"):
        return out
    served = {}
    for p in g.labelled("Proposal"):
        for _, _, s, _ in g.out(p, "USED"):
            if g.has(s, "Serving"):
                for _, _, x, e in g.out(s, "SERVED"):
                    served.setdefault(p, {})[x] = e
    bad = []
    for p in g.labelled("Proposal"):
        for _, _, x, e in g.out(p, "RESTS_ON"):
            if not g.has(x, "Ref"):
                continue
            s = served.get(p, {}).get(x)
            if not s or any(s.get(k) != e.get(k) for k in ("reads", "hash", "as_of")):
                bad.append((p, x))
    out.append(
        (
            "§24 H3 rule 1: every pin of a proposal was served to its model — "
            "same item, same properties, same hash, same time",
            not bad,
            str(bad),
        )
    )
    bad = [
        (s, x, e.get("classification"), g.p(s).get("consumer_kind"))
        for s in g.labelled("Serving")
        for _, _, x, e in g.out(s, "SERVED")
        if not may_serve(
            g.p(s).get("consumer_kind"),
            e.get("classification"),
            g.p(s).get("conditions_met"),
            matrix,
        )
    ]
    out.append(
        (
            "§24 H3 rule 2: no serving crossed its classification — "
            "the consumer was allowed every item served",
            not bad,
            str(bad),
        )
    )
    bad = []
    for p in g.labelled("Proposal"):
        ms = proposers_of(w, g, p)
        if any("Model" in m["labels"] for m in ms) and not any(
            g.has(s, "Serving") for _, _, s, _ in g.out(p, "USED")
        ):
            bad.append(p)
    out.append(
        (
            "§24 H3 rule 4: every proposal a model generated used a serving — "
            "it drafted from what it was shown",
            not bad,
            str(sorted(bad)),
        )
    )
    return out
