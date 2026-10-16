"""Who proposed a Proposal (§23 rule 6, §24 H3 rule 4), as W3C PROV records it: the Proposal is
WAS_ATTRIBUTED_TO the agent, a Ref to a Model in another graph. For one release the old form is
still read, with a warning naming the fix: the Proposal WAS_GENERATED_BY an Activity that is
ASSOCIATED_WITH the agent. The twin of proposers.js."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from graphspec.rules.judgements import resolve

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph, World


def proposers_of(w: World, g: Graph, p: str) -> list[dict[str, Any]]:
    """The proposers of proposal `p`: each {labels, via, id, activity}, `labels` those of the thing
    the Ref resolves to, `via` 'attributed' or 'legacy' (the old form, with its `activity`)."""

    def entry(ref, via, activity=None):
        p = g.p(ref)
        labels = resolve(w, {"ref": p.get("ref"), "graph": p.get("graph")})[1]
        return {"id": ref, "via": via, "activity": activity, "labels": labels}

    return [
        entry(m, "attributed") for _, _, m, _ in g.out(p, "WAS_ATTRIBUTED_TO") if g.has(m, "Ref")
    ] + [
        entry(m, "legacy", a)
        for _, _, a, _ in g.out(p, "WAS_GENERATED_BY")
        if g.has(a, "Activity")
        for _, _, m, _ in g.out(a, "ASSOCIATED_WITH")
        if g.has(m, "Ref")
    ]


def proposer_warnings(w: World, name: str) -> list[str]:
    """The warnings for the old form, sorted: each names the fix."""
    g = w[name]
    return sorted(
        f"{p} names its proposer through ASSOCIATED_WITH on its activity {x['activity']}: "
        f"attribute it with ({p})-[:WAS_ATTRIBUTED_TO]->({x['id']}) instead; the old form is "
        "accepted for one release"
        for p in g.labelled("Proposal")
        for x in proposers_of(w, g, p)
        if x["via"] == "legacy"
    )
