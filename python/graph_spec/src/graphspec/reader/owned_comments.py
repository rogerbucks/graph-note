"""The comments an element owns (graph spec §26 notes, §27 tagged comments), as the JavaScript
reader's owned-comments.js reads them: a run of /// note lines and //@ key: value lines is owned
by the element on the line directly below it."""

from __future__ import annotations

import re
from typing import Any

from graphspec.reader.grammar import Parser
from graphspec.reader.lexer import header, tokens
from graphspec.reader.whitespace import lstrip, strip

# §26: exactly three slashes, then a space or the line's end; §27: //@, a space, a key, its colon
# and the value. ASCII names, as JavaScript's pattern reads them
NOTE = re.compile(r"///(?: |$)")
TAG = re.compile(r"//@ ([A-Za-z_][A-Za-z0-9_.-]*):(.*)$", re.DOTALL)


def _elements_by_line(block: str) -> dict[int, dict[str, Any]]:
    """The one element each line of code begins, for every line that begins exactly one: a thing
    as {"thing": its name} and a link as {"link": [from, type, to]}, by the names written."""
    counts: dict[int, int] = {}
    first: dict[int, dict[str, Any]] = {}

    def add(line: int, element: dict[str, Any]) -> None:
        counts[line] = counts.get(line, 0) + 1
        first.setdefault(line, element)

    toks = tokens(block)
    if not toks:
        return {}
    _, paths, _ = Parser(toks).statement()
    for nodes, rels in paths:
        for n in nodes:
            if n["labels"] or n["props"]:
                add(n["line"], {"thing": n["var"]})
        for i, r in enumerate(rels):
            add(r["line"], {"link": [nodes[i]["var"], r["type"], nodes[i + 1]["var"]]})
    return {line: e for line, e in first.items() if counts[line] == 1}


def owned_comments(block: str) -> dict[str, list[Any]]:
    """The notes and //@ lines a block's elements own (§26, §27): "owned", in line order, each
    with its element's line, the element, its tags as [key, value] in order, its note's lines (a
    bare /// is an empty line, a paragraph break) and its summary, the note's first paragraph;
    "unowned", the lines of each run with no one element directly below it; and "malformed",
    each //@ line with no key, read as an ordinary comment. A //@ line is never a note. Raises
    what the reader raises, its ProfileError; a query or an excerpt owns nothing."""
    out: dict[str, list[Any]] = {"owned": [], "unowned": [], "malformed": []}
    _, kind = header(block)
    if kind in ("query", "excerpt"):
        return out
    elements = _elements_by_line(block)
    run: list[dict[str, Any]] = []

    def unowned() -> None:
        out["unowned"].extend(c["line"] for c in run)
        run.clear()

    # a line ends at LF only, as the reader ends it — never str.splitlines()
    for i, raw in enumerate(block.split("\n")):
        line, text = i + 1, lstrip(raw)
        if NOTE.match(text):
            run.append({"line": line, "note": text[4:]})
        elif text.startswith("//@"):
            m = TAG.match(text)
            if m:
                run.append({"line": line, "tag": [m.group(1), strip(m.group(2))]})
            else:
                out["malformed"].append(line)
                unowned()
        elif not strip(text) or text.startswith("//"):
            unowned()
        elif run and line in elements:
            note = [c["note"] for c in run if "note" in c]
            begun = [k for k, s in enumerate(note) if s != ""]
            summary = ""
            if begun:
                rest = note[begun[0] :]
                summary = "\n".join(rest[: rest.index("")] if "" in rest else rest)
            out["owned"].append(
                {
                    "line": line,
                    "element": elements[line],
                    "tags": [c["tag"] for c in run if "tag" in c],
                    "note": note,
                    "summary": summary,
                }
            )
            run.clear()
        else:
            unowned()
    unowned()
    return out
