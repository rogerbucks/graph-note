"""§24 change sets: the DELETE and SET statements of a change set, each naming one target, read and
read; change_apply.py applies them."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from graphspec.reader.grammar import Parser
from graphspec.reader.lexer import ProfileError, tokens
from graphspec.reader.whitespace import S, strip
from graphspec.rules.canonical_json import hash16, norm

VERBS = {"MATCH", "DELETE", "DETACH", "SET"}
WORD = re.compile(rf"{S}*([A-Za-z_]+)", re.ASCII)
REASON = re.compile(rf"{S}*//@{S}*reason:([^\n]*)$")
BASIS = re.compile(rf"{S}*//@?{S}*(?:against|by){S}*:", re.I | re.ASCII)  # no long s (U+017F)
HEADER = re.compile(rf"{S}*//{S}*graph:")
ONE = "a DELETE or SET names exactly one target"


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
        # a SET whose line ends with a comma goes on to the next line, as the profile reads it
        if opened and opened["done"] and opened.get("comma"):
            opened["lines"].append(i)
            opened["comma"] = strip(line).endswith(",")
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
        opened["comma"] = opened["done"] and strip(line).endswith(",")
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


def _refuse(p: Parser, message: str, fix: str, code: str):
    """A statement refused at the line it has read to, with its problem's code."""
    raise ProfileError(p.line(), message, fix, code=code)


def _end_of(p: Parser, n: dict[str, Any]) -> tuple[str, list[str]]:
    if list(n["props"]) != ["id"] or not isinstance(n["props"]["id"], str):
        _refuse(
            p,
            "a target is named by its id alone",
            "write MATCH (v:Kind {id: '…'}) — a thing by its name, "
            "a link by its two ends and its type",
            code="GN401",
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
                    code="GN402",
                )
            p.take("p", ":")
            typ = p.name()
            if p.at("p", "{"):
                _refuse(
                    p,
                    "a link is named by its two ends and its type alone",
                    "leave its values to a SET",
                    code="GN403",
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
            _refuse(p, "this names more than one target", ONE, code="GN404")

    def named(v: str) -> dict[str, Any]:
        if target is None:
            # SET name.key: the name is the thing's id (§3)
            return {"kind": "thing", "v": v, "thing": v, "labels": []}
        if v != target["v"]:
            _refuse(p, f"{v} is not the one target", ONE, code="GN405")
        return target

    if _is(p, "DELETE") or _is(p, "DETACH"):
        if target is None:
            _refuse(
                p,
                "a DELETE needs the target it removes",
                "write MATCH (v:Kind {id: '…'}) DELETE v",
                code="GN406",
            )
        detach = _is(p, "DETACH")
        p.i += 1
        if detach:
            if not _is(p, "DELETE"):
                _refuse(p, "DETACH is followed by DELETE", "write DETACH DELETE v", code="GN407")
            p.i += 1
        named(p.name())
        if p.at("p", ","):
            _refuse(p, "this removes more than one target", ONE, code="GN408")
        if not p.at("end"):
            _refuse(
                p,
                f"unexpected {p.peek()[1]!r}",
                "a DELETE ends after the one target it removes",
                code="GN409",
            )
        if detach and target["kind"] == "link":
            _refuse(p, "a link has no links to detach", "write DELETE r", code="GN410")
        return {**target, "op": ("detach-delete-" if detach else "delete-") + target["kind"]}
    if not p.at("kw", "SET"):
        _refuse(
            p, "a change is a DELETE or a SET", "write DELETE or SET after the MATCH", code="GN411"
        )
    p.take("kw", "SET")
    values: dict[str, Any] = {}
    first_var = None
    while True:
        v = p.name()
        if first_var is not None and v != first_var:
            _refuse(p, "this changes more than one target", ONE, code="GN412")
        first_var = v
        found = named(v)
        p.take("p", ".")
        key = p.name()
        if key in ("__proto__", "constructor", "prototype"):
            _refuse(
                p,
                f"{key} is not a name a SET may give a value to",
                "choose another name for the value",
                code="GN414",
            )
        if key == "id":
            _refuse(
                p,
                f"SET would change {v}'s id, and a thing's id never changes",
                "write the right thing, then supersede it",
                code="GN413",
            )
        p.take("p", "=")
        values[key] = p.value()
        if not p.at("p", ","):
            break
        p.take("p", ",")
    if not p.at("end"):
        _refuse(p, f"unexpected {p.peek()[1]!r}", "a SET ends after its values", code="GN415")
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
