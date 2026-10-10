"""§24 H4 change sets: additions an AI proposes, dry-run through Grafeo before anyone
applies them."""

from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import Collection, Iterable
from typing import TYPE_CHECKING, Any

from graphspec.engine.certainty.caches import (
    claim_status,
    confidence_from_evidence,
    latest_assessment,
)
from graphspec.engine.certainty.checks import section20
from graphspec.engine.dialect_lint import lint
from graphspec.engine.judgements.basis import _norm
from graphspec.engine.judgements.checks import judgements_rules
from graphspec.engine.optional_imports import grafeo
from graphspec.engine.paths import paths_rules
from graphspec.engine.projection import projects_back
from graphspec.engine.queries import Q, canon_graph, read, strip
from graphspec.engine.schema import typed, untyped
from graphspec.engine.serving.checks import served_rules
from graphspec.reader.lexer import ProfileError, header
from graphspec.reader.store import Store

if TYPE_CHECKING:
    from grafeo import GrafeoDB


# ── §24 H4: change sets — additions an AI proposes, checked before anyone applies them ──────────
MODEL_MAY_ADD = {
    "Claim",
    "Assessment",
    "Evidence",
    "Proposal",
    "Option",
    "Activity",
    "Ref",
}  # §24 rule 2: claims, assessments, proposals
MODEL_MAY_LINK = {
    "ABOUT",
    "ASSESSES",
    "BY",
    "SUPPORTED_BY",
    "CONTRADICTED_BY",
    "FROM",
    "CONSIDERED",
    "WAS_GENERATED_BY",
    "ASSOCIATED_WITH",
    "CHALLENGED_BY",
    "USED",
    "RESTS_ON",
    "WAS_DERIVED_FROM",
}


def changeset_header(block: str) -> dict[str, str] | None:
    """'// graph: G · CHANGE SET <id> · against <state hash> · by <author id>' — the first line of
    a change set."""
    first = next((line for line in block.splitlines() if line.strip()), "")
    m = re.match(
        r"\s*//\s*graph:\s*(\S+)\s*·\s*CHANGE "
        r"SET\s+(\S+)\s*·\s*against\s+([0-9a-f]{16})\s*·\s*by\s+(\S+)",
        first,
    )
    return dict(zip(("graph", "id", "against", "by"), m.groups())) if m else None


def _state(db, g):
    node_rows, rel_rows = read(db, g)
    byk = {n["k"]: n["p"]["id"] for n in node_rows}
    nodes = {
        n["p"]["id"]: (
            frozenset(n["l"]),
            json.dumps({k: _norm(v) for k, v in n["p"].items()}, sort_keys=True),
        )
        for n in node_rows
    }
    edges = Counter(
        (
            byk[r["s"]],
            r["ty"],
            byk[r["t"]],
            json.dumps({k: _norm(v) for k, v in (r["p"] or {}).items()}, sort_keys=True),
        )
        for r in rel_rows
    )
    return nodes, edges


def refresh_section20(db: GrafeoDB) -> list[tuple[str, str, Any, Any]]:
    """The §20 caches an engine re-makes when claims gain assessments, evidence or findings —
    likelihood, confidence, status. Returns what changed."""
    stored = {
        r["c"]: r["p"] for r in Q(db, "MATCH (c:Claim) RETURN c.id AS c, properties(c) AS p")
    }
    out = []
    for key, rule in (
        ("likelihood", latest_assessment(db)),
        ("confidence", confidence_from_evidence(db)),
        ("status", claim_status(db)),
    ):
        for c, v in rule.items():
            if (
                c in stored
                and stored[c].get(key) != v
                and not (key == "confidence" and stored[c].get("rule"))
            ):
                db.execute(f"MATCH (c:Claim {{id: '{c}'}}) SET c.{key} = '{v}'")
                out.append((c, key, stored[c].get(key), v))
    return out


def graph_rules(db: GrafeoDB, g: str, graphs: Iterable[str]) -> list[tuple[str, bool, str]]:
    """The rules the suite runs on a graph, chosen by what the graph holds — for a change set's
    result."""
    db.set_graph(g)
    ul, ut, ur = untyped(db)
    out = [
        (
            "§5: every element has a declared type",
            typed(db),
            f"declare in {g}'s schema: node labels {ul}, edge types {ut}"
            + (f"; give both readings, forward and reverse, to {ur}" if ur else "")
            + " — a schema change is the graph owner's, not the change set's",
        ),
        ("§18: the flat projection rebuilds the graph", projects_back(db, g), ""),
    ]
    if Q(db, "MATCH (c:Claim) RETURN c LIMIT 1"):
        out += section20(db)
    if Q(db, "MATCH (p:Path) RETURN p LIMIT 1"):
        out += paths_rules(db)
    if Q(db, "MATCH (d) WHERE d:Decision OR d:Proposal RETURN d LIMIT 1"):
        out += judgements_rules(db, g, graphs) + served_rules(db, g)
    db.set_graph(g)
    return out


def check_changeset(
    base: Iterable[tuple[str, str]], block: str, switches: Collection[str] = frozenset()
) -> tuple[list[tuple[str, bool, str]], dict[str, Any] | None, str | None]:
    """A change set dry-run against its base — [(graph, text)] loaded in order. Writes nothing.
    Returns (results [(label, ok, fix)], header, the state hash it would produce). The base and
    the change set are each read with the reader before Grafeo is given them: one the reader
    refuses is a failed result in the reader's words, and Grafeo is given nothing of it; so is a
    base text whose first line names a graph other than the one its tuple gives."""
    res = []

    def add(label, ok, fix=""):
        res.append((label, bool(ok), "" if ok else fix))

    h = changeset_header(block)
    add(
        "the change set names its graph, its id, the state it was made against, and its author",
        h,
        "start the block with: // graph: <graph> · CHANGE SET <id> · "
        "against <16-hex state hash> · by <author id>",
    )
    if not h:
        return res, None, None
    found = lint(block)
    add(
        "it passes the dialect linter (§24 H1)",
        not found,
        "; ".join(f"line {x['line']}: {x['trap']} → {x['fix']}" for x in found),
    )
    # the reader reads the base, then the change set, each in its graph, before Grafeo is given
    # either; Grafeo is given nothing the reader refuses (req:3.engine-reads-first). Grafeo loads
    # a base text into the graph its tuple gives, the reader into the one its first line names, so
    # the two must be one graph
    st = Store()
    for g, text in base:
        try:
            named, _ = header(text)
            if named is not None and named != g:
                raise ProfileError(
                    1,
                    f"the block names graph {named}, but the base gives it as graph {g}",
                    f"give it as graph {named} — a block is loaded into the graph its first line "
                    "names (§3)",
                )
            st.apply(text)
        except ProfileError as e:
            add("its base loads", False, f"the reader could not read the base — {e}")
            return res, h, None
    db = grafeo.GrafeoDB()
    made = []
    for g, text in base:
        if g not in made:
            db.execute(f"CREATE GRAPH {g}")
            made.append(g)
        db.set_graph(g)
        db.execute(strip(text))
    if h["graph"] not in made:
        add(f"its graph {h['graph']} is one of the base's", False, f"the base holds {made}")
        return res, h, None
    now = canon_graph(db, h["graph"])[0][:16]
    add(
        "it was made against the graph as it stands",
        h["against"] == now,
        f"made against {h['against']}; the graph is now {now} — serve the graph again and redraft",
    )
    who = [
        (g, set(r["l"]))
        for g in made
        for r in (db.set_graph(g) or Q(db, f"MATCH (x {{id: '{h['by']}'}}) RETURN labels(x) AS l"))
    ]
    kind = (
        "Model"
        if any("Model" in label for _, label in who)
        else "Person"
        if any("Person" in label for _, label in who)
        else None
    )
    known = sorted(
        {
            r["i"]
            for g in made
            for r in (
                db.set_graph(g) or Q(db, "MATCH (x) WHERE x:Person OR x:Model RETURN x.id AS i")
            )
        }
    )
    add(
        f"its author {h['by']} is a known person or model",
        kind,
        f"'by' must be the author's own id, exactly — the graph knows {known}; "
        "a new author is declared by the graph's owner first",
    )
    db.set_graph(h["graph"])
    before = _state(db, h["graph"])
    try:
        st.apply(block)
    except ProfileError as e:
        add("it loads", False, f"the reader could not read it — {e}")
        return res, h, None
    try:
        db.execute(strip(block))
    except Exception as e:
        add("it loads", False, f"Grafeo could not run it — {str(e).splitlines()[0][:200]}")
        return res, h, None
    after = _state(db, h["graph"])
    gone = [i for i in before[0] if i not in after[0]] + [
        e[:3] for e in before[1] if after[1][e] < before[1][e]
    ]
    changed = [i for i in before[0] if i in after[0] and before[0][i] != after[0][i]]
    if "additions-only" not in switches:
        add(
            "it only adds — nothing removed, nothing already there changed (§12)",
            not gone and not changed,
            f"removed {gone[:3]}, changed {changed[:3]} — "
            "correct a fact with a new element that supersedes it, never an edit",
        )
    new_nodes = {i: after[0][i][0] for i in after[0] if i not in before[0]}
    db.set_graph(h["graph"])
    h["refreshes"] = refresh_section20(
        db
    )  # the engine's part of applying it — reported, so the applier knows (§11)
    new_edges = [e for e in after[1] if after[1][e] > before[1][e]]
    if kind == "Model" and "model-may-add" not in switches:
        bad = sorted(i for i, label in new_nodes.items() if not label & MODEL_MAY_ADD) + sorted(
            {e[1] for e in new_edges if e[1] not in MODEL_MAY_LINK}
        )
        add(
            "a model adds only claims, assessments, evidence, proposals and options (§24 rule 2)",
            not bad,
            f"{bad[:4]} — state it as a Claim about the subject, "
            "or as a Proposal for a person to decide; a model never asserts a fact or a decision",
        )
        db.set_graph(h["graph"])
        by = [
            r["x"]
            for i in new_nodes
            if "Assessment" in new_nodes[i]
            for r in Q(db, f"MATCH (:Assessment {{id: '{i}'}})-[:BY]->(x) RETURN x.id AS x")
        ]
        add(
            "a model's assessments are its own",
            all(x == h["by"] for x in by),
            f"assessments made BY {sorted(set(by) - {h['by']})} — "
            "a model can assess only as itself",
        )
    for label, ok, d in graph_rules(db, h["graph"], made):
        add(f"after it, {label}", ok, d or "see the rule in the graph spec model")
    return res, h, canon_graph(db, h["graph"])[0][:16]
