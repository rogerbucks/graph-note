"""A graph as at a date, on either of its two kinds of time (editor spec §29, two_kinds_of_time).

- Recorded time: when a thing or link was written into the graph, its `recorded_at`. As at a
  date, the graph holds only what was recorded by then. A thing superseded by then (§12, a
  successor's SUPERSEDES) is no longer current.
- Real-world time: when it holds in the world, from its `valid_from` up to its `valid_to`. Either
  end may be left open. As at a date, the graph holds only what holds then.

A thing or link with no time on an axis holds at every date on it. Lenses (§15) and every other
rule then run on the graph as at the date, so each answers as it was true then. This is the twin
of the JavaScript library's src/mesh/as-at.js, and packages/graph-spec/test/two-times-cases.json
holds both to the same answers.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from graphspec.rules.lens import lens_buckets
from graphspec.rules.plain_graph import Graph

# The two axes of time a graph is read as at.
AXES = ("recorded", "real")


def _text(v: Any) -> str | None:
    """A value of time as its text: a date or an instant as written, anything else as it is."""
    if v is None:
        return None
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    return str(v)


def _holds(p: dict[str, Any], axis: str, date: str) -> bool:
    """Whether something with these properties holds as at `date` on `axis`. ISO 8601 text orders
    as its times do."""
    if axis == "recorded":
        at = _text(p.get("recorded_at"))
        return at is None or not at > date
    start, end = _text(p.get("valid_from")), _text(p.get("valid_to"))
    return (start is None or not start > date) and (end is None or end > date)


def as_at(graph: Graph, axis: str, date: str) -> Graph:
    """`graph` as at `date` (YYYY-MM-DD, or an instant) on `axis`: 'recorded' or 'real'."""
    if axis not in AXES:
        raise ValueError(f"The axis of time must be recorded or real, not {axis}")
    on = str(date)
    kept = {i for i, (_, p) in graph.nodes.items() if _holds(p, axis, on)}
    if axis == "recorded":
        for src, kind, dst, p in graph.edges:
            if kind == "SUPERSEDES" and src in kept and _holds(p or {}, axis, on):
                kept.discard(dst)
    nodes = {i: n for i, n in graph.nodes.items() if i in kept}
    edges = [
        e for e in graph.edges if e[0] in kept and e[2] in kept and _holds(e[3] or {}, axis, on)
    ]
    return Graph(nodes, edges)


def lens_as_at(graph: Graph, rule: str, axis: str, date: str) -> dict[str, str] | None:
    """A lens (§15) run on `graph` as at `date` on `axis`: each thing's bucket as it was then."""
    return lens_buckets(as_at(graph, axis, date), rule)
