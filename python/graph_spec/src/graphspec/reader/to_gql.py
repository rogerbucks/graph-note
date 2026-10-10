"""Writes a data block as standard GQL (§3): the shortcuts the profile allows put back, so an
engine is given only what it can read."""

from __future__ import annotations

import datetime as dt
import re

from graphspec.reader.grammar import Parser
from graphspec.reader.lexer import ProfileError, UTC, tokens
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


def _with_ids(block, names):
    """The block with id: written into each named new node, where it is written, and nothing else
    moved — or None when one cannot be found."""
    blanked = _blanked(block)
    edits = []
    for name in dict.fromkeys(names):
        written = re.finditer(
            rf"\({S}*{re.escape(name)}((?:{S}*:{S}*{NAME})*)({S}*)(\{{{S}*\}}|\{{|\))", blanked
        )
        # (name) alone names a node; it never writes one
        m = next((w for w in written if w.group(1) or w.group(3) != ")"), None)
        if not m:
            return None
        given = f"id: {_gql_value(name)}"
        if m.group(3) == ")":
            edits.append((m.end(1), m.end(1), f" {{{given}}}"))
        elif m.group(3) == "{":
            edits.append((m.end(3), m.end(3), given + ", "))
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
    for an id, the id: written on each new node and a MATCH added for each existing node named. A
    block naming no existing node keeps its lines and comments, with only INSERT added and each
    missing id: written into its node; one that names an existing node is rewritten whole,
    comments dropped. A block that cannot be read is returned as it is, so the engine reports
    it."""
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
    if matches is not None:
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
            n["var"]
            for ns, _ in paths
            for n in ns
            if (n["labels"] or n["props"]) and "id" not in n["props"]
        ]
        given = None if refs else _with_ids(block, unnamed)
        if given is not None:
            # each id: written where its node is, so every line and comment stays (10 Oct 2026)
            block, lines = given, given.split("\n")
        elif refs or unnamed:

            def node(n, new):
                props = ({"id": n["var"]} if new and "id" not in n["props"] else {}) | n["props"]
                body = ", ".join(f"{k}: {_gql_value(v)}" for k, v in props.items())
                labels = "".join(":" + label for label in n["labels"])
                return f"({n['var']}{labels}{' {' + body + '}' if body else ''})"

            def rel(r):
                body = ", ".join(f"{k}: {_gql_value(v)}" for k, v in r["props"].items())
                return f"-[:{r['type']}{' {' + body + '}' if r['props'] else ''}]->"

            def path(nodes, rels):
                return node(nodes[0], bool(nodes[0]["labels"] or nodes[0]["props"])) + "".join(
                    rel(r) + node(b, bool(b["labels"] or b["props"]))
                    for r, b in zip(rels, nodes[1:])
                )

            out = lines[:i]
            finds = [node(m, False) for m in matches] + [
                f"({v} {{id: {_gql_value(v)}}})" for v in refs
            ]
            if finds:
                out.append("MATCH " + ", ".join(finds))
            if paths:
                out += ["INSERT", ",\n".join(" " + path(*p) for p in paths)]
            if sets:
                out.append("SET " + ", ".join(f"{v}.{k} = {_gql_value(x)}" for v, k, x, _ in sets))
            return "\n".join(out)
    if not lstrip(lines[i]).startswith("("):
        return block
    return "\n".join(lines[:i] + ["INSERT"] + lines[i:])


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
