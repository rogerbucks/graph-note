"""The names suggested for things written without one (editor spec §4), block by block, as the
core's name-gaps.ts suggests them: a thing given text and no name is drawn under the name
suggested from its text, read in from a copy of its block, never written to the note
(unnamed_drawn_suggested, 10 Oct 2026).

Only the half that drawing needs: the core also offers a text for a thing with a name and no
text, a hint that changes nothing drawn."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from graphspec.reader.name_suggestions import name_from_text
from graphspec.reader.written_things import Written, text_key_of, written_in
from graphspec.rules.views import SCHEMA_LABELS


def _kind_of(w: Written) -> str | None:
    return next((label for label in w.labels if label not in SCHEMA_LABELS), None)


def _u16(s: str) -> int:
    """A place on a line as an editor counts it: in UTF-16 units, an emoji being two."""
    return len(s.encode("utf-16-le")) // 2


def suggested_names(blocks: Sequence[tuple[str, str | None]]) -> list[list[dict[str, Any]]]:
    """For each block, given as (text, graph) — text '' for one that is not read — the names
    suggested for its things written with text and no name, in order: each {name, line,
    character, at}, line 0-based in the block, character the place after its ( on that line in
    UTF-16 units, and at that place in the text. A name follows the style of the names of its
    graph (every block of it), is none of them and no word the language keeps. Things in a MATCH,
    in a schema, only named again, with no text, or whose properties cannot be read are left
    alone, as the core leaves them."""
    written = [written_in(text) for text, _ in blocks]
    names: dict[str | None, dict[str, str]] = {}
    for (_, graph), things in zip(blocks, written):
        taken = names.setdefault(graph or "", {})
        for w in things:
            # a name only referred to is not taken: a link to the name a thing is drawn under
            # links to that thing
            if w.variable and w.writes:
                taken[w.variable[1]] = _kind_of(w) or ""
            if w.props.get("id"):
                taken[w.props["id"]] = ""
    out = []
    for (text, graph), things in zip(blocks, written):
        taken, named = names[graph or ""], []
        for w in things:
            if (
                w.matched
                or w.broken
                or not w.writes
                or any(lb in SCHEMA_LABELS for lb in w.labels)
            ):
                continue
            key = text_key_of(w)
            if w.variable or not key:
                continue
            kind = _kind_of(w)
            name = name_from_text(w.props[key] or "", taken, kind)
            taken[name] = kind or ""
            at = w.open + 1
            line_start = text.rfind("\n", 0, at) + 1
            named.append(
                {
                    "name": name,
                    "line": text.count("\n", 0, at),
                    "character": _u16(text[line_start:at]),
                    "at": at,
                }
            )
        out.append(named)
    return out


def with_names(text: str, named: Sequence[dict[str, Any]]) -> str:
    """A copy of the block with the suggested names in, to be read as if written; a ( no longer
    there takes none."""
    for n in reversed(named):
        at = n["at"]
        if text[at - 1 : at] == "(":
            text = text[:at] + n["name"] + text[at:]
    return text
