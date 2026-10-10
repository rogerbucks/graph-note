"""§18 the flat projection: one block per node, rebuilt by the profile reader into the same
graph, and the canonical hash that proves it."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
from typing import TYPE_CHECKING, Any

from graphspec.reader.lexer import quote
from graphspec.rules.canonical_json import UTC, jcs
from graphspec.rules.plain_graph import World

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph


# ── §18 the flat projection ─────────────────────────────────────────────────────────────────────
# One block per node; rebuilt by the profile reader, it must give back the same graph.
# Instants are projected at UTC+10, with no summer time — as the JavaScript twin.
PROJECTION_TZ = dt.timezone(dt.timedelta(hours=10))


def _iso(v):
    if isinstance(v, dt.datetime):
        return (v if v.tzinfo else v.replace(tzinfo=UTC)).astimezone(PROJECTION_TZ).isoformat()
    return v.isoformat() if isinstance(v, dt.date) else v


def project(g: Graph) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """§18 the flat projection: one block per node — id, type, attributes, and a list of targets
    per relationship type without properties — and the relationships with properties, ordered by
    canonical text. Raises ValueError for a property the projection cannot hold."""
    blocks, rels = {}, []
    for i in sorted(g.nodes):
        labels, p = g.nodes[i]
        for k, v in p.items():
            if isinstance(v, list):
                raise ValueError(
                    f"refused: §18 — {i}.{k} is a list, "
                    "and a list in the flat projection means relationships"
                )
            if k == "type":
                raise ValueError(
                    f"refused: §18 — {i}.type is reserved: the flat projection uses type "
                    "for a node's labels; rename the property"
                )
        blocks[i] = {"id": i, "type": sorted(labels)} | {
            k: _iso(v) for k, v in sorted(p.items()) if k != "id" and v is not None
        }
    for s, t, d, p in g.edges:
        if p:
            rels.append(
                {"from": s, "relationship": t, "to": d}
                | {k: _iso(v) for k, v in sorted(p.items()) if v is not None}
            )
            continue
        blocks[s].setdefault(t.lower(), []).append(d)
    for b in blocks.values():
        for k, v in b.items():
            if isinstance(v, list) and k != "type":
                v.sort()
    return blocks, sorted(rels, key=jcs)  # by canonical text, so every language orders them alike


def _gql(v):
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str) and re.fullmatch(r"\d{4}-\d\d-\d\dT[\d:]+[+-]\d\d:\d\d", v):
        return f"DATETIME '{v}'"
    if isinstance(v, str) and re.fullmatch(r"\d{4}-\d\d-\d\d", v):
        return f"DATE '{v}'"
    return quote(str(v))


def rebuild(name: str, blocks: dict[str, dict[str, Any]], rels: list[dict[str, Any]]) -> str:
    """GQL from the projection alone — a profile data block."""
    keys = sorted(
        {k for b in blocks.values() for k, v in b.items() if isinstance(v, list) and k != "type"}
    )
    var = {i: f"n{k}" for k, i in enumerate(blocks)}
    lines = []
    for i, b in blocks.items():
        lines.append(
            f" ({var[i]}:{':'.join(b['type'])} {{"
            + ", ".join(
                f"{k}: {_gql(v)}"
                for k, v in b.items()
                if k != "type" and not (k in keys and isinstance(v, list))
            )
            + "})"
        )
    for i, b in blocks.items():
        for k in keys:
            for t in b[k] if isinstance(b.get(k), list) else []:
                lines.append(f" ({var[i]})-[:{k.upper()}]->({var[t]})")
    for e in rels:
        props = ", ".join(
            f"{k}: {_gql(v)}" for k, v in e.items() if k not in ("from", "relationship", "to")
        )
        lines.append(
            f" ({var[e['from']]})-[:{e['relationship']}"
            + (f" {{{props}}}" if props else "")
            + f"]->({var[e['to']]})"
        )
    return f"// graph: {name}\nINSERT\n" + ",\n".join(lines)


def projects_back(g: Graph, name: str) -> bool:
    """§18: whether the flat projection, held as text and rebuilt by the profile reader, gives back
    the same graph."""
    if not g.nodes and not g.edges:
        return True  # nothing to project
    from graphspec.reader.store import Store

    blocks, rels = project(g)
    blocks, rels = (
        json.loads(json.dumps(blocks)),
        json.loads(json.dumps(rels)),
    )  # through text, as a target system would hold it
    s = Store()
    s.apply(rebuild(name, blocks, rels))
    return canon(World.from_store(s)[name]) == canon(g)


def _cnorm(v):
    if isinstance(v, dt.datetime):
        return (v.astimezone(UTC) if v.tzinfo else v.replace(tzinfo=UTC)).isoformat()
    return v.isoformat() if isinstance(v, dt.date) else v


def canon(g: Graph) -> str:
    """sha-256 of the RFC 8785 JSON of the graph — nodes by id, relationships by their own
    canonical text. The same in every language."""
    body = sorted(
        [
            [sorted(labels), {k: _cnorm(v) for k, v in p.items() if v is not None}]
            for labels, p in g.nodes.values()
        ],
        key=lambda x: x[1]["id"],
    ) + sorted(
        [
            [s, t, d, {k: _cnorm(v) for k, v in p.items() if v is not None}]
            for s, t, d, p in g.edges
        ],
        key=jcs,
    )
    return hashlib.sha256(jcs(body).encode()).hexdigest()
