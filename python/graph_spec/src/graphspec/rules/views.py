"""Views of a graph — its projection, its relationships as Mermaid with their legend, and its
paths — the same text from Python and from JavaScript."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from graphspec.rules.canonical_json import jcs
from graphspec.rules.paths import view_at
from graphspec.rules.projection import project
from graphspec.rules.schema_types import SPEC_SCHEMA_NODES

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph


# ── views — the same text from Python and from JavaScript ──────────────────────
# left out of views: the schema, and §20's likelihood scale
SCHEMA_LABELS = SPEC_SCHEMA_NODES | {"LikelihoodBand"}


def _caption(g, i):
    p = g.p(i)
    t = p.get("name") or p.get("title") or p.get("label")
    text = f"{i}<br/>{t}" if isinstance(t, str) and t else i
    return text.replace('"', "'")


def readings(g: Graph, shared: Graph | None = None) -> dict[str, tuple[str | None, str | None]]:
    """Each declared edge type's words (§5) — {type: (reading, reverse reading)} — from the graph's
    own schema, else the shared one it names."""
    element_types = [g.p(i) for i in g.labelled("ElementType")] or (
        [shared.p(i) for i in shared.labelled("ElementType")] if shared is not None else []
    )
    return {
        t["name"]: (t.get("reading"), t.get("reverse_name"))
        for t in element_types
        if t.get("kind") == "edge"
    }


def _word(type_words, t):
    # undeclared (a draft): the type's own words, COUNTS_AGAINST -> counts against
    return (type_words.get(t, (None, None))[0] or t.replace("_", " ").lower()).replace('"', "'")


def mermaid_graph(g: Graph, shared: Graph | None = None) -> str:
    """The graph's knowledge as a Mermaid flowchart — every node but the schema's, every
    relationship between them, labelled by its reading (§5), or its type if none is declared."""
    ids = sorted(i for i, (labels, _) in g.nodes.items() if not labels & SCHEMA_LABELS)
    var = {i: f"n{k}" for k, i in enumerate(ids)}
    type_words = readings(g, shared)
    lines = ["flowchart LR"] + [f'    {var[i]}["{_caption(g, i)}"]' for i in ids]
    lines += sorted(
        f"    {var[s]} -->|{_word(type_words, t)}| {var[d]}"
        for s, t, d, _ in g.edges
        if s in var and d in var
    )
    return "\n".join(lines)


def legend(g: Graph, shared: Graph | None = None) -> str:
    """What each reading in the relationships view stands for — one line per edge type drawn:
    reading = TYPE · reverse reading."""
    ids = {i for i, (labels, _) in g.nodes.items() if not labels & SCHEMA_LABELS}
    type_words = readings(g, shared)
    used = sorted({t for s, t, d, _ in g.edges if s in ids and d in ids})
    return "\n".join(
        f"{_word(type_words, t)} = {t}"
        + (f" · reverse: {type_words[t][1]}" if type_words.get(t, (None, None))[1] else "")
        for t in used
    )


def mermaid_path(g: Graph, top: str, level: int) -> str:
    """A path seen at an altitude (§22): the path, then what it shows at that level, in order."""
    items = view_at(g, top, level)
    lines = ["flowchart TB", f'    p["{_caption(g, top)}<br/>at altitude {level}"]']
    lines += [f'    s{k}["{_caption(g, x)}"]' for k, x in enumerate(items)]
    lines += ["    p --> s0"] if items else []
    lines += [f"    s{k} --> s{k + 1}" for k in range(len(items) - 1)]
    return "\n".join(lines)


def tops(g: Graph) -> list[str]:
    """Paths nothing else steps into — where a reader starts."""
    return sorted(
        p
        for p in g.labelled("Path")
        if not any(g.has(s, "Path") for s, _, _, _ in g.inc(p, "STEP"))
    )


def views(g: Graph, shared: Graph | None = None) -> dict[str, str]:
    """Every view of one graph: its flat projection, its relationships with their legend, and each
    top path at each altitude it spans."""
    blocks, rels = project(g)
    out = {
        "projection": jcs(json.loads(json.dumps({"blocks": blocks, "relationships": rels}))),
        "relationships": mermaid_graph(g, shared),
        "legend": legend(g, shared),
    }
    for t in tops(g):
        for level in range(int(g.p(t).get("altitude") or 0), -1, -1):
            out[f"path {t} at {level}"] = mermaid_path(g, t, level)
    return out
