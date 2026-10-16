"""W3C PROV through Grafeo (graph spec §11, §12, §24): a derivation links to its rule with
HAD_PLAN, an attribution goes to an agent, a revision is generated after what it supersedes. The
same rules, labels and answers as graphspec.rules.provenance, asked of the database; each is given
only where the graph holds what it is about."""

from __future__ import annotations

from collections.abc import Iterable
from typing import TYPE_CHECKING

from graphspec.engine.judgements.basis import resolve_ref
from graphspec.engine.queries import Q
from graphspec.rules.provenance import (
    ATTRIBUTED_LABEL,
    HAD_PLAN_LABEL,
    REVISION_LABEL,
    is_agent,
    when,
)

if TYPE_CHECKING:
    from grafeo import GrafeoDB


def prov_rules(db: GrafeoDB, g: str, graphs: Iterable[str] = ()) -> list[tuple[str, bool, str]]:
    """The provenance rules that apply to graph `g`, as [(label, ok, detail)]; leaves db on `g`."""
    db.set_graph(g)
    out = []
    derives = {
        r["a"]: r["rule"]
        for r in Q(db, "MATCH (a:Activity) RETURN a.id AS a, a.rule AS rule")
        if isinstance(r["rule"], str) and r["rule"]
    }
    if derives:
        planned = set()
        for r in Q(
            db,
            "MATCH (a:Activity)-[:HAD_PLAN]->(p) RETURN a.id AS a, p.id AS id, p.rule AS rule, p.ref AS ref, labels(p) AS l",  # noqa: E501  # one literal: embedded_queries reads it whole
        ):
            rule = derives.get(r["a"])
            if rule is not None and (
                r["id"] == rule or r["rule"] == rule or ("Ref" in r["l"] and r["ref"] == rule)
            ):
                planned.add(r["a"])
        bad = sorted(set(derives) - planned)
        out.append((HAD_PLAN_LABEL, not bad, f"{bad} — link each to its rule with HAD_PLAN"))
    rows = Q(
        db,
        "MATCH (x)-[:WAS_ATTRIBUTED_TO]->(t) RETURN x.id AS x, t.id AS t, labels(t) AS l, t.ref AS ref, t.graph AS graph",  # noqa: E501  # one literal: embedded_queries reads it whole
    )
    if rows:
        bad = []
        for r in rows:
            labels = set(r["l"])
            if "Ref" in labels:
                labels = resolve_ref(db, g, {"ref": r["ref"], "graph": r["graph"]})[1]
            if not is_agent(labels):
                bad.append((r["x"], r["t"]))
        db.set_graph(g)
        out.append(
            (
                ATTRIBUTED_LABEL,
                not bad,
                f"{bad[:4]} — attribute to a Person, Organization or SoftwareAgent",
            )
        )
    pairs = [
        (r["s"], r["p"], when(r["ts"]), when(r["tp"]))
        for r in Q(
            db,
            "MATCH (s)-[:SUPERSEDES]->(p) RETURN s.id AS s, p.id AS p, s.generated_at AS ts, p.generated_at AS tp",  # noqa: E501  # one literal: embedded_queries reads it whole
        )
    ]
    pairs = [x for x in pairs if x[2] is not None and x[3] is not None]
    if pairs:
        bad = [(s, p) for s, p, ts, tp in pairs if ts < tp]
        out.append(
            (
                REVISION_LABEL,
                not bad,
                f"{bad[:4]} — a successor is generated after what it supersedes",
            )
        )
    return out
