"""A graph's style, read from its style blocks (editor spec §2, §6): every style block of the graph
read with the reader the data is read with, so what cannot be read is a problem on its line and the
rest is used; then each thing checked against the graph it styles, and the nudges against each
other. The core's style.ts readStyle, step for step, as far as nudges go, so graph_svg draws a
nudged graph as the plugin does (python_honours_nudges). Reading it never raises and never stops
the drawing (broken_style_block): at worst the graph is drawn in the locked style.

The plugin alone does not read a style too large to read on a phone (layout-limits.ts,
READ_LIMITS), as it does not read such data: the Python library reads any size."""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from graphspec.reader.block_items import blank_text
from graphspec.reader.drawing import REREAD_BUDGET, _graph_of, read_for_drawing, style_of
from graphspec.reader.written_things import written_in
from graphspec.rules.plain_graph import World
from graphspec.rules.views import SCHEMA_LABELS
from graphspec.style.checks import check_things
from graphspec.style.conflicts import settle_nudges


def _links(texts, blocks, graph):
    """Each link written in a style block: a problem on its line, as a link means nothing in a
    style graph."""
    out = []
    for block in blocks:
        blanked = blank_text(texts[block])
        for m in re.finditer(r"-\[", blanked):
            out.append(
                {
                    "graph": graph,
                    "block": block,
                    "line": blanked[: m.start()].count("\n") + 1,
                    "severity": "error",
                    "message": "a link means nothing in a style graph",
                    "fix": "remove the link",
                }
            )
    return out


def _in_order(labels, written):
    """A thing's kinds in the order written, as the core's store keeps them; a set here."""
    order = [x for x in dict.fromkeys(written.labels if written else ()) if x in labels]
    return order + sorted(x for x in labels if x not in order)


def read_style(
    texts: Sequence[str], graph: str, world: World
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """The style of `graph`: every style block of the note for it (`// graph: <name> · STYLE
    <graph>`), read as the data is, merged, and checked against the graph as the note reads it
    (`world`, from read_for_drawing's store). Returns ({nudges, direction}, problems): each nudge
    {word, thing, other, group, direction as written, at: {block, line, id}}, only those sound and
    in no conflict; the direction a direction nudge sets, or None; and each problem {graph, block,
    line, severity, message, fix}, the block's index in `texts` and its line, as the core gives
    them. Nothing is ever written to the data."""
    blocks = [i for i, t in enumerate(texts) if style_of(t) == graph]
    first = {"block": blocks[0] if blocks else 0, "line": 1, "id": ""}
    style: dict[str, Any] = {"nudges": [], "direction": None}
    if not blocks:
        return style, []
    g = world.graphs.get(graph)
    if g is None:
        return style, [
            {
                "graph": graph,
                "block": first["block"],
                "line": 1,
                "severity": "error",
                "message": f"there is no graph {graph} in this note to style",
                "fix": f"write graph {graph}, or style a graph the note has",
            }
        ]
    store, read = read_for_drawing(
        texts, (), REREAD_BUDGET, lambda t: "data" if style_of(t) == graph else None
    )
    problems = [{**p, "graph": graph} for p in read if p["severity"] != "hint"]
    # where each thing is written: the first block and line that write it
    where = {}
    for block in blocks:
        text, name = texts[block], _graph_of(texts[block])
        for w in written_in(text):
            if w.writes and w.variable and (name, w.variable[1]) not in where:
                where[(name, w.variable[1])] = (block, text, w)
    raws = []
    for name, style_graph in World.from_store(store).graphs.items():
        for key, (labels, props) in style_graph.nodes.items():
            at = where.get((name, key))
            raws.append(
                {
                    "labels": _in_order(labels, at[2] if at else None),
                    "props": props,
                    "at": (
                        {"block": at[0], "line": at[1][: at[2].open].count("\n") + 1, "id": key}
                        if at
                        else {**first, "id": key}
                    ),
                }
            )
    raws.sort(key=lambda r: (r["at"]["block"], r["at"]["line"]))
    things = {i for i, (labels, _) in g.nodes.items() if not labels & SCHEMA_LABELS}
    nudges, checked = check_things(raws, {"graph": graph, "things": things})
    kept, direction, conflicts = settle_nudges(nudges, graph)
    # a style block named as a data graph: a reader that does not know STYLE merges it into the
    # data
    named = []
    for block in blocks:
        own = _graph_of(texts[block])
        if own and own in world.graphs:
            named.append(
                {
                    "graph": graph,
                    "block": block,
                    "line": 1,
                    "severity": "warning",
                    "message": f"this style block takes the data graph {own}'s name; it needs a "
                    "name of its own, never a data graph's",
                    "fix": f"name it {graph}_style: // graph: {graph}_style · STYLE {graph}",
                }
            )
    every = [*named, *problems, *_links(texts, blocks, graph), *checked, *conflicts]
    every.sort(key=lambda p: (p["block"], p["line"]))
    return {"nudges": kept, "direction": direction}, every
