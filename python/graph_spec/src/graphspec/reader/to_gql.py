"""Writes a data block as standard GQL (§3): the shortcuts the profile allows put back, so an
engine is given only what it can read."""

from __future__ import annotations

import datetime as dt
import re

from graphspec.reader.grammar import Parser
from graphspec.reader.lexer import ProfileError, UTC, tokens
from graphspec.reader.owned_comments import NOTE, TAG
from graphspec.reader.whitespace import S, lstrip, strip

# a name as the lexer reads one: ASCII, as JavaScript's \w is
NAME = "[A-Za-z_][A-Za-z0-9_]*"
BARE = re.compile(rf"-\[{S}*({NAME})(?={S}*[\]{{])")


def _blanked(block):
    """The block with its strings and comments blanked to spaces, every offset kept, so words in
    them are never taken for names."""
    return re.sub(
        r"//[^\n]*",
        lambda m: " " * len(m.group()),
        re.sub(r"'(?:[^'\\\n]|\\.)*'?", lambda m: " " * len(m.group()), block),
    )


def _refuse_repeats(matches, paths):
    """Raises what the reader raises (Store.apply) for a variable written for two nodes, or an id
    given to two (req:3.id-once): an engine is never given a key twice, nor two nodes one id."""
    bound = {m["var"] for m in matches}
    ids = {m["props"]["id"] for m in matches if "id" in m["props"]}
    for ns, _ in paths:
        for n in ns:
            if not (n["labels"] or n["props"]):
                continue
            if n["var"] in bound:
                raise ProfileError(
                    n["line"],
                    f"{n['var']} is written twice",
                    "give each new node its own variable",
                )
            bound.add(n["var"])
            given = n["props"].get("id", n["var"])
            if given in ids:
                raise ProfileError(
                    n["line"],
                    f"id {given!r} is already a node",
                    "an id names one node (§10) — MATCH it to add to it, or supersede it (§12)",
                )
            ids.add(given)


def _with_ids(block, nodes):
    """The block with id: written into each of these new nodes, as the parser read them, where it
    is written, and nothing else moved."""
    blanked = _blanked(block)
    edits = []
    for name, line in dict.fromkeys((n["var"], n["line"]) for n in nodes):
        written = re.finditer(
            rf"\({S}*{re.escape(name)}((?:{S}*:{S}*{NAME})*)({S}*)(\{{{S}*\}}|\{{|\))", blanked
        )
        # (name) alone names a node; it never writes one
        m = next((w for w in written if w.group(1) or w.group(3) != ")"), None)
        if not m:
            # the parser read it, so this is a fault here, never in the block: said, not hidden
            raise ProfileError(
                line, f"cannot find where {name} is written", "write it as (name:Kind {…})"
            )
        given = f"id: {_gql_value(name)}"
        if m.group(3) == ")":
            edits.append((m.end(1), m.end(1), f" {{{given}}}"))
        elif m.group(3) == "{":
            # before a line break the id: ends at its comma, so no space is left at a line's end
            at_break = block[m.end(3) : m.end(3) + 1] in ("\n", "\r")
            edits.append((m.end(3), m.end(3), given + ("," if at_break else ", ")))
        else:
            edits.append((m.start(3), m.end(3), "{" + given + "}"))
    for start, end, text in sorted(edits, reverse=True):
        block = block[:start] + text + block[end:]
    return block


def _bare_names(block):
    """Each link type written without its colon, in text order: (line, offset in the block, name).
    Strings and comments are blanked first, so words in them are never taken for one."""
    blanked = _blanked(block)
    return [
        (blanked.count("\n", 0, m.start(1)) + 1, m.start(1), m.group(1))
        for m in BARE.finditer(blanked)
    ]


def _bare(block):
    """The line and name of the first relationship type written without its colon, if any."""
    found = _bare_names(block)
    return (found[0][0], found[0][2]) if found else None


def to_gql(block: str) -> str:
    """A block as standard GQL (§3): the data shortcut's INSERT put back and, where a name stands
    for an id, the id: written into each new node and one MATCH line added for the existing nodes
    named, both above the notes and //@ lines the first line of code owns (§26, §27). Every
    other line and comment is kept as written. A block that writes a variable or an id twice is
    refused with the reader's own error, so no key is ever written twice. It sees
    one block only, and returns one it cannot read as it is: the gate is the reader, which every
    route to an engine runs first, on the block in its graph (req:3.engine-reads-first), so a
    repeat across blocks, or a block the reader cannot read, never reaches the engine."""
    lines = block.split("\n")
    i = next(
        (k for k, line in enumerate(lines) if strip(line) and not strip(line).startswith("//")),
        None,
    )
    if i is None:
        return block
    bare = _bare(block)
    if bare:
        # no engine is given a block that still holds a bare type (req:3.engine-gets-corrected)
        line, written = bare
        raise ProfileError(
            line,
            f"[{written}] has no colon",
            "an engine is given only corrected text — read the block with its graph and load "
            f"Store.corrected(block), or write it with its colon: [:{written.upper()}]",
        )
    try:
        matches, paths, sets = Parser(tokens(block)).statement()
    except ProfileError:
        matches = paths = sets = None
    added = []
    if matches is not None:
        _refuse_repeats(matches, paths)
        matched = {m["var"] for m in matches}
        written = {n["var"] for ns, _ in paths for n in ns if n["labels"] or n["props"]}
        refs = list(
            dict.fromkeys(
                [
                    n["var"]
                    for ns, _ in paths
                    for n in ns
                    if not (n["labels"] or n["props"]) and n["var"] not in matched | written
                ]
                + [v for v, *_ in sets if v not in matched | written]
            )
        )
        unnamed = [
            n
            for ns, _ in paths
            for n in ns
            if (n["labels"] or n["props"]) and "id" not in n["props"]
        ]
        # each id: written where its node is, and one MATCH line for the existing nodes named, so
        # every line and comment stays (10 Oct 2026); Grafeo reads a second MATCH line as one MATCH
        block = _with_ids(block, unnamed)
        lines = block.split("\n")
        if refs:
            added.append("MATCH " + ", ".join(f"({v} {{id: {_gql_value(v)}}})" for v in refs))
    if lstrip(lines[i]).startswith("("):
        added.append("INSERT")
    # above the notes and //@ lines the first line of code owns, so they stay its own (§26, §27)
    at = i
    while at and (NOTE.match(strip(lines[at - 1])) or TAG.match(lstrip(lines[at - 1]))):
        at -= 1
    return "\n".join(lines[:at] + added + lines[at:])


def _gql_value(v):
    """A profile value written back as GQL — the inverse of Parser.value."""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, dt.datetime):
        return f"DATETIME '{v.replace(tzinfo=UTC).isoformat()}'"
    if isinstance(v, dt.date):
        return f"DATE '{v.isoformat()}'"
    return (
        "'"
        + str(v)
        .replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\n", "\\n")
        .replace("\t", "\\t")
        + "'"
    )
