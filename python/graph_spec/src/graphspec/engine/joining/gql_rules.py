"""Rules written in GQL (§6): a join's maps loaded into a graph, and a GQL rule run on it."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from graphspec.engine.optional_imports import grafeo

if TYPE_CHECKING:
    from grafeo import GrafeoDB


# ── rules written in GQL (§6: a rule is GQL text in the catalog) ─────────────────────────────
def structs_to_db(
    nodes: dict[str, dict[str, Any]], edges: dict[tuple[Any, ...], dict[str, Any]], g: str = "rule"
) -> GrafeoDB:
    """Load a join's node and edge maps into a fresh graph, so a GQL rule can read them."""

    def q(s):
        return "'" + str(s).replace("\\", "\\\\").replace("'", "\\'") + "'"

    def val(v):
        return (
            ("TRUE" if v else "FALSE")
            if isinstance(v, bool)
            else repr(v)
            if isinstance(v, (int, float))
            else f"DATE '{v.isoformat()}'"
            if isinstance(v, dt.date) and not isinstance(v, dt.datetime)
            else f"DATETIME '{v.isoformat()}'"
            if isinstance(v, dt.datetime)
            else q(v)
        )

    def body(props):
        return ", ".join(f"{k}: {val(v)}" for k, v in sorted(props.items()) if v is not None)

    var = {nid: f"n{i}" for i, nid in enumerate(sorted(nodes))}
    lines = [
        f" ({var[nid]}:{':'.join(sorted(n['labels'])) or 'Node'} {{{body(n['props'])}}})"
        for nid, n in sorted(nodes.items())
    ]
    lines += [
        f" ({var[k[0]]})-[:{k[1]} {{{body(p)}}}]->({var[k[2]]})"
        for k, p in edges.items()
        if k[0] in var and k[2] in var
    ]
    db = grafeo.GrafeoDB()
    db.execute(f"CREATE GRAPH {g}")
    db.set_graph(g)
    if lines:
        db.execute("INSERT\n" + ",\n".join(lines))
    return db


def gql_rule(
    text: str,
    C_ref: dict[str, Any],  # noqa: N803  # public signature
) -> Callable[
    [dict[str, dict[str, Any]], dict[tuple[Any, ...], dict[str, Any]]], list[dict[str, Any]]
]:
    """A rule written in GQL. Each row is one breach: `slots` — a list of [node, property] — and/or
    `edges` — a list of {from, type, to, ...identifying properties} maps — matched back to the
    join's relationships by their declared identity (§5)."""

    def fn(nodes, edges):
        db = structs_to_db(nodes, edges)
        out = []
        for row in db.execute(text):
            bes = []
            for e in row.get("edges") or []:
                # a map {from, type, to, <identifying properties>}: Grafeo drops nulls from list
                # literals (E10), and a map just omits the key
                f, ty, t = e["from"], e["type"], e["to"]
                want = tuple(e.get(a) for a in C_ref["edge_keys"].get(ty, ()))
                bes += [k for k in edges if k[:3] == (f, ty, t) and (not want or k[3] == want)]
            out.append(
                {
                    "slots": [tuple(s) for s in row.get("slots") or []],
                    "edges": sorted(set(bes), key=str),
                }
            )
        return out

    return fn
