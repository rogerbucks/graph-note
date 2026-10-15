"""§24 change sets: the DELETE and SET statements of a change set, each naming one target, read and
applied to a store."""

from __future__ import annotations

import datetime as dt
import json
import re
import unicodedata
from collections.abc import Collection
from typing import TYPE_CHECKING, Any

from graphspec.reader.grammar import Parser
from graphspec.reader.lexer import ProfileError, quote, tokens
from graphspec.reader.whitespace import S, strip
from graphspec.rules.canonical_json import hash16, norm

if TYPE_CHECKING:
    from graphspec.reader.store import Store

VERBS = {"MATCH", "DELETE", "DETACH", "SET"}
WORD = re.compile(rf"{S}*([A-Za-z_]+)", re.ASCII)
REASON = re.compile(rf"{S}*//@{S}*reason:([^\n]*)$")
BASIS = re.compile(rf"{S}*//@?{S}*(?:against|by){S}*:", re.I | re.ASCII)  # no long s (U+017F)
HEADER = re.compile(rf"{S}*//{S}*graph:")
ONE = "a DELETE or SET names exactly one target (§24)"


def _word_of(line: str) -> str:
    m = WORD.match(line)
    return m.group(1).upper() if m else ""


def _has_verb(line: str) -> bool:
    """Whether a line holds a DELETE or a SET as a word of its own, never one inside a quoted
    text."""
    try:
        return any(
            (t[0] == "kw" and t[1] == "SET") or (t[0] == "id" and t[1].upper() == "DELETE")
            for t in tokens(line)
        )
    except ProfileError:  # unreadable: the statement's own reading says why
        return bool(re.search(r"\b(?:DELETE|SET)\b", line, re.I | re.ASCII))


def split_changeset(block: str) -> dict[str, Any]:
    """A change set's block split into its additions and its changes. A statement begins at a line
    that begins with MATCH, DELETE, DETACH or SET: a MATCH goes on to the line that holds its
    DELETE or SET, and any other such line is a statement of its own. A MATCH that no DELETE or
    SET follows belongs to the additions, which are the block with the statements' lines blanked,
    so every line keeps its number. `reason` is the `//@ reason:` line directly above a statement,
    a hint only. `basis_ok` is false when a line other than the header says what the set was made
    against or who made it."""
    lines = block.split("\n")
    start = next((i for i, x in enumerate(lines) if strip(x)), -1)
    groups: list[dict[str, Any]] = []
    opened: dict[str, Any] | None = None
    basis_ok = True
    for i in range(start + 1, len(lines)):
        line = lines[i]
        if not strip(line):
            continue
        if strip(line).startswith("//"):
            if BASIS.match(line) or HEADER.match(line):
                basis_ok = False
            continue
        word = _word_of(line)
        if word not in VERBS:
            opened = None
            continue
        if opened and not opened["done"]:
            opened["lines"].append(i)
        else:
            above = REASON.match(lines[i - 1]) if i > 0 else None
            opened = {
                "lines": [i],
                "done": False,
                "reason": strip(above.group(1)) if above and strip(above.group(1)) else None,
            }
            groups.append(opened)
        if word != "MATCH" or _has_verb(line):
            opened["done"] = True
    changes = [
        {
            "line": g["lines"][0] + 1,
            "lines": g["lines"],
            "text": "\n".join(lines[i] for i in g["lines"]),
            "reason": g["reason"],
        }
        for g in groups
        if g["done"]
    ]
    taken = {i for c in changes for i in c["lines"]}
    additions = "\n".join("" if i in taken else x for i, x in enumerate(lines))
    return {"additions": additions, "changes": changes, "basis_ok": basis_ok}


def _refuse(p: Parser, message: str, fix: str):
    raise ProfileError(p.line(), message, fix)


def _end_of(p: Parser, n: dict[str, Any]) -> tuple[str, list[str]]:
    if list(n["props"]) != ["id"] or not isinstance(n["props"]["id"], str):
        _refuse(
            p,
            "a target is named by its id alone",
            "write MATCH (v:Kind {id: '…'}) — a thing by its name, "
            "a link by its two ends and its type",
        )
    return n["props"]["id"], n["labels"]


def _is(p: Parser, word: str) -> bool:
    return p.at("id") and p.peek()[1].upper() == word


def read_change(text: str) -> dict[str, Any]:
    """One statement read: {op, thing} for a thing, {op, from, type, to} for a link (with `labels`
    and `ends` of the kinds it names), and `set` for the values a SET gives. Refused, as a
    ProfileError, unless it is a DELETE or a SET of exactly one target (req:24.cs-one-target)."""
    p = Parser(tokens(text))
    target: dict[str, Any] | None = None
    if p.at("kw", "MATCH"):
        p.take("kw", "MATCH")
        first = p.node()
        if p.at("p", "-"):
            p.take("p", "-")
            p.take("p", "[")
            rel = None if p.at("p", ":") else p.name()
            if not p.at("p", ":"):
                _refuse(
                    p,
                    "a link is named by its type",
                    "write [r:TYPE] — a link by its two ends and its type",
                )
            p.take("p", ":")
            typ = p.name()
            if p.at("p", "{"):
                _refuse(
                    p,
                    "a link is named by its two ends and its type alone",
                    "leave its values to a SET",
                )
            p.take("p", "]")
            p.take("arrow")
            second = p.node()
            a, a_labels = _end_of(p, first)
            b, b_labels = _end_of(p, second)
            target = {
                "kind": "link",
                "v": rel,
                "from": a,
                "type": typ,
                "to": b,
                "ends": [a_labels, b_labels],
            }
        else:
            a, labels = _end_of(p, first)
            target = {"kind": "thing", "v": first["var"], "thing": a, "labels": labels}
        if p.at("p", ",") or p.at("p", "-") or p.at("kw", "MATCH"):
            _refuse(p, "this names more than one target", ONE)

    def named(v: str) -> dict[str, Any]:
        if target is None:
            # SET name.key: the name is the thing's id (§3)
            return {"kind": "thing", "v": v, "thing": v, "labels": []}
        if v != target["v"]:
            _refuse(p, f"{v} is not the one target", ONE)
        return target

    if _is(p, "DELETE") or _is(p, "DETACH"):
        if target is None:
            _refuse(
                p,
                "a DELETE needs the target it removes",
                "write MATCH (v:Kind {id: '…'}) DELETE v",
            )
        detach = _is(p, "DETACH")
        p.i += 1
        if detach:
            if not _is(p, "DELETE"):
                _refuse(p, "DETACH is followed by DELETE", "write DETACH DELETE v")
            p.i += 1
        named(p.name())
        if p.at("p", ","):
            _refuse(p, "this removes more than one target", ONE)
        if not p.at("end"):
            _refuse(
                p, f"unexpected {p.peek()[1]!r}", "a DELETE ends after the one target it removes"
            )
        if detach and target["kind"] == "link":
            _refuse(p, "a link has no links to detach", "write DELETE r")
        return {**target, "op": ("detach-delete-" if detach else "delete-") + target["kind"]}
    if not p.at("kw", "SET"):
        _refuse(p, "a change is a DELETE or a SET", "write DELETE or SET after the MATCH")
    p.take("kw", "SET")
    values: dict[str, Any] = {}
    first_var = None
    while True:
        v = p.name()
        if first_var is not None and v != first_var:
            _refuse(p, "this changes more than one target", ONE)
        first_var = v
        found = named(v)
        p.take("p", ".")
        key = p.name()
        if key in ("__proto__", "constructor", "prototype"):
            _refuse(
                p,
                f"{key} is not a name a SET may give a value to",
                "choose another name for the value",
            )
        if key == "id":
            _refuse(
                p,
                f"SET would change {v}'s id, and a node's id never changes (§3)",
                "write the right node, then supersede it (§12)",
            )
        p.take("p", "=")
        values[key] = p.value()
        if not p.at("p", ","):
            break
        p.take("p", ",")
    if not p.at("end"):
        _refuse(p, f"unexpected {p.peek()[1]!r}", "a SET ends after its values")
    return {**found, "op": "set-" + found["kind"], "set": values}


def change_id(c: dict[str, Any]) -> str:
    """A change's id, derived from its statement and never written: the same change, written either
    way, has the same id."""
    o: dict[str, Any] = {"op": c["op"]}

    def nfc(s):  # an id composed or decomposed names the same thing
        return unicodedata.normalize("NFC", s)

    if c["kind"] == "thing":
        o["thing"] = nfc(c["thing"])
    else:
        o.update({"from": nfc(c["from"]), "type": c["type"], "to": nfc(c["to"])})
    if "set" in c:
        o["set"] = {k: norm(v) for k, v in c["set"].items()}
    return hash16(o)


# A record is corrected by a superseding addition (§12), and a cache is the engine's part (§11,
# §20): neither is ever removed or changed by a change set, whoever it is by.
RECORD_LABELS = {"Event", "IssuedDocument", "Decision", "Delivery", "Assessment"}
CACHE_KEYS = {"likelihood", "confidence", "status"}


def read_all(
    statements: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str], list[dict[str, Any]]]:
    """Every statement of a change set read: the changes, what refused any (said with its line)
    and the changes as the header lists them — none when any is refused, or when one is written
    twice, which would be accepted or rejected as two though it is one."""
    read, refused = [], []
    for c in statements:
        try:
            read.append({**read_change(c["text"]), "reason": c["reason"]})
        except ProfileError as e:
            refused.append(f"line {c['line']}: {e.message} — {e.fix}")
    listed = [{"id": change_id(c), "op": c["op"], "reason": c["reason"]} for c in read]
    if not refused and len({c["id"] for c in listed}) != len(listed):
        refused.append("the same change is written twice — write it once")
    return read, refused, [] if refused else listed


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
        f"{what} is a record (an event, an issued document or a decision) — "
        "correct it with a new element that supersedes it (§12), never an edit or a removal"
    )


def is_record_add(labels: Collection[str]) -> bool:
    """Whether a new thing is a record: an event, an issued document or a decision (an assessment
    and evidence are the claims' own events, which a model may add)."""
    return bool(set(labels) & (RECORD_LABELS - {"Assessment"})) and not set(labels) & {
        "Assessment",
        "Evidence",
    }


def adds_cache(labels: Collection[str], props_json: str) -> bool:
    """Whether a new thing is a claim carrying a cache (likelihood, confidence or status), which is
    the engine's to make. `props_json` is its properties as the state holds them."""
    return "Claim" in labels and bool(CACHE_KEYS & set(json.loads(props_json)))


def apply_change(store: Store, g: str, c: dict[str, Any]) -> tuple[str, str] | None:
    """The change made on a store's graph g, or what stops it: None when made, else (kind, what) —
    kind is 'find' when its target is not in the graph, 'dangling' when a DELETE would leave a
    link without its end, 'record' when it would remove or change a record or a cache. A thing's
    DELETE sets `links`: the links it removes with it."""
    graph = store.graph(g)

    def has(k, labels):
        return k is not None and set(labels) <= graph["nodes"][k]["labels"]

    if c["kind"] == "thing":
        where = c["thing"]
        k = store.find(g, c["thing"])
        if not has(k, c["labels"]):
            return "find", where
        labels = graph["nodes"][k]["labels"]
        if labels & RECORD_LABELS:
            return "record", where
        if c["op"].startswith("set"):
            if "Claim" in labels and CACHE_KEYS & set(c["set"]):
                return "record", where
            graph["nodes"][k]["props"].update(c["set"])
            return None
        touching = [e for e in graph["edges"] if e[0] == k or e[2] == k]
        if touching and c["op"] == "delete-thing":
            return "dangling", where
        nodes = graph["nodes"]
        c["links"] = [
            [nodes[e[0]]["props"]["id"], e[1], nodes[e[2]]["props"]["id"]] for e in touching
        ]
        graph["edges"] = [e for e in graph["edges"] if not any(e is t for t in touching)]
        del graph["nodes"][k]
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
