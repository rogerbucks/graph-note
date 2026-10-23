"""A text merge checked by the meaning-level join (editor spec §30, same_join_every_author).

A sync or a version tool can merge two edits of one note by its text. So it can pick one value
where the two edits disagree. That pick is never the decision. The two edits are joined over
their base by the §21 join, as any author's edits are. Each value the merged text holds where the
join left a dispute is reported as picked, for a person to decide.

It follows packages/graph-spec/src/mesh/after-text-merge.js, and the shared cases hold both alike.
"""

from __future__ import annotations

from typing import Any

from graphspec.engine.joining.finish import join3
from graphspec.rules.canonical_json import jcs, norm


def _same(a: Any, b: Any) -> bool:
    return jcs(norm(a)) == jcs(norm(b))


def after_text_merge(
    base: dict[str, Any],
    ours: dict[str, Any],
    theirs: dict[str, Any],
    merged: dict[str, Any],
    C: dict[str, Any],  # noqa: N803  # as the other join steps name it
) -> dict[str, Any]:
    """The two edits joined over their base, and the merged text read against that join. Gives
    the claims the join left contested, and each value the merged text picked among them: its
    thing, its property, the value, the claim it matches and the claims it passed over. settled
    is true only when the join left nothing in dispute."""
    joined = join3(base, ours, theirs, C)
    contested = [c for c in joined["claims"].values() if c["status"] == "contested"]
    by_slot: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for c in contested:
        if "claimed_property" not in c:
            continue
        by_slot.setdefault((c["_about"][0][1], c["claimed_property"]), []).append(c)
    picked = []
    for (subject, about), claims in by_slot.items():
        node = merged["nodes"].get(subject)
        if not node or about not in node["props"]:
            continue
        value = node["props"][about]
        hit = next((c for c in claims if _same(c["claimed_value"], value)), None)
        if hit is None:
            continue
        over = sorted(c["id"] for c in claims if c is not hit)
        picked.append(
            {
                "subject": subject,
                "about": about,
                "value": norm(value),
                "claim": hit["id"],
                "over": over,
            }
        )
    picked.sort(key=lambda p: (p["subject"], p["about"]))
    return {
        "contested": sorted(c["id"] for c in contested),
        "picked": picked,
        "settled": not contested,
    }
