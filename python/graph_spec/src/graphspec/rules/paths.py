"""§22 paths and altitude on a plain graph: steps, views at an altitude, lifting, and the
path rules."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from graphspec.reader.limits import within_nesting

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph


# ── §22 paths ─────────────────────────────────────────────────────────────────────────────
def path_steps(g: Graph, pid: str) -> list[dict[str, Any]]:
    """A path's steps in order, as {seq, id, altitude, labels}; none when pid is not a path."""
    return [
        {
            "seq": p.get("seq"),
            "id": x,
            "altitude": g.p(x).get("altitude"),
            "labels": sorted(g.nodes[x][0]),
        }
        for _, _, x, p in sorted(g.out(pid, "STEP"), key=lambda e: e[3].get("seq") or 0)
        if g.has(pid, "Path")
    ]


def view_at(
    g: Graph, pid: str, level: int, _seen: set[str] | None = None, _depth: int = 0
) -> list[str]:
    """A path seen at an altitude: every step that is a path above that level opened; everything at
    or below kept. Paths opened deeper than the limit are refused (editor spec §51,
    spec_read_limits)."""
    within_nesting(_depth)
    seen = (_seen or set()) | {pid}
    out = []
    for r in path_steps(g, pid):
        if "Path" in r["labels"] and (r["altitude"] or 0) > level and r["id"] not in seen:
            out += view_at(g, r["id"], level, seen, _depth + 1)
        else:
            out.append(r["id"])
    return out


def below(g: Graph, top: str, depth: int = 8) -> set[str]:
    """Everything a path steps to, at any depth up to `depth` — what folds into it."""
    seen, frontier = set(), [top]
    for _ in range(depth):
        frontier = [x for f in frontier for _, _, x, _ in g.out(f, "STEP") if x not in seen]
        seen |= set(frontier)
        if not frontier:
            break
    return seen


def lift(g: Graph, xid: str, depth: int = 8) -> list[str]:
    """Every path above a fact or path, up to depth steps up, lowest altitude first."""
    ups, frontier = set(), [xid]
    for _ in range(depth):
        frontier = [
            s
            for f in frontier
            for s, _, _, _ in g.inc(f, "STEP")
            if g.has(s, "Path") and s not in ups
        ]
        ups |= set(frontier)
        if not frontier:
            break
    return [p for p in sorted(ups, key=lambda p: (g.p(p).get("altitude") or 0, p))]


def paths_rules(g: Graph) -> list[tuple[str, bool, str]]:
    """§22's rules on one graph. Returns [(label, ok, detail)]."""
    out = []
    paths = {p: g.p(p) for p in g.labelled("Path")}
    if not paths:
        return out
    bad = [
        {"a": s, "b": d}
        for s in paths
        for _, _, d, _ in g.out(s, "STEP")
        if g.has(d, "Path") and (g.p(d).get("altitude") or 0) >= (paths[s].get("altitude") or 0)
    ]
    out.append(
        (
            "§22 rule 1: altitude falls at every step into a path — no path contains itself",
            not bad,
            str(bad),
        )
    )
    bad = sorted(
        p
        for p in paths
        if sorted(e[3].get("seq") for e in g.out(p, "STEP"))
        != list(range(1, len(g.out(p, "STEP")) + 1))
    )
    out.append(("§22 rule 2: each path's steps are numbered 1 to n", not bad, str(bad)))
    bad = sorted(
        p
        for p in paths
        if not view_at(g, p, 0)
        or any({"Path", "Concept"} & set(g.nodes[x][0]) for x in view_at(g, p, 0) if x in g.nodes)
    )
    out.append(("§22 rule 3: every path grounds out in facts", not bad, str(bad)))
    bad = []
    for p, r in paths.items():
        o = r.get("ordered_by")
        if o:
            facts = [g.p(x)[o] for x in view_at(g, p, 0) if g.p(x).get(o) is not None]
            if any(a > b for a, b in zip(facts, facts[1:])):
                bad.append(p)
    out.append(("§22 rule 4: a path that declares an order keeps it", not bad, str(bad)))
    return out
