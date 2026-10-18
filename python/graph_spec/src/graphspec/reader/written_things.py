"""The things written in a block, found by their parentheses (editor spec §4): each with its name,
kinds and properties and where it is — the core's written-things.ts, function for function, so a
thing written without a name is found where the core finds it. Text inside strings and comments
is never read.

The core's regular expressions are mirrored exactly: whitespace is the reader's (whitespace.py),
\\w is ASCII, $ (with no m flag) is the end of the text, and a line ends only at a line feed.
Places are counted in code points here; name_gaps.py turns them into an editor's UTF-16 units."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from graphspec.reader.block_items import _items, blank_text
from graphspec.reader.whitespace import S as _S
from graphspec.reader.whitespace import SPACE

# whitespace as GQL names it (§3), as the graph reader reads a block, in both languages. And a
# line that ends only at a line feed
_W = "[A-Za-z0-9_]"
_NOT_BREAK = "[^\n]"

_NODE = re.compile(
    rf"({_S}*)([A-Za-z_]{_W}*)?{_S}*((?::{_S}*[A-Za-z_]{_W}*{_S}*)*)(\{{[^}}]*\}})?{_S}*"
)
_PROP = re.compile(
    rf"{_S}*([A-Za-z_]{_W}*){_S}*:{_S}*('(?:[^'\\]|\\{_NOT_BREAK})*'|[^,}}{SPACE}][^,}}]*)"
    rf"{_S}*(,|\Z)"
)
_ONLY_SPACE = re.compile(f"{_S}*")

# The properties that give a thing its text, in the order the drawing chooses among them.
TEXT_KEYS = ("name", "title", "text", "label")


@dataclass
class Written:
    """One thing as written in a block: where its ( and ) are, its name and where that is, its
    kinds, its string properties by key (None for one that is not a string), whether it writes a
    thing or only names one, whether it is in a MATCH, and whether its properties could not all
    be read."""

    open: int
    close: int
    variable: tuple[int, str] | None
    labels: list[str]
    props: dict[str, str | None] = field(default_factory=dict)
    writes: bool = False
    matched: bool = False
    broken: bool = False


def text_key_of(w: Written) -> str | None:
    """The key a thing's text is written under — the first of name, title, text and label that
    holds a string — if it has text."""
    return next((k for k in TEXT_KEYS if w.props.get(k)), None)


def _unquote(s: str) -> str:
    return re.sub(
        rf"\\({_NOT_BREAK})",
        lambda m: {"n": "\n", "t": "\t"}.get(m.group(1), m.group(1)),
        s[1:-1],
    )


def _parse(text: str, blanked: str, open_: int, close: int, matched: bool) -> Written | None:
    """One thing between its ( and its ), or None when it is not written the way a thing is."""
    inner = blanked[open_ + 1 : close]
    m = _NODE.fullmatch(inner)
    if not m:
        return None
    labels = re.findall(rf"[A-Za-z_]{_W}*", m.group(3) or "")
    props: dict[str, str | None] = {}
    broken = False
    if m.group(4):
        body = text[open_ + 1 + inner.index("{") + 1 : open_ + 1 + inner.rindex("}")]
        at = 0
        while not _ONLY_SPACE.fullmatch(body, at):
            p = _PROP.match(body, at)
            if not p or (not p.group(3) and not _ONLY_SPACE.fullmatch(body, p.end())):
                broken = True
                break
            at = p.end()
            value = p.group(2)
            props[p.group(1)] = _unquote(value) if value.startswith("'") else None
    variable = (open_ + 1 + len(m.group(1)), m.group(2)) if m.group(2) else None
    writes = bool(labels) or bool(m.group(4) and re.sub(f"[{{}}{SPACE}]", "", m.group(4)))
    return Written(open_, close, variable, labels, props, writes, matched, broken)


def written_in(text: str) -> list[Written]:
    """The things written in a block, in order, found in its items; the text inside strings and
    comments is never read."""
    blanked, out, matching = blank_text(text), [], False
    for start, end, _ in _items(text):
        word = re.match(r"[A-Za-z]+", blanked[start:end])
        if word and word.group(0).upper() == "MATCH":
            matching = True
        elif word and word.group(0).upper() in ("INSERT", "SET"):
            matching = False
        depth, i = 0, start
        while i < end:
            c = blanked[i]
            if c in "[{":
                depth += 1
            elif c in "]}":
                depth = max(0, depth - 1)
            elif c == "(" and depth == 0:
                close = blanked.find(")", i)
                if close == -1:
                    break
                w = _parse(text, blanked, i, close, matching)
                if w:
                    out.append(w)
                i = close
            i += 1
    return out
