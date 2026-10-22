"""The text a thing is shown by in a drawing: chosen by one ranked rule, the same from JavaScript
(packages/graph-spec/src/rules/shown-text.js, shownText)."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph

# The keys a thing's text is written under, first: the usual name keys, then the keys for wording.
NAME_KEYS = ("name", "title", "text", "label")
WORDING_KEYS = ("statement", "summary", "heading", "question", "description")
# The most characters a box shows; longer text is cut at a word and ends in "…".
SHOWN_LIMIT = 80

_TWO_WORDS = re.compile(r"[^ ] +[^ ]")


def _filled(v) -> bool:
    return isinstance(v, str) and v != ""


def _readable(v) -> bool:
    # a letter, two words with a space between, and not a link: never an id, a date or a number
    return (
        _filled(v)
        and bool(_TWO_WORDS.search(v))
        and any(c.isalpha() for c in v)
        and "://" not in v
    )


def clip_shown(text: str) -> str:
    """Text cut to the limit, counted in characters: at the last space in its second half, else
    mid-word, then "…"."""
    if len(text) <= SHOWN_LIMIT:
        return text
    head = text[: SHOWN_LIMIT - 1]
    space = head.rfind(" ")
    if space >= 0 and space >= SHOWN_LIMIT / 2:
        head = head[:space]
    return head.rstrip(" ") + "…"


def _shown_by(g: Graph, i: str, shared: Graph | None) -> str | None:
    """The property a thing's schema says it is shown by: the first of its kinds, in code order,
    whose node type names one."""
    element_types = [g.p(t) for t in g.labelled("ElementType")] or (
        [shared.p(t) for t in shared.labelled("ElementType")] if shared is not None else []
    )
    named = {
        t["name"]: t["shown_by"]
        for t in element_types
        if t.get("kind") == "node" and _filled(t.get("shown_by"))
    }
    kinds = sorted(g.nodes[i][0]) if i in g.nodes else []
    return next((named[k] for k in kinds if k in named), None)


def shown_text(g: Graph, i: str, shared: Graph | None = None) -> tuple[str, str | None]:
    """(text, key) a thing is shown by. The first that gives text wins: the property its schema
    names (shown_by), a name key, a wording key, then the first readable text in the order written.
    Else it is its id, with key None. The text is cut by clip_shown."""
    p = g.p(i)
    by = _shown_by(g, i, shared)
    key = (
        (by if by is not None and _filled(p.get(by)) else None)
        or next((k for k in NAME_KEYS + WORDING_KEYS if _filled(p.get(k))), None)
        or next((k for k, v in p.items() if k != "id" and _readable(v)), None)
    )
    return (i, None) if key is None else (clip_shown(p[key]), key)
