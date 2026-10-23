"""A filter saved in the style graph (editor spec §53, scale_filter_live), checked. The core's
filter-saved.ts, function for function, as far as its problems go. graph_svg never draws an
overview, so it uses no filter; but a note's Filter line gets the same problems here as there.

A Filter's keep is parts split by semicolons. Each part is a filter's name, a colon, then the
values kept, comma-joined: 'Kind: Task, Note; status: done'. Kind filters by kind; any other name
is a property."""

from __future__ import annotations

from typing import Any

from graphspec.style.near_names import nearest
from graphspec.style.words import or_list

# The filter that sorts things by their kind, as the core's overview names it.
KIND_FILTER = "Kind"


def filter_of(r: Any, raw: dict, names: dict) -> dict | None:
    """A Filter, checked against the graph it styles, read by `r` (checks.py's reader): {keep,
    view (if any), at}. A part that cannot be read, a filter named twice, or a kind the graph
    lacks is a problem with its fix, and is left out. The rest is kept."""
    text, view = r.text("keep"), r.text("view")
    if text is None:
        add = "add keep: 'Kind: <Kind>' or keep: '<property>: <value>'"
        r.missing("a Filter says what it keeps", add)
        return None
    keep: dict[str, list[str]] = {}
    for part in text.split(";"):
        if not part.strip():
            continue
        name, colon, rest = part.partition(":")
        name = name.strip()
        values = [v.strip() for v in rest.split(",") if v.strip()]
        if not colon or not name or not values:
            r.report(
                f"the filter {part.strip()} cannot be read: a filter is its name, a colon, then"
                " the values kept",
                "write it as 'status: done, open', or remove it",
            )
            continue
        if name in keep:
            r.report(f"the filter {name} is written twice in one Filter", "keep one of them")
            continue
        unknown = [v for v in values if v not in names["kinds"]] if name == KIND_FILTER else []
        for v in unknown:
            _not_a_kind(r, v, names)
        keep[name] = [v for v in values if v not in unknown]
    return {"keep": keep, **({} if view is None else {"view": view}), "at": raw["at"]}


def _not_a_kind(r: Any, v: str, names: dict) -> None:
    """The problem of a kind kept that the graph lacks, its fix the nearest kind."""
    near = nearest(v, names["kinds"])
    by = [] if not near else [near["one"]] if "one" in near else near["several"]
    graph = names["graph"]
    if by:
        mean = "the one you mean: " if len(by) > 1 else ""
        fix = f"change {v} to {mean}{or_list(by)}"
    else:
        fix = f"write a kind in graph {graph}, or remove it"
    r.report(f"{v} is not a kind in graph {graph}", fix)
