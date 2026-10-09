"""§21 the claims a join makes where documents differ, and how values are written in their
ids."""

from __future__ import annotations

import datetime as dt
from collections.abc import Collection
from typing import Any


# ── the join ─────────────────────────────────────────────────────────────
def short(d: str) -> str:
    """A document id's own part: 'doc:a' is 'a'."""
    return d.split(":")[1]


def add_claim(
    J: dict[str, Any],  # noqa: N803  # public signature
    subject: str,
    what: str,
    docs: Collection[str],
    group: tuple[Any, ...],
    about: list[tuple[str, str]],
    **p: Any,
) -> str:
    """Adds to the join a contested claim, stated in the documents given, and returns its id."""
    cid = f"claim:join/{subject}/{what}@{'+'.join(short(d) for d in sorted(docs))}"
    J["claims"][cid] = {
        "id": cid,
        "likelihood": "cannot-judge",
        "confidence": "low",
        "status": "contested",
        "rule": "rule:join@1",
        "stated_in": " ".join(sorted(docs)),
        "_about": about,
        "_g": group,
        "_docs": sorted(docs),
        **p,
    }
    return cid


def vtext(v: Any) -> str:
    """A value as it is written inside an identifier — the same in every language (RFC 8785 for
    numbers and true/false; dates in ISO 8601)."""
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    if isinstance(v, str):
        return v
    from graphspec.rules.canonical_json import jcs

    return jcs(v)


def ident_str(k: tuple[Any, ...]) -> str:
    """A relationship key's identifying values, each written as in an identifier, joined by ';'."""
    return ";".join(vtext(x) for x in k[3] if x is not None)


def new_J() -> dict[str, Any]:  # noqa: N802  # public name, kept for the conformance suite
    """An empty join."""
    return {
        "nodes": {},
        "edges": {},
        "src": {},
        "esrc": {},
        "claims": {},
        "report": [],
        "pairs": [],
        "paradoxes": [],
        "superseded": {},
    }
