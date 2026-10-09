"""§21 restating documents before they are compared — ids, units, time and vocabulary — and
the statements each makes."""

from __future__ import annotations

import re
from typing import Any


def ekey(
    f: Any,
    ty: str,
    t: Any,
    p: dict[str, Any],
    C: dict[str, Any],  # noqa: N803  # public signature
) -> tuple[Any, str, Any, tuple[Any, ...]]:
    """A relationship's key in a join: (from, type, to, the values of the properties that identify
    it)."""
    return (f, ty, t, tuple(p.get(a) for a in C["edge_keys"].get(ty, ())))


def normalise(
    doc: dict[str, Any],
    log: list[tuple[Any, ...]],
    C: dict[str, Any],  # noqa: N803  # public signature
    base: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Restate apparent differences before comparing. A value copied unchanged from the earlier
    version keeps that version's date."""
    for old, new in C["id_map"].items():
        if old in doc["nodes"]:
            n = doc["nodes"].pop(old)
            n["props"]["id"] = new
            doc["nodes"][new] = n
            log.append(
                (
                    "id",
                    old,
                    "id",
                    f"{old} → {new} ({doc['id']})",
                    "identity restated",
                    "a declared id map: one thing under two ids",
                )
            )
    doc["raw_edges"] = [
        (C["id_map"].get(f, f), ty, C["id_map"].get(t, t), p) for f, ty, t, p in doc["raw_edges"]
    ]
    for nid, n in doc["nodes"].items():
        for k, (k2, factor) in C["maps"].get(doc["schema"], {}).items():
            if k in n["props"]:
                v = n["props"].pop(k)
                n["props"][k2] = int(round(v * factor))
                log.append(
                    (
                        "unit",
                        nid,
                        k2,
                        f"{k} {v} → {k2} {n['props'][k2]} ({doc['id']})",
                        "unit restated",
                        "—",
                    )
                )
        for k, ty in C["time"].items():
            if k in n["props"]:
                v = n["props"].pop(k)
                as_of = (
                    base["as_of"]
                    if base and base.get("_raw", {}).get((nid, k)) == v
                    else doc["as_of"]
                )
                doc["raw_edges"].append((nid, ty, v, {"as_of": as_of}))
                log.append(
                    (
                        "time",
                        nid,
                        ty,
                        f"{k}: {v} → {ty} {v} as of {as_of} ({doc['id']})",
                        "restated over time",
                        "—",
                    )
                )
    for i, (f, ty, t, p) in enumerate(doc["raw_edges"]):
        for (mty, attr), m in C["value_maps"].items():
            if ty == mty and p.get(attr) in m:
                old = p[attr]
                p = {**p, attr: m[old]}
                doc["raw_edges"][i] = (f, ty, t, p)
                log.append(
                    (
                        "vocab",
                        f,
                        f"{ty} {attr}",
                        f"{attr} {old} → {m[old]} ({doc['id']})",
                        "restated — a declared vocabulary map",
                        "—",
                    )
                )
    doc["edges"] = {ekey(f, ty, t, p, C): p for f, ty, t, p in doc["raw_edges"]}
    return doc


def raw_props(doc: dict[str, Any]) -> dict[tuple[str, str], Any]:
    """Every property a document states, as {(node id, key): value}."""
    return {(nid, k): v for nid, n in doc["nodes"].items() for k, v in n["props"].items()}


def refines(a: Any, b: Any) -> bool:
    """ISO 8601-2: whether date a is more precise than date b and within it — '2018-06-12' refines
    '2018' and '2018~'."""

    def m(v):
        if isinstance(v, str) and re.fullmatch(r"\d{4}(-\d\d){0,2}[?~%]?", v):
            return v.rstrip("?~%")
        return None

    return (
        m(a) is not None and m(b) is not None and len(m(a)) > len(m(b)) and m(a).startswith(m(b))
    )


def compatible(a: Any, b: Any) -> bool:
    """Whether two values agree: equal, or one refining the other."""
    return a == b or refines(a, b) or refines(b, a)


def statements(
    nodes: dict[str, dict[str, Any]], edges: dict[tuple[Any, ...], dict[str, Any]]
) -> set[tuple[Any, ...]]:
    """Everything a graph says, one statement each: its labels, properties, relationships and their
    properties."""
    said = set()
    for nid, n in nodes.items():
        said |= {("label", nid, label) for label in n["labels"]} | {
            ("prop", nid, k, v) for k, v in n["props"].items() if k != "id"
        }
    for k, p in edges.items():
        said |= {("edge",) + k} | {("eprop",) + k + (a, v) for a, v in p.items()}
    return said


def doc_statements(d: dict[str, Any]) -> set[tuple[Any, ...]]:
    """Everything a document says, one statement each (statements)."""
    return statements(d["nodes"], d["edges"])
