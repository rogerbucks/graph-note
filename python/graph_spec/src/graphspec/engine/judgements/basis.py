"""§23 a judgement's basis through Grafeo: refs followed, pins, current decisions, and the
hashes that show an edit."""

from __future__ import annotations

import datetime as dt
import hashlib
from typing import TYPE_CHECKING, Any

from graphspec.engine.optional_imports import rfc8785
from graphspec.engine.queries import Q

if TYPE_CHECKING:
    from grafeo import GrafeoDB


# ── §23: judgements ───────────────────────────────────────────────────────────────────────────
# Decisions made from the detail, with their basis pinned, folded away until needed.
JUDGEMENT_EDGES = ("RESTS_ON", "ASSUMES", "UNDER")


def _norm(v):
    return v.isoformat() if isinstance(v, (dt.date, dt.datetime)) else v


def hash16(obj: object) -> str:
    """The first 16 hex digits of the SHA-256 of a value's RFC 8785 JSON."""
    return hashlib.sha256(rfc8785.dumps(obj)).hexdigest()[:16]


def basis_hash(props: dict[str, Any], reads: str) -> str:
    """rule:basis-hash@1 — the SHA-256 of the RFC 8785 JSON of only the properties a judgement
    read."""
    return hash16({k: _norm(props.get(k)) for k in (x.strip() for x in reads.split(","))})


def resolve_ref(
    db: GrafeoDB, home: str, ref: dict[str, Any]
) -> tuple[dict[str, Any] | None, set[str], bool]:
    """A Ref followed into the graph it names: (node properties or None, labels, superseded?).
    Leaves db on the home graph."""
    db.set_graph(ref["graph"])
    hit = Q(db, f"MATCH (x {{id: '{ref['ref']}'}}) RETURN properties(x) AS p, labels(x) AS l")
    sup = bool(hit) and bool(
        Q(db, f"MATCH (n)-[:SUPERSEDES]->(x {{id: '{ref['ref']}'}}) RETURN n.id AS n LIMIT 1")
    )
    db.set_graph(home)
    return (hit[0]["p"], set(hit[0]["l"]), sup) if hit else (None, set(), False)


def basis(db: GrafeoDB, jg: str, d: str) -> list[dict[str, Any]]:
    """Decision d's edges to Refs, as {ty, e (the edge's properties), ref, graph, rid} — read on
    the graph db is on."""
    return Q(
        db,
        f"MATCH (d:Decision {{id: '{d}'}})-[e]->(r:Ref) RETURN type(e) AS ty, properties(e) AS e, r.ref AS ref, r.graph AS graph, r.id AS rid",  # noqa: E501  # one literal: embedded_queries reads it whole
    )


def current_decisions(db: GrafeoDB, jg: str) -> list[str]:
    """The decisions in judgement graph jg that no later decision supersedes, sorted; leaves db on
    jg."""
    db.set_graph(jg)
    return sorted(
        r["d"]
        for r in Q(
            db,
            "MATCH (d:Decision) OPTIONAL MATCH (n:Decision)-[:SUPERSEDES]->(d) WITH d, count(n) AS k WHERE k = 0 RETURN d.id AS d",  # noqa: E501  # one literal: embedded_queries reads it whole
        )
    )


def judgement_hash(db: GrafeoDB, jg: str, d: str) -> str:
    """rule:judgement-hash@1 — a decision's own source properties and every edge it states, so an
    edited pin shows."""
    db.set_graph(jg)
    p = Q(db, f"MATCH (d:Decision {{id: '{d}'}}) RETURN properties(d) AS p")[0]["p"]
    from graphspec.rules.canonical_json import jcs

    out = sorted(
        [
            [r["ty"], r["t"], {k: _norm(v) for k, v in (r["e"] or {}).items()}]
            for r in Q(
                db,
                f"MATCH (d:Decision {{id: '{d}'}})-[e]->(t) RETURN type(e) AS ty, t.id AS t, properties(e) AS e",  # noqa: E501  # one literal: embedded_queries reads it whole
            )
        ],
        key=jcs,
    )
    return hash16(
        {
            "decision": {k: _norm(v) for k, v in p.items() if k not in ("content_hash", "review")},
            "edges": out,
        }
    )


def lens_bucket(db: GrafeoDB, home: str, graph: str, lens: str, nid: str) -> Any:
    """The bucket a node is in now, by the lens rule the graph itself holds (§15) — computed on
    demand. Leaves db on the home graph."""
    db.set_graph(graph)
    rule = Q(db, f"MATCH (z:Lens {{id: '{lens}'}}) RETURN z.rule_gql AS r")
    got = {r["id"]: r["grp"] for r in db.execute(rule[0]["r"])} if rule and rule[0]["r"] else {}
    db.set_graph(home)
    return got.get(nid)
