"""§22 paths and altitude through Grafeo: steps, views at an altitude, lifting, and the path
rules."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from graphspec.engine.queries import Q

if TYPE_CHECKING:
    from grafeo import GrafeoDB


# ── §22: paths and altitude — lift, zoom, view at an altitude, and the five rules ───────────────
def path_steps(db: GrafeoDB, pid: str) -> list[dict[str, Any]]:
    """A path's steps in order, as {seq, id, altitude, labels}."""
    return Q(
        db,
        f"MATCH (:Path {{id: '{pid}'}})-[s:STEP]->(x) RETURN s.seq AS seq, x.id AS id, x.altitude AS altitude, labels(x) AS labels ORDER BY s.seq",  # noqa: E501  # one literal: embedded_queries reads it whole
    )


def view_at(db: GrafeoDB, pid: str, level: int, _seen: set[str] | None = None) -> list[Any]:
    """A path seen at an altitude: every step that is a path above that level opened; everything at
    or below kept."""
    seen = (_seen or set()) | {pid}
    out = []
    for r in path_steps(db, pid):
        if "Path" in r["labels"] and (r["altitude"] or 0) > level and r["id"] not in seen:
            out += view_at(db, r["id"], level, seen)
        else:
            out.append(r["id"])
    return out


def lift(db: GrafeoDB, xid: str, depth: int = 8) -> list[Any]:
    """Every path above a fact or path, nearest first — one quantified GQL path query."""
    return [
        r["p"]
        for r in db.execute(
            f"MATCH (top:Path)-[:STEP]->{{1,{depth}}}(x {{id: '{xid}'}}) RETURN DISTINCT top.id AS p, top.altitude AS a ORDER BY a"  # noqa: E501  # one literal: embedded_queries reads it whole
        )
    ]


def paths_rules(db: GrafeoDB) -> list[tuple[str, bool, str]]:
    """§22's rules on one graph. Returns [(label, ok, detail)]."""
    out = []
    paths = {
        r["p"]: r
        for r in Q(db, "MATCH (p:Path) RETURN p.id AS p, p.altitude AS a, p.ordered_by AS o")
    }
    if not paths:
        return out
    bad = Q(
        db,
        "MATCH (a:Path)-[:STEP]->(b:Path) WHERE b.altitude >= a.altitude RETURN a.id AS a, b.id AS b",  # noqa: E501  # one literal: embedded_queries reads it whole
    )
    out.append(
        (
            "§22 rule 1: altitude falls at every step into a path — no path contains itself",
            not bad,
            str(bad),
        )
    )
    seqs = {}
    for r in Q(db, "MATCH (p:Path)-[s:STEP]->() RETURN p.id AS p, s.seq AS s"):
        seqs.setdefault(r["p"], []).append(r["s"])
    bad = sorted(
        p for p in paths if sorted(seqs.get(p, [])) != list(range(1, len(seqs.get(p, [])) + 1))
    )
    out.append(("§22 rule 2: each path's steps are numbered 1 to n", not bad, str(bad)))
    kinds = {r["id"]: r["l"] for r in Q(db, "MATCH (x) RETURN x.id AS id, labels(x) AS l")}
    bad = sorted(
        p
        for p in paths
        if not view_at(db, p, 0)
        or any({"Path", "Concept"} & set(kinds.get(x, [])) for x in view_at(db, p, 0))
    )
    out.append(("§22 rule 3: every path grounds out in facts", not bad, str(bad)))
    bad = []
    for p, r in paths.items():
        if r["o"]:
            vals = {
                x["id"]: x["v"]
                for x in Q(
                    db,
                    f"MATCH (x) WHERE x.{r['o']} IS NOT NULL RETURN x.id AS id, x.{r['o']} AS v",
                )
            }
            facts = [vals[x] for x in view_at(db, p, 0) if x in vals]
            if any(a > b for a, b in zip(facts, facts[1:])):
                bad.append(p)
    out.append(("§22 rule 4: a path that declares an order keeps it", not bad, str(bad)))
    return out
