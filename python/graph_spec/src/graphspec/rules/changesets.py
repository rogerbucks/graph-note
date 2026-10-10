"""§24 change sets: a dry run on a copy of the base, with no database."""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Collection, Iterable
from typing import TYPE_CHECKING, Any

from graphspec.reader.whitespace import N, S
from graphspec.reader.whitespace import strip as ws_strip
from graphspec.rules.canonical_json import norm
from graphspec.rules.certainty import claim_status, confidence_from_evidence, latest_assessment
from graphspec.rules.graph_check import check
from graphspec.rules.plain_graph import World
from graphspec.rules.projection import canon
from graphspec.rules.schema_types import untyped

if TYPE_CHECKING:
    from graphspec.reader.store import Store


# ── §24 change sets — a dry run on a copy, no database ───────────────────────────────────────────
MODEL_MAY_ADD = {
    "Claim",
    "Assessment",
    "Evidence",
    "Proposal",
    "Option",
    "Activity",
    "Ref",
}  # §24 rule 2
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
    """A change set's first line read — '// graph: G · CHANGE SET <id> · against <state hash> · by
    <author id>' — as {graph, id, against, by}; None when it is not one."""
    first = next((line for line in block.split("\n") if ws_strip(line)), "")
    # whitespace as GQL names it (S), as the reader reads the header, never the language's \s
    m = re.match(
        rf"{S}*//{S}*graph:{S}*({N}+){S}*·{S}*CHANGE SET{S}+({N}+)"
        rf"{S}*·{S}*against{S}+([0-9a-f]{{16}}){S}*·{S}*by{S}+({N}+)",
        first,
    )
    return dict(zip(("graph", "id", "against", "by"), m.groups())) if m else None


def _state(g):
    return (
        {
            i: (labels, json.dumps({k: norm(v) for k, v in p.items()}, sort_keys=True))
            for i, (labels, p) in g.nodes.items()
        },
        [
            (s, t, d, json.dumps({k: norm(v) for k, v in p.items()}, sort_keys=True))
            for s, t, d, p in g.edges
        ],
    )


def refresh_section20(store: Store, name: str) -> list[tuple[str, str, Any, Any]]:
    """The §20 caches an engine re-makes when claims gain assessments, evidence or findings.
    Returns what changed."""
    g = World.from_store(store)[name]
    stored = store.graph(name)
    out = []
    key_of = {n["props"]["id"]: k for k, n in stored["nodes"].items()}
    for key, rule in (
        ("likelihood", latest_assessment(g)),
        ("confidence", confidence_from_evidence(g)),
        ("status", claim_status(g)),
    ):
        for c, v in rule.items():
            p = stored["nodes"][key_of[c]]["props"]
            if p.get(key) != v and not (key == "confidence" and p.get("rule")):
                out.append((c, key, p.get(key), v))
                p[key] = v
    return out


def check_changeset(
    base: Iterable[tuple[str, str]],
    block: str,
    matrix: dict[str, dict[str, str]] | None = None,
    lint: Callable[[str], list[dict[str, Any]]] | None = None,
    switches: Collection[str] = frozenset(),
) -> tuple[list[tuple[str, bool, str]], dict[str, Any] | None, str | None]:
    """A change set dry-run against its base — [(graph, text)] applied in order. Returns (results
    [(label, ok, fix)], header, the state it would produce)."""
    from graphspec.reader.lexer import ProfileError
    from graphspec.reader.store import Store
    from collections import Counter

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
    if lint:
        found = lint(block)
        add(
            "it passes the dialect linter (§24 H1)",
            not found,
            "; ".join(f"line {x['line']}: {x['trap']} → {x['fix']}" for x in found),
        )
    st = Store()
    for _, text in base:
        st.apply(text)
    if h["graph"] not in st.graphs:
        add(
            f"its graph {h['graph']} is one of the base's",
            False,
            f"the base holds {sorted(st.graphs)}",
        )
        return res, h, None
    w = World.from_store(st)
    now = canon(w[h["graph"]])[:16]
    add(
        "it was made against the graph as it stands",
        h["against"] == now,
        f"made against {h['against']}; the graph is now {now} — serve the graph again and redraft",
    )
    who = [w[g].nodes[h["by"]][0] for g in w.graphs if h["by"] in w[g].nodes]
    kind = (
        "Model"
        if any("Model" in labels for labels in who)
        else "Person"
        if any("Person" in labels for labels in who)
        else None
    )
    known = sorted(
        {
            i
            for g in w.graphs.values()
            for i, (labels, _) in g.nodes.items()
            if labels & {"Person", "Model"}
        }
    )
    add(
        f"its author {h['by']} is a known person or model",
        kind,
        f"'by' must be the author's own id, exactly — the graph knows {known}; "
        "a new author is declared by the graph's owner first",
    )
    before = _state(w[h["graph"]])
    try:
        st.apply(block)
    except ProfileError as e:
        add("it loads", False, f"the reader could not read it — {e}")
        return res, h, None
    after = _state(World.from_store(st)[h["graph"]])
    bc, ac = Counter(before[1]), Counter(after[1])
    gone = [i for i in before[0] if i not in after[0]] + [e[:3] for e in bc if ac[e] < bc[e]]
    changed = [i for i in before[0] if i in after[0] and before[0][i] != after[0][i]]
    if "additions-only" not in switches:
        add(
            "it only adds — nothing removed, nothing already there changed (§12)",
            not gone and not changed,
            f"removed {gone[:3]}, changed {changed[:3]} — "
            "correct a fact with a new element that supersedes it, never an edit",
        )
    new_nodes = {i: after[0][i][0] for i in after[0] if i not in before[0]}
    h["refreshes"] = refresh_section20(st, h["graph"])
    new_edges = [e for e in ac if ac[e] > bc[e]]
    w = World.from_store(st)
    g = w[h["graph"]]
    if kind == "Model" and "model-may-add" not in switches:
        bad = sorted(i for i, labels in new_nodes.items() if not labels & MODEL_MAY_ADD) + sorted(
            {e[1] for e in new_edges if e[1] not in MODEL_MAY_LINK}
        )
        add(
            "a model adds only claims, assessments, evidence, proposals and options (§24 rule 2)",
            not bad,
            f"{bad[:4]} — state it as a Claim about the subject, "
            "or as a Proposal for a person to decide; a model never asserts a fact or a decision",
        )
        by = [
            x for i in new_nodes if "Assessment" in new_nodes[i] for _, _, x, _ in g.out(i, "BY")
        ]
        add(
            "a model's assessments are its own",
            all(x == h["by"] for x in by),
            f"assessments made BY {sorted(set(by) - {h['by']})} — "
            "a model can assess only as itself",
        )
    ul, ut, ur = untyped(g)
    for label, ok, d in check(w, h["graph"], matrix):
        if label.startswith("§5") and not ok:
            d = (
                f"declare in {h['graph']}'s schema: node labels {ul}, edge types {ut}"
                + (f"; give both readings, forward and reverse, to {ur}" if ur else "")
                + " — a schema change is the graph owner's, not the change set's"
            )
        add(f"after it, {label}", ok, d or "see the rule in the graph spec model")
    return res, h, canon(g)[:16]
