"""§21 the rules a graph must keep, found as breaches — cycles, cardinality, constraints and
determinism — and a document validated against them."""

from __future__ import annotations

from collections.abc import Collection, Iterable
from typing import Any

from graphspec.engine import guards


# ── rules that a graph must keep: found as breaches ────────────────────────
def cycles(
    edges: Collection[tuple[Any, ...]], types: Iterable[str]
) -> list[tuple[tuple[Any, ...], ...]]:
    """The cycles among the relationships of each type given — each cycle as its relationships,
    sorted."""
    found = []
    for ty in types:
        of_type = sorted((k for k in edges if k[1] == ty), key=str)
        for e in of_type:
            stack = [(e[2], [e])]
            while stack:
                node, path = stack.pop()
                if node == e[0]:
                    found.append(tuple(sorted(path, key=str)))
                    break
                for x in of_type:
                    if x[0] == node and x not in path and len(path) < len(of_type):
                        stack.append((x[2], path + [x]))
    return sorted(set(found), key=str)


def guard_holds(g: str, ctx: dict[str, Any]) -> Any:
    """Whether a transition's guard holds in a context, read as data and never run (§13)."""
    return guards.holds(g, ctx)


def breaches(
    nodes: dict[str, dict[str, Any]],
    edges: dict[tuple[Any, ...], dict[str, Any]],
    C: dict[str, Any],  # noqa: N803  # public signature
    checks: Collection[str],
) -> list[dict[str, Any]]:
    """The breaches of the configured rules in a graph, each once: cycles, too many of a
    relationship, constraints and nondeterministic transitions, as {kind, why, edges, slots}."""
    out = []
    if "cycles" in checks:
        out += [
            {"kind": "cycle", "why": "a cycle", "edges": list(c), "slots": []}
            for c in cycles(edges, C["acyclic"])
        ]
    if "cardinality" in checks:
        for (ty, side), rule in C["at_most_one"].items():
            g = {}
            for e in edges:
                if e[1] == ty:
                    g.setdefault(e[2] if side == "in" else e[0], []).append(e)
            out += [
                {"kind": "too-many", "why": rule, "edges": sorted(es, key=str), "slots": []}
                for a, es in sorted(g.items())
                if len(es) > 1
            ]
    if "constraints" in checks:
        for name, fn in C["constraints"].items():
            out += [
                {
                    "kind": "constraint",
                    "why": name,
                    "edges": b.get("edges", []),
                    "slots": b.get("slots", []),
                }
                for b in fn(nodes, edges)
            ]
    if (
        "determinism" in checks and C["contexts"]
    ):  # §7: for any state and event, at most one transition can fire
        by = {}
        for e, p in edges.items():
            if e[1] == "TRANSITION":
                by.setdefault((e[0], p.get("event")), []).append(e)
        for (s, ev), es in sorted(by.items(), key=str):
            for ctx in C["contexts"].get(ev, [{}]):
                plain = [
                    e
                    for e in es
                    if edges[e].get("guard") not in (None, "else")
                    and guard_holds(edges[e]["guard"], ctx)
                ] + [e for e in es if edges[e].get("guard") is None]
                en = plain or [e for e in es if edges[e].get("guard") == "else"]
                if len(en) > 1:
                    out.append(
                        {
                            "kind": "nondeterministic",
                            "why": f"two transitions can fire on {ev} {ctx or ''}".strip(),
                            "edges": sorted(en, key=str),
                            "slots": [],
                        }
                    )
    seen, uniq = set(), []
    for b in out:
        k = (b["kind"], tuple(b["edges"]), tuple(b["slots"]))
        if k not in seen:
            seen.add(k)
            uniq.append(b)
    return uniq


def validate(
    doc: dict[str, Any],
    log: list[tuple[Any, ...]],
    C: dict[str, Any],  # noqa: N803  # public signature
    checks: Collection[str] = ("cycles", "cardinality", "constraints", "determinism"),
) -> None:
    """A document must keep the rules on its own; what breaks them is excluded and reported, never
    joined."""
    for b in breaches(doc["nodes"], doc["edges"], C, checks):
        for e in b["edges"]:
            if e in doc["edges"]:
                del doc["edges"][e]
                log.append(
                    (
                        "invalid",
                        e[0],
                        e[1],
                        (
                            f"{e[0]} {e[1]} {e[2]} {' '.join(str(x) for x in e[3] if x)} "
                            f"({doc['id']})"
                        ).replace("  ", " "),
                        f"INVALID IN ONE DOCUMENT — {b['why']}; excluded",
                        "fix the source document",
                    )
                )
        for nid, k in b["slots"]:
            if k in doc["nodes"][nid]["props"]:
                v = doc["nodes"][nid]["props"].pop(k)
                log.append(
                    (
                        "invalid",
                        nid,
                        k,
                        f"{nid}.{k} = {v} ({doc['id']})",
                        f"INVALID IN ONE DOCUMENT — {b['why']}; excluded",
                        "fix the source document",
                    )
                )
