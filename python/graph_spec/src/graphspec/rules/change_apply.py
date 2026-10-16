"""§24 change sets: what a DELETE or SET does to a store, what stops it, and the GQL an engine is
given for it."""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import Collection
from typing import TYPE_CHECKING, Any

from graphspec.reader.lexer import quote
from graphspec.rules.provenance import had_plan

if TYPE_CHECKING:
    from graphspec.reader.store import Store

# A record is corrected by a superseding addition (§12), and a cache is the engine's part (§11,
# §20): neither is ever removed or changed by a change set, whoever it is by. A thing is a record
# by any label it carries; a Delivery is an event, and an Assessment is a record without Event.
RECORD_LABELS = {"Event", "IssuedDocument", "Decision", "Delivery", "Assessment"}
CACHE_KEYS = {"likelihood", "confidence", "status"}


def _literal(v: Any) -> str:
    """A value as the profile writes it."""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, dt.datetime):
        return f"DATETIME '{v.isoformat()}+00:00'"  # an instant is held as its UTC time
    if isinstance(v, dt.date):
        return f"DATE '{v.isoformat()}'"
    return quote(v) if isinstance(v, str) else str(v)


def gql_of(c: dict[str, Any]) -> str:
    """A change as the GQL statement an engine is given: it names its one target by id, as the
    reader read it."""

    def node(var, nid, labels=()):
        return f"({var}{''.join(':' + x for x in labels)} {{id: {quote(nid)}}})"

    if c["kind"] == "thing":
        match, var = f"MATCH {node('v', c['thing'], c['labels'])}", "v"
    else:
        a, b = node("a", c["from"], c["ends"][0]), node("b", c["to"], c["ends"][1])
        match, var = f"MATCH {a}-[r:{c['type']}]->{b}", "r"
    if "set" in c:
        return f"{match} SET " + ", ".join(
            f"{var}.{k} = {_literal(v)}" for k, v in c["set"].items()
        )
    return f"{match} {'DETACH ' if c['op'].startswith('detach') else ''}DELETE {var}"


# what stops a DELETE or SET, by kind (apply_change), as the result's label
LABELS = {
    "find": "each DELETE and SET finds its one target in the graph (§24)",
    "dangling": "a DELETE leaves no link without its end; "
    "DETACH DELETE removes a thing with its links (§24)",
    "record": "it never removes or changes a record or a cache (§24 rule 4)",
}


def stop_fix(kind: str, what: str, c: dict[str, Any]) -> str:
    """What to change when apply_change stopped a change, said with its reason."""
    if kind == "find":
        return f"{what} is not in the graph — name a thing or link that is there"
    if kind == "dangling":
        return f"{what} still has links — remove them, or DETACH DELETE it"
    if c.get("set") and CACHE_KEYS & set(c["set"]) and c["kind"] == "thing":
        return (
            f"{what}'s {sorted(CACHE_KEYS & set(c['set']))} is a cache, the engine's part (§11): "
            "it is re-made when the evidence changes, never set"
        )
    return (
        f"{what} is a record (an event, an issued document or a decision) or a value an activity "
        "made — correct it with a new element that supersedes it (§12), never an edit or a removal"
    )


def is_record_add(labels: Collection[str]) -> bool:
    """Whether a new thing is a record a model may not add: an event, an issued document or a
    decision (an assessment it makes as itself is its own to add)."""
    return bool(set(labels) & (RECORD_LABELS - {"Assessment"})) and "Assessment" not in labels


def adds_cache(labels: Collection[str], props_json: str) -> bool:
    """Whether a new thing is a claim carrying a cache (likelihood, confidence or status), which is
    the engine's to make. `props_json` is its properties as the state holds them."""
    return "Claim" in labels and bool(CACHE_KEYS & set(json.loads(props_json)))


GENERATED = (
    "an added WAS_GENERATED_BY comes from a thing the set adds, to an activity of the set's own "
    "author (§24)"
)


def foreign_generations(
    st: Store, g: str, new_edges: Collection[tuple], made: Collection[str], by: str
) -> list[tuple]:
    """The added WAS_GENERATED_BY links that do not come from a thing the set adds, to an Activity
    associated with the set's author that HAD_PLAN no rule: a link from a thing already there, or
    to an engine run, a planned activity or another author's run, would make a cache."""
    from graphspec.rules.plain_graph import World

    w = World.from_store(st)[g]

    def own(a):
        return (
            a in w.nodes
            and "Activity" in w.nodes[a][0]
            and not had_plan(w, a)
            and any(e[2] == by for e in w.out(a, "ASSOCIATED_WITH"))
        )

    return [
        e for e in new_edges if e[1] == "WAS_GENERATED_BY" and not (e[0] in made and own(e[2]))
    ]


def apply_change(store: Store, g: str, c: dict[str, Any]) -> tuple[str, str] | None:
    """The change made on a store's graph g, or what stops it: None when made, else (kind, what) —
    kind is 'find' when its target is not in the graph, 'dangling' when a DELETE would leave a
    link without its end, 'record' when it would remove or change a record or a cache. A thing's
    DELETE sets `links`: the links it removes with it."""
    graph = store.graph(g)
    nodes = graph["nodes"]

    def has(k, labels):
        return k is not None and set(labels) <= nodes[k]["labels"]

    if c["kind"] == "thing":
        where = c["thing"]
        k = store.find(g, c["thing"])
        if not has(k, c["labels"]):
            return "find", where
        labels = nodes[k]["labels"]
        if labels & RECORD_LABELS:
            return "record", where
        # an issued document is whatever a delivery delivered, and a value an activity made is a
        # cache (§11)
        if any(
            e[1] == "DELIVERED" and e[2] == k and "Delivery" in nodes[e[0]]["labels"]
            for e in graph["edges"]
        ):
            return "record", where

        # a cache is anything WAS_GENERATED_BY an activity that HAD_PLAN a rule (§24, W3C PROV); a
        # value made by an activity with no plan, a person's or a model's own work among them, is
        # not one
        def planned(a):
            return any(e[1] == "HAD_PLAN" and e[0] == a for e in graph["edges"])

        if any(e[1] == "WAS_GENERATED_BY" and e[0] == k and planned(e[2]) for e in graph["edges"]):
            return "record", where
        if c["op"].startswith("set"):
            if "Claim" in labels and CACHE_KEYS & set(c["set"]):
                return "record", where
            nodes[k]["props"].update(c["set"])
            return None
        touching = [e for e in graph["edges"] if e[0] == k or e[2] == k]
        if touching and c["op"] == "delete-thing":
            return "dangling", where
        c["links"] = [
            [nodes[e[0]]["props"]["id"], e[1], nodes[e[2]]["props"]["id"]] for e in touching
        ]
        graph["edges"] = [e for e in graph["edges"] if not any(e is t for t in touching)]
        del nodes[k]
        return None
    where = f"{c['from']} {c['type']} {c['to']}"
    a, b = store.find(g, c["from"]), store.find(g, c["to"])
    if not has(a, c["ends"][0]) or not has(b, c["ends"][1]):
        return "find", where
    at = next(
        (i for i, e in enumerate(graph["edges"]) if e[0] == a and e[1] == c["type"] and e[2] == b),
        -1,
    )
    if at < 0:
        return "find", where
    if c["op"].startswith("set"):
        graph["edges"][at][3].update(c["set"])
    else:
        del graph["edges"][at]
    return None
