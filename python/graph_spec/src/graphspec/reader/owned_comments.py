"""The comments an element owns (graph spec §26 notes, §27 tagged comments), as the JavaScript
reader's owned-comments.js reads them: a run of /// note lines and //@ key: value lines is owned
by the element on the line directly below it."""

from __future__ import annotations

import re
from typing import Any

from graphspec.reader.grammar import Parser
from graphspec.reader.lexer import header, tokens
from graphspec.reader.whitespace import lstrip, rstrip, strip

# §26: exactly three slashes, then a space or the line's end; §27: //@, a space, a key, its colon
# and the value. ASCII names, as JavaScript's pattern reads them
NOTE = re.compile(r"///(?: |$)")
TAG = re.compile(r"//@ ([A-Za-z_][A-Za-z0-9_.-]*):(.*)$", re.DOTALL)


def _elements_by_line(block: str) -> tuple[dict[int, dict[str, Any]], set[int]]:
    """The one element each line of code begins, for every line that begins exactly one: a thing
    as {"thing": its name} and a link as {"link": [from, type, to]}, by the names written; and the
    lines that begin more than one, none of them inside an element written above."""
    counts: dict[int, int] = {}
    first: dict[int, dict[str, Any]] = {}

    def add(line: int, element: dict[str, Any]) -> None:
        counts[line] = counts.get(line, 0) + 1
        first.setdefault(line, element)

    toks = tokens(block)
    if not toks:
        return {}, set()
    # a line that begins inside an element written above it — within its brackets — holds more
    # than one element
    inside: set[int] = set()
    depth = last = 0
    for kind, text, line, *_ in toks:
        if line != last and depth > 0:
            inside.add(line)
        last = line
        if kind == "p" and text in "([{":
            depth += 1
        elif kind == "p" and text in ")]}":
            depth -= 1
    _, paths, _ = Parser(toks).statement()
    for nodes, rels in paths:
        for n in nodes:
            if n["labels"] or n["props"]:
                add(n["line"], {"thing": n["var"]})
        for i, r in enumerate(rels):
            add(r["line"], {"link": [nodes[i]["var"], r["type"], nodes[i + 1]["var"]]})
    one = {line: e for line, e in first.items() if counts[line] == 1 and line not in inside}
    shared = {line for line, n in counts.items() if n > 1 and line not in inside}
    return one, shared


def scan_comments(block: str) -> dict[str, list[Any]]:
    """What owned_comments gives, each owned entry also with its /// lines' numbers ("lines"),
    and "shared": each line holding more than one element with a note's /// lines directly above
    it, as {"line", "lines"}. The notes (notes.py) read it."""
    out: dict[str, list[Any]] = {"owned": [], "unowned": [], "malformed": [], "shared": []}
    _, kind = header(block)
    if kind in ("query", "excerpt"):
        return out
    elements, shared = _elements_by_line(block)
    run: list[dict[str, Any]] = []

    def unowned() -> None:
        out["unowned"].extend(c["line"] for c in run)
        run.clear()

    # a line ends at LF only, as the reader ends it — never str.splitlines()
    for i, raw in enumerate(block.split("\n")):
        line, text = i + 1, lstrip(raw)
        # whitespace at a note line's end, a CR before its LF among it, is never its text (§3:
        # GQL's whitespace)
        if NOTE.match(rstrip(text)):
            run.append({"line": line, "note": rstrip(text)[4:]})
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
                    "lines": [c["line"] for c in run if "note" in c],
                }
            )
            run.clear()
        else:
            noted = [c["line"] for c in run if "note" in c]
            if noted and line in shared:
                out["shared"].append({"line": line, "lines": noted})
            unowned()
    unowned()
    return out


def owned_comments(block: str) -> dict[str, list[Any]]:
    """The notes and //@ lines a block's elements own (§26, §27): "owned", in line order, each
    with its element's line, the element, its tags as [key, value] in order, its note's lines (a
    bare /// is an empty line, a paragraph break) and its summary, the note's first paragraph;
    "unowned", the lines of each run with no one element directly below it; and "malformed",
    each //@ line with no key, read as an ordinary comment. A //@ line is never a note. Raises
    what the reader raises, its ProfileError; a query or an excerpt owns nothing."""
    out = scan_comments(block)
    return {
        "owned": [{k: v for k, v in o.items() if k != "lines"} for o in out["owned"]],
        "unowned": out["unowned"],
        "malformed": out["malformed"],
    }
