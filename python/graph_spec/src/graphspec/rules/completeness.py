"""§25 completeness: what a graph says it must contain — counts and grids — reported, never
refused."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING, Any

from graphspec.rules.canonical_json import _num

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph


# ── §25 completeness — what a graph says it must contain; reported, never refused ────────────────
# Counts (Cardinality, after SHACL sh:minCount/sh:maxCount) and grids (Coverage). Both are declared
# in the graph itself. A Deferred parks a gap on purpose. The JavaScript twin, completeness() in
# graph-spec-check.js, must give the identical report.
CARD_NEEDS = ("kind", "relationship", "direction")
COV_NEEDS = ("rows", "columns", "of", "row_link", "column_link", "excused_by")


def _day(v):
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    return str(v)[:10] if v else ""


def _parked_state(g, ds, today):
    """A gap parked by several Deferreds is overdue only when every one is past its revisit_by."""
    return (
        "overdue"
        if all(
            _day(g.p(d).get("revisit_by")) and _day(g.p(d).get("revisit_by")) < today for d in ds
        )
        else "deferred"
    )


def completeness(g: Graph, today: str | None = None) -> dict[str, list[dict[str, Any]]]:
    """{'rules': one entry per Cardinality and Coverage, by id; 'deferred_malformed': Deferreds
    that do not say what and why}."""
    today = today or dt.date.today().isoformat()
    rules = []
    for r in sorted(g.labelled("Cardinality")):
        p = g.p(r)
        lack = [k for k in CARD_NEEDS if p.get(k) in (None, "")] + (
            [] if p.get("min") is not None or p.get("max") is not None else ["min or max"]
        )
        if not lack and p["direction"] not in ("out", "in"):
            lack = ["direction 'out' or 'in'"]
        e = {
            "rule": r,
            "kind": "cardinality",
            "says": p.get("says", ""),
            "counted": 0,
            "met": 0,
            "excused": 0,
            "missing": [],
            "deferred": [],
            "overdue": [],
            "malformed": ("a Cardinality must carry " + ", ".join(lack)) if lack else "",
        }
        if not lack:
            alts, mn, mx, way = (
                [t.strip() for t in str(p["relationship"]).split("|")],
                p.get("min"),
                p.get("max"),
                p["direction"],
            )
            parked = {}
            for d in g.labelled("Deferred"):
                if g.p(d).get("rule") == r:
                    for x in g.out(d, "DEFERS"):
                        parked.setdefault(x[2], []).append(d)
            for i in sorted(g.labelled(p["kind"])):
                n = sum(len(g.out(i, t) if way == "out" else g.inc(i, t)) for t in alts)
                e["counted"] += 1
                low, high = mn is not None and n < mn, mx is not None and n > mx
                if not (low or high):
                    e["met"] += 1
                    continue
                if i in parked:
                    e[_parked_state(g, parked[i], today)].append(i)
                    continue
                fix = (
                    f"add a {p['relationship']} link ({way}): it has {_num(n)}, "
                    f"needs at least {_num(mn)}; or park it with a Deferred whose rule is {r}"
                    if low
                    else f"remove {_num(n - mx)} of its {p['relationship']} links ({way}): "
                    f"it has {_num(n)}, allows at most {_num(mx)}"
                )
                e["missing"].append({"at": i, "found": n, "fix": fix})
        rules.append(e)
    for r in sorted(g.labelled("Coverage")):
        p = g.p(r)
        lack = [k for k in COV_NEEDS if p.get(k) in (None, "")]
        e = {
            "rule": r,
            "kind": "coverage",
            "says": p.get("says", ""),
            "counted": 0,
            "met": 0,
            "excused": 0,
            "missing": [],
            "deferred": [],
            "overdue": [],
            "malformed": ("a Coverage must carry " + ", ".join(lack)) if lack else "",
        }
        if not lack:

            def pairs(x):
                return {
                    (a[2], b[2])
                    for a in g.out(x, p["row_link"])
                    for b in g.out(x, p["column_link"])
                }

            covered = (
                set().union(*[pairs(x) for x in g.labelled(p["of"])])
                if g.labelled(p["of"])
                else set()
            )
            parked = {}
            for d in g.labelled("Deferred"):
                for k in pairs(d):
                    parked.setdefault(k, []).append(d)
            for a in sorted(g.labelled(p["rows"])):
                for b in sorted(g.labelled(p["columns"])):
                    e["counted"] += 1
                    at = f"{a} × {b}"
                    if (a, b) in covered:
                        e["met"] += 1
                        continue
                    ex = [x for x in g.out(a, p["excused_by"]) if x[2] == b]
                    if any(str(x[3].get("reason") or "").strip() for x in ex):
                        e["excused"] += 1
                        continue
                    if (a, b) in parked:
                        e[_parked_state(g, parked[(a, b)], today)].append(at)
                        continue
                    fix = (
                        f"give the {p['excused_by']} from {a} to {b} a reason"
                        if ex
                        else f"add a {p['of']} that is {p['row_link']} {a} and "
                        f"{p['column_link']} {b}; or excuse the pairing with {p['excused_by']} "
                        "and a reason; or park it with a Deferred"
                    )
                    e["missing"].append({"at": at, "found": 0, "fix": fix})
        rules.append(e)
    rules.sort(key=lambda x: x["rule"])
    for x in rules:
        x["deferred"].sort()
        x["overdue"].sort()
        x["missing"].sort(key=lambda m: m["at"])
    bad = []
    for d in sorted(g.labelled("Deferred")):
        lack = [k for k in ("what", "why") if not str(g.p(d).get(k) or "").strip()]
        if lack:
            bad.append({"at": d, "fix": "say " + " and ".join(lack)})
    return {"rules": rules, "deferred_malformed": bad}
