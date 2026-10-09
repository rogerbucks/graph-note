"""§21 checking what a join did: what it holds, what it lost and what it invented."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from graphspec.engine.joining.restating import doc_statements, refines, statements


# ── checking what a join did ──────────────────────────────────────────────
def held(J: dict[str, Any], doc_id: str) -> set[tuple[Any, ...]]:  # noqa: N803  # public signature
    """Everything the join holds of what one document said: the joined graph's statements and the
    claims made from that document."""
    have = statements(
        {i: {"labels": n["labels"], "props": n["props"]} for i, n in J["nodes"].items()},
        J["edges"],
    )
    for c in J["claims"].values():
        if (
            doc_id not in c["_docs"]
            or c.get("claimed_absent")
            or c.get("claimed_exists")
            or "claimed_node" in c
        ):
            continue
        s = c["_about"][0][1]
        if "claimed_relationship" in c and "claimed_property" in c:
            have.add(("eprop",) + c["_key"] + (c["claimed_property"], c["claimed_value"]))
        elif "claimed_relationship" in c:
            have |= {("edge",) + c["_key"]} | {
                ("eprop",) + c["_key"] + (k, v) for k, v in c["_props"].items()
            }
        elif "claimed_property" in c:
            have.add(("prop", s, c["claimed_property"], c["claimed_value"]))
        else:
            have |= {("label", s, label) for label in c["claimed_label"].split(":")}
    return have


def lost(J: dict[str, Any], doc: dict[str, Any]) -> list[tuple[Any, ...]]:  # noqa: N803  # public signature
    """What a document said that the join neither holds nor superseded nor refined — which must be
    nothing."""
    h = held(J, doc["id"])
    sup = J["superseded"].get(doc["id"], set())
    return sorted(
        (
            s
            for s in doc_statements(doc)
            if s not in h
            and s not in sup
            and not (
                s[0] == "prop"
                and any(x[0] == "prop" and x[1:3] == s[1:3] and refines(x[3], s[3]) for x in h)
            )
        ),
        key=str,
    )


def invented(J: dict[str, Any], docs: Iterable[dict[str, Any]]) -> list[tuple[Any, ...]]:  # noqa: N803  # public signature
    """What the joined graph says that no document said — which must be nothing."""
    said = set().union(*(doc_statements(d) for d in docs))
    return sorted(
        statements(
            {i: {"labels": n["labels"], "props": n["props"]} for i, n in J["nodes"].items()},
            J["edges"],
        )
        - said,
        key=str,
    )
