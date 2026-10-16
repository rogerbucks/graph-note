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
    known = {g, *graphs}

    def labels_of(r):
        """The labels of what a link goes to: the thing, or what its Ref resolves to (none when the
        Ref names no graph, or one that is not loaded)."""
        labels = set(r["l"])
        if "Ref" not in labels:
            return labels
        if not isinstance(r["graph"], str) or r["graph"] not in known:
            return set()
        return resolve_ref(db, g, {"ref": r["ref"], "graph": r["graph"]})[1]

    # HAD_PLAN is the only marker of a derivation; its target is the rule's own node (a Rule, whose
    # id names the engine function and version, §6), or a Ref that resolves to one
    plans = Q(
        db,
        "MATCH (a)-[:HAD_PLAN]->(t) RETURN a.id AS x, t.id AS t, labels(t) AS l, t.ref AS ref, t.graph AS graph",  # noqa: E501  # one literal: embedded_queries reads it whole
    )
    if plans:
        bad = [(r["x"], r["t"]) for r in plans if "Rule" not in labels_of(r)]
        db.set_graph(g)
        out.append((HAD_PLAN_LABEL, not bad, f"{bad[:4]} — a plan is a Rule, or a Ref to one"))
    rows = Q(
        db,
        "MATCH (x)-[:WAS_ATTRIBUTED_TO]->(t) RETURN x.id AS x, t.id AS t, labels(t) AS l, t.ref AS ref, t.graph AS graph",  # noqa: E501  # one literal: embedded_queries reads it whole
    )
    if rows:
        bad = [(r["x"], r["t"]) for r in rows if not is_agent(labels_of(r))]
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
