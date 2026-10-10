"""§24 H2 the hash and id filler: computed values come from recipes in the document, never
typed."""

from __future__ import annotations

import base64
import hashlib
import os
import re
from typing import Any

from graphspec.engine.documents.reading import graph_name, require_graph_line
from graphspec.engine.judgements.basis import basis_hash, judgement_hash
from graphspec.engine.optional_imports import grafeo, yaml
from graphspec.engine.queries import Q, canon_graph, strip
from graphspec.engine import settings
from graphspec.reader.canonical_hash import canon as plain_canon
from graphspec.reader.store import Store
from graphspec.rules.canonical_json import basis_hash as plain_basis_hash
from graphspec.rules.judgements import judgement_hash as plain_judgement_hash
from graphspec.rules.plain_graph import World


# ── §24 H2: the hash and id filler ────────────────────────────────────────────────────────────
# Computed values come from recipes in the document, never typed.
FILL_BLOCK = re.compile(r"(```yaml\n# fill[^\n]*\n)(.*?)(\n```)", re.S)


def ni_uri(data: bytes) -> str:
    """RFC 6920 named-information id of some bytes — ni:///sha-256;<base64url, no padding>."""
    return "ni:///sha-256;" + base64.urlsafe_b64encode(
        hashlib.sha256(data).digest()
    ).decode().rstrip("=")


def fill_recipes(text: str) -> dict[str, dict[str, Any]]:
    """The recipes in a document's # fill block, by placeholder name, each recorded value kept as
    text; none when it has no such block."""
    m = FILL_BLOCK.search(text)
    rs = (yaml.safe_load(m.group(2)) or {}) if m else {}
    for r in rs.values():
        if r.get("value") is not None:
            r["value"] = str(r["value"])  # a value of digits only must stay text
    return rs


def _block_of(text, ref, std_dir):
    """'#Heading' is a block of this document; 'Name#Heading' or 'Name' one of another document in
    std_dir."""
    name, _, heading = ref.partition("#")
    t = text if not name else open(os.path.join(std_dir, name + ".md"), encoding="utf-8").read()
    if heading:
        t = t[t.index("## " + heading) :]
    return re.search(r"```gql\n(.*?)\n```", t, re.S).group(1)


def _compute_plain(recipe: dict[str, Any], st: Store) -> str:
    """A recipe's value from the reader's reading of its blocks — what compute gives through
    Grafeo, with no engine (req:24.fill-reads-plain)."""

    w = World.from_store(st)
    if "basis" in recipe:
        g = w.graphs.get(recipe["graph"])
        if g is None or recipe["basis"] not in g.nodes:
            raise ValueError(
                f"refused: {recipe['basis']} is not in graph {recipe['graph']} after loading "
                f"{recipe['load']}"
            )
        return plain_basis_hash(g.p(recipe["basis"]), recipe["reads"])
    if "judgement" in recipe:
        return plain_judgement_hash(w, recipe["graph"], recipe["judgement"])
    if "state_of" in recipe:
        return plain_canon(st, recipe["state_of"])[0][:16]  # what a change set is made against
    raise ValueError(
        f"refused: a recipe must name basis, judgement, state_of or ni — got {sorted(recipe)}"
    )


def compute(recipe: dict[str, Any], text: str, std_dir: str, vault_dir: str) -> str:
    """One recipe's value: basis (rule:basis-hash@1), judgement (rule:judgement-hash@1) or ni
    (RFC 6920). The recipe's blocks are read together with the reader first, each in its graph:
    one the reader refuses raises its ProfileError, and Grafeo is given none of them
    (req:3.engine-reads-first); Grafeo is given each block as the reader corrected it
    (req:3.engine-gets-corrected)."""
    if "ni" in recipe:
        return ni_uri(open(os.path.join(vault_dir, recipe["ni"]), "rb").read())
    blocks = [require_graph_line(_block_of(text, ref, std_dir), ref) for ref in recipe["load"]]
    st = Store()
    for block in blocks:
        st.apply(block)
    if settings.PARSER == "profile":  # the reader's reading, no engine (req:24.fill-reads-plain)
        return _compute_plain(recipe, st)
    db = grafeo.GrafeoDB()
    made = set()
    for block in blocks:
        g = graph_name(block)
        if g not in made:
            db.execute(f"CREATE GRAPH {g}")
            made.add(g)
        db.set_graph(g)
        db.execute(strip(st.corrected(block)))
    db.set_graph(recipe.get("graph") or recipe.get("state_of"))
    if "basis" in recipe:
        hit = Q(db, f"MATCH (x {{id: '{recipe['basis']}'}}) RETURN properties(x) AS p")
        if not hit:
            raise ValueError(
                f"refused: {recipe['basis']} is not in graph {recipe['graph']} after loading "
                f"{recipe['load']}"
            )
        return basis_hash(hit[0]["p"], recipe["reads"])
    if "judgement" in recipe:
        return judgement_hash(db, recipe["graph"], recipe["judgement"])
    if "state_of" in recipe:
        return canon_graph(db, recipe["state_of"])[0][
            :16
        ]  # a graph's whole state — what a change set is made against (§24 H4)
    raise ValueError(
        f"refused: a recipe must name basis, judgement, state_of or ni — got {sorted(recipe)}"
    )


def fill(text: str, std_dir: str, vault_dir: str) -> tuple[str, dict[str, str]]:
    """Every {{NAME}} placeholder replaced by its recipe's value, in recipe order; each value
    recorded in its recipe."""
    recipes = fill_recipes(text)
    body = FILL_BLOCK.sub("", text)
    unknown = sorted(set(re.findall(r"\{\{([A-Z][A-Z0-9_]*)\}\}", body)) - set(recipes))
    if unknown:
        raise ValueError(
            f"refused: placeholders with no recipe — {unknown}; "
            "add a recipe to the document's # fill block"
        )
    for name, r in recipes.items():
        r["value"] = compute(
            {k: v for k, v in r.items() if k not in ("value", "uses")}, text, std_dir, vault_dir
        )
        r["uses"] = FILL_BLOCK.sub("", text).count(
            "{{" + name + "}}"
        )  # how many places it fills — an edit to any one of them shows
        text = text.replace("{{" + name + "}}", r["value"])
    lines = "\n".join(
        f"{n}: "
        + yaml.safe_dump(
            r, default_flow_style=True, sort_keys=False, allow_unicode=True, width=1000
        ).strip()
        for n, r in recipes.items()
    )
    return FILL_BLOCK.sub(lambda m: m.group(1) + lines + m.group(3), text, count=1), {
        n: r["value"] for n, r in recipes.items()
    }


def unfill(text: str) -> str:
    """Every recorded value put back as its placeholder, outside the recipe block — so a document
    can be refilled whole."""
    m = FILL_BLOCK.search(text)
    if not m:
        return text
    head, block, tail = text[: m.start()], text[m.start() : m.end()], text[m.end() :]
    for n, r in fill_recipes(text).items():
        if r.get("value"):
            head, tail = (
                head.replace(r["value"], "{{" + n + "}}"),
                tail.replace(r["value"], "{{" + n + "}}"),
            )
    return head + block + tail


def fill_check(text: str, std_dir: str, vault_dir: str) -> list[tuple[str, str]]:
    """Every recorded value put back as its placeholder and recomputed: the document must come back
    unchanged. Returns [(name, problem)]."""
    recipes = fill_recipes(text)
    m = FILL_BLOCK.search(text)
    if not m:
        return []
    head, block, tail = text[: m.start()], text[m.start() : m.end()], text[m.end() :]
    bad = [(n, "no recorded value") for n, r in recipes.items() if not r.get("value")]
    for n, r in recipes.items():
        if r.get("value"):
            head, tail = (
                head.replace(r["value"], "{{" + n + "}}"),
                tail.replace(r["value"], "{{" + n + "}}"),
            )
    try:
        again, values = fill(head + block + tail, std_dir, vault_dir)
    except ValueError as e:
        return bad + [("*", str(e))]
    bad += [
        (n, f"recorded {r.get('value')}, recomputes to {values[n]}")
        for n, r in recipes.items()
        if r.get("value") != values[n]
    ]
    again_recipes = fill_recipes(again)
    bad += [
        (
            n,
            f"fills {again_recipes[n]['uses']} "
            f"place{'s' if again_recipes[n]['uses'] != 1 else ''}, recorded as {r.get('uses')} — "
            "a copy was edited by hand?",
        )
        for n, r in recipes.items()
        if r.get("uses") != again_recipes[n]["uses"]
    ]
    if not bad and FILL_BLOCK.sub("", again) != FILL_BLOCK.sub("", text):
        bad.append(
            ("*", "a computed value in the text no longer matches its recipe — edited by hand?")
        )
    return bad
