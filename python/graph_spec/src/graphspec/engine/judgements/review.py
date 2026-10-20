"""§23 why a judgement needs a person again, and the why layer of a view."""

from __future__ import annotations

from collections.abc import Collection
from typing import TYPE_CHECKING, Any

from graphspec.engine.certainty.scale import band_rank
from graphspec.engine.judgements.basis import (
    JUDGEMENT_EDGES,
    basis,
    basis_hash,
    current_decisions,
    lens_bucket,
    resolve_ref,
)
from graphspec.engine.paths import view_at
from graphspec.rules.named_hashes import digits_of

if TYPE_CHECKING:
    from grafeo import GrafeoDB


def review(db: GrafeoDB, jg: str, switches: Collection[str] = frozenset()) -> dict[str, list[str]]:
    """rule:judgement-review@1 — why each current judgement needs a person again: basis moved,
    assumption weakened, shape changed."""
    out = {}
    for d in current_decisions(db, jg):
        why = set()
        for b in basis(db, jg, d):
            if b["ty"] not in JUDGEMENT_EDGES:
                continue
            p, _, sup = resolve_ref(db, jg, b)
            if p is None:
                continue  # rule 2 reports it
            if b["ty"] == "RESTS_ON" and b["e"].get(
                "lens"
            ):  # a pin on lens membership: the bucket it was in (§15)
                if "lens-pins" not in switches and lens_bucket(
                    db, jg, b["graph"], b["e"]["lens"], b["ref"]
                ) != b["e"].get("bucket"):
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
    db: GrafeoDB, jg: str, dg: str, top: str, level: int, switches: Collection[str] = frozenset()
) -> list[Any]:
    """The why layer of a view: current judgements resting on, or assuming, anything on screen — or
    folded into it at that altitude."""
    db.set_graph(dg)
    seen = {top} | set(view_at(db, top, level))
    if "why-folded" not in switches:
        seen |= {
            r["x"]
            for r in db.execute(
                f"MATCH (:Path {{id: '{top}'}})-[:STEP]->{{1,8}}(x) RETURN DISTINCT x.id AS x"
            )
        }
    hits = set()
    for d in current_decisions(db, jg):
        hits |= {
            d
            for b in basis(db, jg, d)
            if b["ty"] in ("RESTS_ON", "ASSUMES") and b["graph"] == dg and b["ref"] in seen
        }
    db.set_graph(jg)
    return sorted(hits)
