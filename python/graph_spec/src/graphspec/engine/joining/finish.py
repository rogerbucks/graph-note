"""§21 a join finished: paradox checks, flags for a person, then findings — and the two
joins built on it."""

from __future__ import annotations

import hashlib
from collections.abc import Collection, Iterable
from typing import Any

from graphspec.engine.joining.breaches import breaches
from graphspec.engine.joining.claims import add_claim, ident_str, vtext
from graphspec.engine.joining.merge3 import merge3
from graphspec.engine.joining.union import union


def finish(
    J: dict[str, Any],  # noqa: N803  # public signature
    C: dict[str, Any],  # noqa: N803  # public signature
    findings: Collection[dict[str, Any]] = (),
    checks: Collection[str] = ("cycles", "cardinality", "constraints", "determinism", "flags"),
) -> dict[str, Any]:
    """Paradox checks on the joined graph, flags for a person, then findings."""
    found = [
        b
        for b in breaches(J["nodes"], J["edges"], C, checks)
        if len(
            {d for e in b["edges"] for d in J["esrc"].get(e, [])}
            | {d for sl in b["slots"] for d in J["src"].get(sl, [])}
        )
        > 1
    ]
    gone_e, gone_s = set(), set()
    for b in found:
        ids = []
        for e in b["edges"]:
            ids.append(
                add_claim(
                    J,
                    e[0],
                    f"{e[1]}-{e[2]}" + (f"/{ident_str(e)}" if ident_str(e) else ""),
                    J["esrc"][e],
                    ("breach",) + tuple(b["edges"]),
                    [("subject", e[0]), ("object", e[2])],
                    claimed_relationship=e[1],
                    edge_ident=ident_str(e),
                    _key=e,
                    _props=dict(J["edges"].get(e, {})),
                    **{k: v for k, v in J["edges"].get(e, {}).items()},
                )
            )
            J["report"].append(
                (
                    b["kind"],
                    e[0],
                    e[1],
                    f"{e[0]} {e[1]} {e[2]}"
                    + (f" [{ident_str(e)}]" if ident_str(e) else "")
                    + f" ({', '.join(J['esrc'][e])})",
                    f"PARADOX — {b['why']}",
                    "decide which holds; a finding confirms one",
                )
            )
            gone_e.add(e)
        for nid, k in b["slots"]:
            v = J["nodes"][nid]["props"].get(k)
            ids.append(
                add_claim(
                    J,
                    nid,
                    f"{k}={vtext(v)}",
                    J["src"][(nid, k)],
                    ("breach",) + tuple(b["slots"]),
                    [("subject", nid)],
                    claimed_property=k,
                    claimed_value=v,
                )
            )
            J["report"].append(
                (
                    b["kind"],
                    nid,
                    k,
                    f"{nid}.{k} = {v} ({', '.join(J['src'][(nid, k)])})",
                    f"PARADOX — {b['why']}",
                    "decide which holds; a finding confirms one",
                )
            )
            gone_s.add((nid, k))
        ids = sorted(set(ids))
        if len(ids) == 2:
            J["pairs"].append(tuple(ids))
        else:
            J["paradoxes"].append(
                (
                    "paradox:join/" + hashlib.sha256("|".join(ids).encode()).hexdigest()[:10],
                    b["why"],
                    ids,
                )
            )
    for e in gone_e:
        J["edges"].pop(e, None)
    for nid, k in gone_s:
        J["nodes"][nid]["props"].pop(k, None)
    if "flags" in checks:
        byname = {}
        for nid, n in J["nodes"].items():
            if "name" in n["props"]:
                byname.setdefault((frozenset(n["labels"]), n["props"]["name"]), []).append(nid)
        for (labelset, name), ids in sorted(byname.items(), key=str):
            if len(ids) > 1:
                J["report"].append(
                    (
                        "duplicate",
                        ", ".join(ids),
                        "name",
                        f"{name!r} under {len(ids)} ids",
                        "POSSIBLE DUPLICATE — flagged, never merged by the join",
                        "decide; if one thing, declare an id map and re-join",
                    )
                )
        for nid, n in J["nodes"].items():
            known = set().union(*(C["vocab"].get(label, set()) for label in n["labels"]))
            for k in n["props"]:
                if known and k not in known:
                    hint = (
                        f"; {k}_cents is declared — likely a unit not mapped"
                        if f"{k}_cents" in known
                        else ""
                    )
                    J["report"].append(
                        (
                            "undeclared",
                            nid,
                            k,
                            f"{k} = {n['props'][k]}{hint}",
                            "UNDECLARED PROPERTY — flagged",
                            "declare a unit map, or fix the source",
                        )
                    )
    for f in findings:
        c = J["claims"][f["confirms"]]
        c["status"] = "confirmed"
        for x in f["refutes"]:
            J["claims"][x]["status"] = "refuted"
        s = c["_about"][0][1]
        if "claimed_node" in c:
            if c.get("claimed_absent") and s in J["nodes"]:
                # the removal is confirmed — what the other side still said about the node is kept,
                # as refuted claims
                nd = J["nodes"][s]
                for label in sorted(nd["labels"]):
                    J["claims"][
                        add_claim(
                            J,
                            s,
                            f"label/{label}",
                            nd["stated_in"],
                            ("exists", s),
                            [("subject", s)],
                            claimed_label=label,
                        )
                    ]["status"] = "refuted"
                for k, v in sorted(nd["props"].items()):
                    if k != "id":
                        J["claims"][
                            add_claim(
                                J,
                                s,
                                f"{k}={vtext(v)}",
                                J["src"].get((s, k), nd["stated_in"]),
                                ("exists", s),
                                [("subject", s)],
                                claimed_property=k,
                                claimed_value=v,
                            )
                        ]["status"] = "refuted"
                for e in [e for e in J["edges"] if s in (e[0], e[2])]:
                    J["claims"][
                        add_claim(
                            J,
                            e[0],
                            f"{e[1]}-{e[2]}" + (f"/{ident_str(e)}" if ident_str(e) else ""),
                            J["esrc"][e],
                            ("exists", s),
                            [("subject", e[0]), ("object", e[2])],
                            claimed_relationship=e[1],
                            edge_ident=ident_str(e),
                            _key=e,
                            _props=dict(J["edges"][e]),
                            **J["edges"][e],
                        )
                    ]["status"] = "refuted"
                    J["edges"].pop(e)
                J["nodes"].pop(s)
        elif "claimed_relationship" in c and "claimed_property" in c:
            if c.get("claimed_absent"):
                J["edges"][c["_key"]].pop(c["claimed_property"], None)
            else:
                J["edges"].setdefault(c["_key"], {})[c["claimed_property"]] = c["claimed_value"]
        elif "claimed_relationship" in c and c.get("claimed_absent"):
            # the removal is confirmed — the relationship as the other side had it is kept, refuted
            if c["_key"] in J["edges"]:
                e = c["_key"]
                J["claims"][
                    add_claim(
                        J,
                        e[0],
                        f"{e[1]}-{e[2]}"
                        + (f"/{ident_str(e)}" if ident_str(e) else "")
                        + "/as-kept",
                        J["esrc"][e],
                        ("exists",) + e,
                        [("subject", e[0]), ("object", e[2])],
                        claimed_relationship=e[1],
                        edge_ident=ident_str(e),
                        _key=e,
                        _props=dict(J["edges"][e]),
                        **J["edges"][e],
                    )
                ]["status"] = "refuted"
                J["edges"].pop(e)
        elif "claimed_relationship" in c and c.get("claimed_exists"):
            pass
        elif "claimed_relationship" in c:
            J["edges"][c["_key"]] = dict(c["_props"])
            J["esrc"][c["_key"]] = c["_docs"]
        elif "claimed_property" in c:
            if not c.get("claimed_absent"):
                J["nodes"][s]["props"][c["claimed_property"]] = c["claimed_value"]
        else:
            J["nodes"][s]["labels"] |= set(c["claimed_label"].split(":"))
    J["pairs"] = sorted(set(J["pairs"]))
    J["findings"] = list(findings)
    # §20: confidence counted — each document is a source; those stating a clashing claim count
    # against
    against = {}
    for a_, b_ in J["pairs"]:
        against.setdefault(a_, set()).update(J["claims"][b_]["_docs"])
        against.setdefault(b_, set()).update(J["claims"][a_]["_docs"])
    for _, _, ids in J["paradoxes"]:
        for x in ids:
            against.setdefault(x, set()).update(
                d for y in ids if y != x for d in J["claims"][y]["_docs"]
            )
    for cid, c in J["claims"].items():
        sup, con = len(c["_docs"]), len(against.get(cid, set()) - set(c["_docs"]))
        c["confidence"] = "high" if sup >= 2 and not con else "moderate" if sup > con else "low"
    return J


def join(
    docs: Iterable[dict[str, Any]],
    C: dict[str, Any],  # noqa: N803  # public signature
    findings: Collection[dict[str, Any]] = (),
    checks: Collection[str] = ("cycles", "cardinality", "constraints", "determinism", "flags"),
) -> dict[str, Any]:
    """Two or more documents joined (union), then finished: paradox checks, flags and findings."""
    return finish(union(docs, C), C, findings, checks)


def join3(
    base: dict[str, Any],
    a: dict[str, Any],
    b: dict[str, Any],
    C: dict[str, Any],  # noqa: N803  # public signature
    findings: Collection[dict[str, Any]] = (),
    checks: Collection[str] = ("cycles", "cardinality", "constraints", "determinism", "flags"),
    hold: bool = True,
) -> dict[str, Any]:
    """Two revisions of one earlier version merged (merge3), then finished: paradox checks, flags
    and findings."""
    return finish(merge3(base, a, b, C, hold), C, findings, checks)
