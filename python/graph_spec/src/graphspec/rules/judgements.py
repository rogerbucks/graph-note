"""§23 judgements on a plain world: refs followed, bases, current decisions, their hashes and
the review of each."""

from __future__ import annotations

from collections.abc import Collection
from typing import TYPE_CHECKING, Any

from graphspec.rules.canonical_json import basis_hash, hash16, jcs, norm
from graphspec.rules.named_hashes import digits_of
from graphspec.rules.lens import lens_buckets
from graphspec.rules.likelihood import band_rank
from graphspec.rules.paths import below, view_at

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import World


# ── §23 judgements ───────────────────────────────────────────────────────────────────────────
JUDGEMENT_EDGES = ("RESTS_ON", "ASSUMES", "UNDER")


def resolve(w: World, ref: dict[str, Any]) -> tuple[dict[str, Any] | None, set[str], bool]:
    """A Ref followed into the graph it names: (props or None, labels, superseded?)."""
    g = w.graphs.get(ref["graph"])
    if g is None or ref["ref"] not in g.nodes:
        return None, set(), False
    return g.p(ref["ref"]), set(g.nodes[ref["ref"]][0]), bool(g.inc(ref["ref"], "SUPERSEDES"))


def basis(w: World, jg: str, d: str) -> list[dict[str, Any]]:
    """Decision d's edges to Refs in judgement graph jg, as {ty, e (the edge's properties), ref,
    graph, rid}."""
    g = w[jg]
    return [
        {"ty": t, "e": p, "ref": g.p(r).get("ref"), "graph": g.p(r).get("graph"), "rid": r}
        for _, t, r, p in g.out(d)
        if g.has(r, "Ref")
    ]


def current_decisions(w: World, jg: str) -> list[str]:
    """The decisions in judgement graph jg that no later decision supersedes, sorted."""
    g = w[jg]
    return sorted(
        d
        for d in g.labelled("Decision")
        if not any(g.has(s, "Decision") for s, _, _, _ in g.inc(d, "SUPERSEDES"))
    )


def seal_hash(w: World, jg: str, i: str, key: str) -> str:
    """The content hash that seals node i of judgement graph jg: its own properties and every edge
    it states, under key. rule:judgement-hash@1 seals a Decision under 'decision',
    rule:serving-hash@1 a Serving under 'serving'."""
    g = w[jg]
    p = g.p(i)
    out = sorted(
        [[t, x, {k: norm(v) for k, v in sorted(e.items())}] for _, t, x, e in g.out(i)], key=jcs
    )
    return hash16(
        {
            key: {k: norm(v) for k, v in p.items() if k not in ("content_hash", "review")},
            "edges": out,
        }
    )


def judgement_hash(w: World, jg: str, d: str) -> str:
    """rule:judgement-hash@1 — decision d's own properties and every edge it states, so an edited
    pin shows."""
    return seal_hash(w, jg, d, "decision")


def serving_hash(w: World, jg: str, s: str) -> str:
    """rule:serving-hash@1 — serving s's own properties and every item it served, so an edited
    record shows."""
    return seal_hash(w, jg, s, "serving")


def review(w: World, jg: str, switches: Collection[str] = frozenset()) -> dict[str, list[str]]:
    """rule:judgement-review@1. A lens pin whose rule needs an engine gives the reason
    'needs-engine' — never silence."""
    out = {}
    for d in current_decisions(w, jg):
        why = set()
        for b in basis(w, jg, d):
            if b["ty"] not in JUDGEMENT_EDGES:
                continue
            p, _, sup = resolve(w, b)
            if p is None:
                continue
            if b["ty"] == "RESTS_ON" and b["e"].get("lens"):
                if "lens-pins" in switches:
                    continue
                lg = w[b["graph"]]
                lz = next((x for x in lg.labelled("Lens") if x == b["e"]["lens"]), None)
                got = lens_buckets(lg, lg.p(lz).get("rule_gql")) if lz else None
                if got is None:
                    why.add("needs-engine")
                elif got.get(b["ref"]) != b["e"].get("bucket"):
                    why.add("basis-moved")
            elif b["ty"] == "RESTS_ON" and (
                sup or basis_hash(p, b["e"]["reads"]) != digits_of(b["e"]["hash"])
            ):
                why.add("basis-moved")
            if b["ty"] == "ASSUMES" and (
                p.get("status") == "refuted"
                or (
                    "assumption-bands" not in switches
                    and band_rank(p.get("likelihood")) < band_rank(b["e"]["likelihood_then"])
                )
            ):
                why.add("assumption-weakened")
            if b["ty"] == "UNDER" and sup:
                why.add("shape-changed")
        out[d] = sorted(why)
    return out


def why_layer(
    w: World, jg: str, dg: str, top: str, level: int, switches: Collection[str] = frozenset()
) -> list[str]:
    """The why layer of a view: current judgements in jg resting on, or assuming, anything shown of
    path top in graph dg at that altitude — or folded into it, unless switched off."""
    g = w[dg]
    seen = {top} | set(view_at(g, top, level))
    if "why-folded" not in switches:
        seen |= below(g, top)
    return sorted(
        {
            d
            for d in current_decisions(w, jg)
            for b in basis(w, jg, d)
            if b["ty"] in ("RESTS_ON", "ASSUMES") and b["graph"] == dg and b["ref"] in seen
        }
    )
