"""§18 the flat projection through Grafeo: one block per node, GQL rebuilt from it, and the
proof that it rebuilds the same graph."""

from __future__ import annotations

import datetime as dt
import json
import re
from collections.abc import Collection, Iterable
from typing import TYPE_CHECKING, Any

from graphspec.engine.optional_imports import grafeo, yaml
from graphspec.engine.queries import UTC, canon_graph, for_grafeo, read
from graphspec.reader.lexer import quote

if TYPE_CHECKING:
    from grafeo import GrafeoDB


# instants are projected at UTC+10, with no summer time — as the JavaScript twin
PROJECTION_TZ = dt.timezone(dt.timedelta(hours=10))


# ── §18: the flat projection, one block per node ──
def iso(v: Any) -> Any:
    """A value as the flat projection writes it: an instant (kept as UTC) at UTC+10 in ISO 8601, a
    date in ISO 8601; anything else unchanged."""
    if isinstance(v, dt.datetime):
        return v.replace(tzinfo=UTC).astimezone(PROJECTION_TZ).isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    return v


def project(db: GrafeoDB, g: str) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """One flat block per node: id, type, attributes, then one list key per edge type with no
    attributes."""
    node_rows, rel_rows = read(db, g)
    byk = {n["k"]: n["p"]["id"] for n in node_rows}
    blocks, omitted = {}, []
    for n in sorted(node_rows, key=lambda n: n["p"]["id"]):
        b = {"id": n["p"]["id"], "type": sorted(n["l"])}
        for k, v in sorted(n["p"].items()):
            if isinstance(v, list):
                raise ValueError(
                    f"refused: §18 — {n['p']['id']}.{k} is a list, "
                    "and a list in the flat projection means relationships"
                )
        b.update({k: iso(v) for k, v in sorted(n["p"].items()) if k != "id" and v is not None})
        blocks[b["id"]] = b
    for r in rel_rows:
        if r["p"]:  # an edge with attributes becomes its own block
            omitted.append(
                {
                    "from": byk[r["s"]],
                    "relationship": r["ty"],
                    "to": byk[r["t"]],
                    **{k: iso(v) for k, v in sorted(r["p"].items()) if v is not None},
                }
            )
            continue
        key = r["ty"].lower()
        assert key not in blocks[byk[r["s"]]] or isinstance(blocks[byk[r["s"]]][key], list), (
            f"{key} clashes with an attribute"
        )
        blocks[byk[r["s"]]].setdefault(key, []).append(byk[r["t"]])
    for b in blocks.values():
        for k, v in b.items():
            if isinstance(v, list) and k != "type":
                v.sort()
    omitted.sort(key=lambda e: json.dumps(e, sort_keys=True))
    seen = {}
    rels = []
    for e in omitted:
        base = f"edge:{e['from']}/{e['relationship']}/{e['to']}"
        seen[base] = seen.get(base, 0) + 1
        rels.append(
            {
                "id": base
                + (
                    f"#{seen[base]}"
                    if sum(
                        1
                        for x in omitted
                        if f"edge:{x['from']}/{x['relationship']}/{x['to']}" == base
                    )
                    > 1
                    else ""
                ),
                "type": ["Relationship"],
                **e,
            }
        )
    return blocks, rels


def rebuild(
    blocks: dict[str, dict[str, Any]],
    edge_keys: Collection[str],
    rels: Iterable[dict[str, Any]] = (),
) -> str:
    """GQL from projections alone."""

    def q(s):
        return quote(str(s))  # as the reader writes it (req:3.gql-escapes)

    def val(v):
        if isinstance(v, bool):
            return "TRUE" if v else "FALSE"
        if isinstance(v, (int, float)):
            return repr(v)
        if isinstance(v, str) and re.fullmatch(r"\d{4}-\d\d-\d\dT[\d:]+[+-]\d\d:\d\d", v):
            return f"DATETIME '{v}'"
        if isinstance(v, str) and re.fullmatch(r"\d{4}-\d\d-\d\d", v):
            return f"DATE '{v}'"
        return q(v)

    var = {i: f"n{k}" for k, i in enumerate(blocks)}
    lines = []
    for i, b in blocks.items():
        props = ", ".join(
            f"{k}: {val(v)}"
            for k, v in b.items()
            if k != "type" and not (k in edge_keys and isinstance(v, list))
        )  # a list is relationships; anything else, even under an edge's name, is an attribute
        lines.append(f" ({var[i]}:{':'.join(b['type'])} {{{props}}})")
    for i, b in blocks.items():
        for k in edge_keys:
            for t in b[k] if isinstance(b.get(k), list) else []:
                lines.append(f" ({var[i]})-[:{k.upper()}]->({var[t]})")
    for e in rels:
        props = ", ".join(
            f"{k}: {val(v)}"
            for k, v in e.items()
            if k not in ("id", "type", "from", "relationship", "to")
        )
        lines.append(
            f" ({var[e['from']]})-[:{e['relationship']}"
            + (f" {{{props}}}" if props else "")
            + f"]->({var[e['to']]})"
        )
    return "INSERT\n" + ",\n".join(lines)


def projects_back(db: GrafeoDB, g: str = "joined") -> bool:
    """§18: whether graph g's flat projection, written as YAML, read back and rebuilt in a fresh
    database, gives back the same graph."""
    blocks, rels = project(db, g)
    # every character past ASCII written as a YAML escape. Written as itself, U+0085 is read back
    # as a line break, and so as a space
    text = yaml.safe_dump_all(
        list(blocks.values()) + rels,
        sort_keys=False,
        allow_unicode=False,
        default_flow_style=None,
        width=200,
    )
    back = [b for b in yaml.safe_load_all(text) if b]
    nb = {b["id"]: b for b in back if b["type"] != ["Relationship"]}
    rb = [b for b in back if b["type"] == ["Relationship"]]
    ek = sorted(
        {k for b in nb.values() for k, v in b.items() if isinstance(v, list) and k != "type"}
    )
    h = grafeo.GrafeoDB()
    h.execute(f"CREATE GRAPH {g}")
    h.set_graph(g)
    h.execute(for_grafeo(rebuild(nb, ek, rb)))
    return canon_graph(h, g)[0] == canon_graph(db, g)[0]


def canon(db: GrafeoDB, g: str = "joined") -> str:
    """Graph g's canonical hash, as canon_graph gives it, without the counts."""
    return canon_graph(db, g)[0]
