"""§24 H4 change sets: additions an AI proposes, dry-run through Grafeo before anyone
applies them."""

from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import Collection, Iterable, Mapping
from typing import TYPE_CHECKING, Any

from graphspec.engine import settings
from graphspec.engine.certainty.caches import (
    claim_status,
    confidence_from_evidence,
    latest_assessment,
)
from graphspec.engine.certainty.checks import section20
from graphspec.engine.dialect_lint import lint
from graphspec.engine.documents.classification import destination_matrix
from graphspec.engine.judgements.basis import _norm
from graphspec.engine.judgements.checks import judgements_rules
from graphspec.engine.optional_imports import grafeo
from graphspec.engine.paths import paths_rules
from graphspec.engine.projection import projects_back
from graphspec.engine.queries import Q, canon_graph, read, strip
from graphspec.engine.schema import typed, untyped
from graphspec.engine.serving.checks import served_rules
from graphspec.reader.lexer import ProfileError, header, tokens
from graphspec.reader.store import Store
from graphspec.reader.whitespace import N, S
from graphspec.reader.whitespace import strip as ws_strip
from graphspec.rules.change_apply import (
    GENERATED,
    LABELS,
    adds_cache,
    apply_change,
    foreign_generations,
    gql_of,
    is_record_add,
    stop_fix,
)
from graphspec.rules.changes import read_all, split_changeset
from graphspec.rules.changesets import check_changeset as plain_check_changeset
from graphspec.rules.graph_check import check
from graphspec.rules.plain_graph import World

if TYPE_CHECKING:
    from grafeo import GrafeoDB


# ── §24 H4: change sets — additions an AI proposes, checked before anyone applies them ──────────


def changeset_header(block: str) -> dict[str, str] | None:
    """'// graph: G · CHANGE SET <id> · against <state hash> · by <author id>' — the first line of
    a change set."""
    first = next((line for line in block.split("\n") if ws_strip(line)), "")
    # whitespace as GQL names it (S), as the reader reads the header, never the language's \s
    m = re.match(
        rf"{S}*//{S}*graph:{S}*({N}+){S}*·{S}*CHANGE "
        rf"SET{S}+({N}+){S}*·{S}*against{S}+([0-9a-f]{{16}}){S}*·{S}*by{S}+({N}+)",
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


class _MatrixWhenAsked(Mapping):
    """The destination matrix, read from the classification note only when a rule asks for it —
    as the engine's served rules read it — so a graph with no servings needs no note."""

    def _m(self):
        return destination_matrix()

    def __getitem__(self, k):
        return self._m()[k]

    def __iter__(self):
        return iter(self._m())

    def __len__(self):
        return len(self._m())


def graph_rules(
    db: World | GrafeoDB, g: str, graphs: Iterable[str]
) -> list[tuple[str, bool, str]]:
    """The rules the suite runs on a graph, chosen by what the graph holds — for a change set's
    result. Given the reader's reading (a World), the plain rules (req:3.reader-default)."""
    if isinstance(db, World):
        return check(db, g, _MatrixWhenAsked())
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
    base text whose first line names a graph other than the one its tuple gives.

    Under the default parser the dry run is the reader's (req:3.reader-default): no engine, and
    never more lenient than Grafeo's — the reader may only refuse more, what is outside the
    profile (tests/test_reader_agrees_with_grafeo.py)."""
    if settings.PARSER == "profile":
        return plain_check_changeset(base, block, _MatrixWhenAsked(), lint, switches)
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
    additions = parts["additions"]
    found = lint(additions) + [x for c in parts["changes"] for x in lint(c["text"])]
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
    # the reader reads the base, then the change set, each in its graph, before Grafeo is given
    # either; Grafeo is given nothing the reader refuses (req:3.engine-reads-first), and what it
    # is given is the reader's corrected text (req:3.engine-gets-corrected). Grafeo loads
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
        db.execute(strip(st.corrected(text)))
    if h["graph"] not in made:
        add(f"its graph {h['graph']} is one of the base's", False, f"the base holds {made}")
        return res, h, None
    now = canon_graph(db, h["graph"])[0][:16]
    add(
        "it was made against the graph as it stands",
        h["against"] == now,
        f"made against {h['against']}; the graph is now {now} — serve the graph again and redraft",
    )

    def author_of():
        """An author is known if the graphs hold it, or the set itself declares it (§24)."""
        who = [
            (g, set(r["l"]))
            for g in made
            for r in (
                db.set_graph(g) or Q(db, f"MATCH (x {{id: '{h['by']}'}}) RETURN labels(x) AS l")
            )
        ]
        labels = set().union(*(label for _, label in who))
        kind = "Model" if "Model" in labels else "Person" if "Person" in labels else None
        known = sorted(
            {
                r["i"]
                for g in made
                for r in (
                    db.set_graph(g)
                    or Q(db, "MATCH (x) WHERE x:Person OR x:Model RETURN x.id AS i")
                )
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

    kind, known = author_of()
    db.set_graph(h["graph"])
    before = _state(db, h["graph"])
    try:
        st.apply(additions)
    except ProfileError as e:
        add_author(kind, known)
        add("it loads", False, f"the reader could not read it — {e}")
        return res, h, None
    try:
        if tokens(additions):  # a set of only DELETEs and SETs has nothing to insert
            db.execute(strip(st.corrected(additions)))
    except Exception as e:
        add_author(kind, known)
        add("it loads", False, f"Grafeo could not run it — {str(e).splitlines()[0][:200]}")
        return res, h, None
    kind, known = author_of()
    add_author(kind, known)
    db.set_graph(h["graph"])
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
        st,
        h["graph"],
        [e for e in after[1] if after[1][e] > before[1][e]],
        new_nodes,
        h["by"],
    )
    add(
        GENERATED,
        not foreign,
        f"{foreign[:2]} — a generation is added only for a new thing, under an activity "
        f"associated with {h['by']}; a cache is made by an engine run, never written",
    )
    if foreign:
        return res, h, None
    # a set that is not only additions is not applied further
    if read and (gone or changed) and "additions-only" not in switches:
        return res, h, None
    for c in read:
        # the reader's copy says what stops a change; Grafeo is then given the change as GQL
        stopped = apply_change(st, h["graph"], c)
        if stopped:
            add(LABELS[stopped[0]], False, stop_fix(*stopped, c))
            return res, h, None
        try:
            db.set_graph(h["graph"])
            db.execute(gql_of(c))
        except Exception as e:
            add("it loads", False, f"Grafeo could not run it — {str(e).splitlines()[0][:200]}")
            return res, h, None
    if read:
        for label in LABELS.values():
            add(label, True)
        h["changes"] = [
            {**x, **({"links": c["links"]} if "links" in c else {})}
            for x, c in zip(h["changes"], read)
        ]
    db.set_graph(h["graph"])
    h["refreshes"] = refresh_section20(
        db
    )  # the engine's part of applying it — reported, so the applier knows (§11)
    if kind == "Model" and "model-may-add" not in switches:
        bad = sorted(i for i, label in new_nodes.items() if is_record_add(label))
        # what a delivery delivers is an issued document, a record
        bad += sorted(e[2] for e in after[1] if after[1][e] > before[1][e] and e[1] == "DELIVERED")
        add(
            "a model adds no record and no cache (§24 rule 5)",
            not bad,
            f"{bad[:4]} — state it as a Claim about the subject, or as a Proposal for a "
            "person to decide; a model never records an event, an issued document or a decision",
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
