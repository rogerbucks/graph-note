"""Grafeo access: a block made readable by Grafeo, a graph read out as rows, its canonical
hash, and the short names the checks query with."""

from __future__ import annotations

import datetime as dt
import hashlib
import re
from typing import TYPE_CHECKING, Any

from graphspec.engine.optional_imports import grafeo
from graphspec.reader.store import Store
from graphspec.reader.to_gql import to_gql
from graphspec.reader.whitespace import is_space, lstrip, rstrip
from graphspec.reader.whitespace import strip as strip_ws

if TYPE_CHECKING:
    from grafeo import GrafeoDB

UTC = dt.timezone.utc


def _block_comment(line: str) -> str:
    """A whole-line // comment as the /* */ comment Grafeo reads (it reads no //), on the same
    line: its indentation and any whitespace after it kept, its text unchanged but for a space
    after the opening, and a */ inside it written * / (req:3.engine-keeps-comments).

    Safe because the reader refuses a comment after code on a line (§3), so a comment is always
    the whole line, and a comment's text can never be code. The line holds no LF, so the comment
    cannot run over a line. Grafeo reads /* inside a comment as text, not as a nested opening,
    and a space is put after /* so the text cannot make it /*/; the one thing in the text that
    could end the comment early is */, which is broken up, and the closing */ is written last,
    after a space, so a * at the end of the text cannot join it."""
    code = lstrip(line)
    indent = line[: len(line) - len(code)]
    text = rstrip(code[2:])
    after = code[len(rstrip(code)) :]
    if text and not is_space(text[0]):
        text = " " + text
    return f"{indent}/*{text.replace('*/', '* /')} */{after}"


# The escapes GQL names that Grafeo 0.5.43 does not read, each written as one it does: \` \b \f
# and \UXXXXXX (req:3.gql-escapes). \u it reads; a character past U+FFFF is written as itself.
_QUOTED = re.compile(r"'(?:[^'\\]|\\[^\n])*'")
_ESCAPE = re.compile(r"\\(U[0-9A-Fa-f]{6}|[^\n])")


def _grafeo_escape(m: re.Match) -> str:
    e = m.group(1)
    if e[0] == "U":
        cp = int(e[1:], 16)
        return f"\\u{cp:04X}" if cp <= 0xFFFF else chr(cp)
    return {"`": "`", "b": "\\u0008", "f": "\\u000C"}.get(e, m.group(0))


def _for_grafeo(line: str) -> str:
    """A line of code with each quoted text's escapes in forms Grafeo reads as GQL does."""
    return _QUOTED.sub(lambda q: _ESCAPE.sub(_grafeo_escape, q.group(0)), line)


def for_grafeo(text: str) -> str:
    """GQL the engine wrote itself, made ready for Grafeo: each quoted text's escapes in forms
    Grafeo reads as GQL does (req:3.gql-escapes)."""
    return "\n".join(_for_grafeo(line) for line in text.split("\n"))


def strip(s: str) -> str:
    """Comments given as /* */ comments, and the data shortcut's INSERT put back (§3) — what
    Grafeo reads. A line ends at LF only, as the reader ends it, never at U+2028 or the other
    breaks str.splitlines() takes; every line stays a line, so a line number still names the
    block's own line (req:3.engine-text-keeps-lines). Each escape Grafeo does not read is
    written as one it does (req:3.gql-escapes)."""
    # to_gql first: it finds the block's first line of code by the // that starts a comment
    return "\n".join(
        _block_comment(line) if strip_ws(line).startswith("//") else _for_grafeo(line)
        for line in to_gql(s).split("\n")
    )


def read(db: GrafeoDB, g: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Graph g's nodes and relationships as rows — nodes {k, l, p}, relationships {s, t, ty, p} —
    leaving db on graph g."""
    db.set_graph(g)
    node_rows = list(
        db.execute_cypher("MATCH (n) RETURN id(n) AS k, labels(n) AS l, properties(n) AS p")
    )
    rel_rows = list(
        db.execute_cypher(
            "MATCH (a)-[r]->(b) RETURN id(a) AS s, id(b) AS t, type(r) AS ty, properties(r) AS p"
        )
    )
    return node_rows, rel_rows


def canon_graph(db: GrafeoDB, g: str) -> tuple[str, int, int]:
    """Graph g's canonical hash — the SHA-256 of the RFC 8785 JSON of its nodes by id and its
    relationships by canonical text, the same as the profile reader's — with how many nodes and
    relationships it has."""
    node_rows, rel_rows = read(db, g)
    byk = {n["k"]: n["p"]["id"] for n in node_rows}

    def norm(p):
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

    # RFC 8785 throughout, so every language computes the same hash (portable checker P3)
    from graphspec.rules.canonical_json import jcs

    body = sorted(
        [[sorted(n["l"]), norm(n["p"])] for n in node_rows], key=lambda x: x[1]["id"]
    ) + sorted([[byk[r["s"]], r["ty"], byk[r["t"]], norm(r["p"])] for r in rel_rows], key=jcs)
    return hashlib.sha256(jcs(body).encode()).hexdigest(), len(node_rows), len(rel_rows)


# ── §7 and §16: the generic process engine ──
def _query_rows(db, q):
    return list(db.execute_cypher(q))


Q_ = _query_rows  # the short name the engine reads with


def load(text: str) -> GrafeoDB:
    """A joined graph's GQL loaded into a fresh Grafeo database, as graph 'joined'. The text is
    read with the reader first, in the graph its first line names: a text the reader refuses
    raises its ProfileError, and Grafeo is given nothing (req:3.engine-reads-first); Grafeo is
    given the reader's corrected text (req:3.engine-gets-corrected)."""
    st = Store()
    st.apply(text)
    db = grafeo.GrafeoDB()
    db.execute("CREATE GRAPH joined")
    db.set_graph("joined")
    db.execute(strip(st.corrected(text)))
    return db


Q = _query_rows  # the short name the checks read with
