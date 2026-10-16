"""§24 change sets: a dry run on a copy of the base, with no database."""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Collection, Iterable
from typing import TYPE_CHECKING, Any

from graphspec.reader.whitespace import N, S
from graphspec.reader.whitespace import strip as ws_strip
from graphspec.rules.canonical_json import norm
from graphspec.rules.change_apply import (
    GENERATED,
    LABELS,
    adds_cache,
    apply_change,
    foreign_generations,
    is_record_add,
    stop_fix,
)
from graphspec.rules.changes import read_all, split_changeset
from graphspec.rules.certainty import claim_status, confidence_from_evidence, latest_assessment
from graphspec.rules.graph_check import check
from graphspec.rules.plain_graph import World
from graphspec.rules.projection import canon
from graphspec.rules.schema_types import untyped

if TYPE_CHECKING:
    from graphspec.reader.store import Store


# ── §24 change sets — a dry run on a copy, no database ───────────────────────────────────────────


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

    block = block.replace("\r\n", "\n")  # a line ends at LF in the reader; CRLF text reads as LF
    h = changeset_header(block)
    add(
        "the change set names its graph, its id, the state it was made against, and its author",
        h,
        "start the block with: // graph: <graph> · CHANGE SET <id> · "
        "against <16-hex state hash> · by <author id>",
    )
    if not h:
        return res, None, None
    parts = split_changeset(block)
    if lint:
        found = lint(parts["additions"]) + [x for c in parts["changes"] for x in lint(c["text"])]
        add(
            "it passes the dialect linter (§24 H1)",
            not found,
            "; ".join(f"line {x['line']}: {x['trap']} → {x['fix']}" for x in found),
        )
    add(
        "only the header says what it was made against and who made it (§24)",
        parts["basis_ok"],
        "take the 'against' and 'by' out of every line but the header",
    )
    read, refused, h["changes"] = read_all(parts["changes"])
    add(
        "each DELETE and SET is its own statement and names exactly one target (§24)",
        not refused,
        "; ".join(refused),
    )
    if refused:
        return res, h, None
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

    def author_of(world):
        """An author is known if the graphs hold it, or the set itself declares it (§24)."""
        who = [world[g].nodes[h["by"]][0] for g in world.graphs if h["by"] in world[g].nodes]
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
                for g in world.graphs.values()
                for i, (labels, _) in g.nodes.items()
                if labels & {"Person", "Model"}
            }
        )
        return kind, known

    def add_author(kind, known):
        add(
            f"its author {h['by']} is a known person or model",
            kind,
            f"'by' must be the author's own id, exactly — the graph knows {known}; "
            "a new author is declared by the graph's owner or by the set itself",
        )

    kind, known = author_of(w)
    before = _state(w[h["graph"]])
    try:
        st.apply(parts["additions"])
    except ProfileError as e:
        add_author(kind, known)
        add("it loads", False, f"the reader could not read it — {e}")
        return res, h, None
    kind, known = author_of(World.from_store(st))
    add_author(kind, known)
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
    caches = [i for i in new_nodes if adds_cache(*after[0][i])]
    add(
        "it adds no cache — a claim's likelihood, confidence and status are the engine's "
        "(§24 rule 5)",
        not caches,
        f"{caches[:4]} — leave them out: the engine makes them from the claim's assessments",
    )
    if caches:
        return res, h, None
    foreign = foreign_generations(
        st, h["graph"], [e for e in ac if ac[e] > bc[e]], new_nodes, h["by"]
    )
    add(
        GENERATED,
        not foreign,
        f"{foreign[:2]} — a generation is added only for a new thing, under an activity "
        f"associated with {h['by']}; a cache is made by an engine run, never written",
    )
    if foreign:
        return res, h, None
    # a set that is not only additions is not applied further: its DELETEs and SETs would act on a
    # graph it has wrongly changed
    if read and (gone or changed) and "additions-only" not in switches:
        return res, h, None
    for c in read:
        stopped = apply_change(st, h["graph"], c)
        if stopped:
            add(LABELS[stopped[0]], False, stop_fix(*stopped, c))
            return res, h, None
    if read:
        for label in LABELS.values():
            add(label, True)
        h["changes"] = [
            {**x, **({"links": c["links"]} if "links" in c else {})}
            for x, c in zip(h["changes"], read)
        ]
    h["refreshes"] = refresh_section20(st, h["graph"])
    w = World.from_store(st)
    g = w[h["graph"]]
    if kind == "Model" and "model-may-add" not in switches:
        bad = sorted(i for i, labels in new_nodes.items() if is_record_add(labels))
        # what a delivery delivers is an issued document, a record
        bad += sorted(e[2] for e in ac if ac[e] > bc[e] and e[1] == "DELIVERED")
        add(
            "a model adds no record and no cache (§24 rule 5)",
            not bad,
            f"{bad[:4]} — state it as a Claim about the subject, or as a Proposal for a "
            "person to decide; a model never records an event, an issued document or a decision",
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
