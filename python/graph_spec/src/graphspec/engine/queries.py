"""Grafeo access: a block made readable by Grafeo, a graph read out as rows, its canonical
hash, and the short names the checks query with."""

from __future__ import annotations

import datetime as dt
import hashlib
from typing import TYPE_CHECKING, Any

from graphspec.engine.optional_imports import grafeo
from graphspec.reader.store import Store
from graphspec.reader.to_gql import to_gql

if TYPE_CHECKING:
    from grafeo import GrafeoDB

UTC = dt.timezone.utc


def strip(s: str) -> str:
    """Comments out, and the data shortcut's INSERT put back (§3) — what Grafeo reads."""
    # a comment line is emptied, not dropped, so a line number still names the block's own line
    return to_gql(
        "\n".join("" if line.strip().startswith("//") else line for line in s.splitlines())
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
