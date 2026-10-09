"""The canonical hash of a stored graph — the same as the Grafeo checker's, so the reader can
be proved equal to it."""

from __future__ import annotations

import datetime as dt
import hashlib
from typing import TYPE_CHECKING

from graphspec.reader.lexer import UTC

if TYPE_CHECKING:
    from graphspec.reader.store import Store


def _norm(p):
    return {
        k: (
            v.replace(tzinfo=UTC).isoformat()
            if isinstance(v, dt.datetime)
            else v.isoformat()
            if isinstance(v, dt.date)
            else v
        )
        for k, v in (p or {}).items()
        if v is not None
    }


def canon(store: Store, g: str) -> tuple[str, int, int]:
    """The same canonical hash as graph_spec.canon_graph — so the reader can be proved equal to
    Grafeo."""
    graph = store.graph(g)
    byk = {k: n["props"]["id"] for k, n in graph["nodes"].items()}
    from graphspec.rules.canonical_json import jcs

    body = sorted(
        [[sorted(n["labels"]), _norm(n["props"])] for n in graph["nodes"].values()],
        key=lambda x: x[1]["id"],
    ) + sorted([[byk[s], t, byk[d], _norm(p)] for s, t, d, p in graph["edges"]], key=jcs)
    return hashlib.sha256(jcs(body).encode()).hexdigest(), len(graph["nodes"]), len(graph["edges"])
