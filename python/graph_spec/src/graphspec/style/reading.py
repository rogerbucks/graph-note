"""A graph's style, read from its style blocks (editor spec §2, §6, §14, §15): every style block of
the graph read with the reader the data is read with, so what cannot be read is a problem on its
line and the rest is used; then each thing checked against the graph it styles, and the things
against each other. The core's style.ts readStyle, step for step, as far as what graph_svg draws
goes — nudges, properties shown inline, arrowheads hidden, the diagram type and how links move —
so graph_svg draws a styled graph
as the plugin does (python_honours_nudges, arrows_both_renderers). Reading it never raises and
never stops the drawing (broken_style_block): at worst the graph is drawn in the locked style.

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
from graphspec.rules.views import SCHEMA_LABELS, readings
from graphspec.style.checks import check_things
from graphspec.style.conflicts import (
    settle_arrows,
    settle_diagrams,
    settle_flows,
    settle_links,
    settle_nudges,
    settle_shown,
    settle_shows,
)


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


def _names(world, graph, g):
    """The names of graph `g`, as the core's style.ts namesOf gives them: its things, kinds and
    relationship types (written, or declared by its schema), and the property names of a kind's
    things, of one thing, or of a relationship type's links."""
    things = [i for i, (labels, _) in g.nodes.items() if not labels & SCHEMA_LABELS]

    def kinds_of(i):
        return [x for x in g.nodes[i][0] if x not in SCHEMA_LABELS]

    def properties(of):
        if of.get("type") is not None:
            return {k for _, t, _, p in g.edges if t == of["type"] for k in p}
        chosen = [
            i
            for i in things
            if (i == of["thing"] if of.get("thing") is not None else of.get("kind") in kinds_of(i))
        ]
        return {k for i in chosen for k in g.p(i) if k != "id"}

    declared = readings(g, world.schema_for(graph)[1])
    return {
        "graph": graph,
        "things": set(things),
        "kinds": {k for i in things for k in kinds_of(i)},
        "types": {t for _, t, _, _ in g.edges} | set(declared),
        "properties": properties,
    }


def _in_order(labels, written):
    """A thing's kinds in the order written, as the core's store keeps them; a set here."""
    order = [x for x in dict.fromkeys(written.labels if written else ()) if x in labels]
    return order + sorted(x for x in labels if x not in order)


def read_style(
    texts: Sequence[str], graph: str, world: World
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """The style of `graph`: every style block of the note for it (`// graph: <name> · STYLE
    <graph>`), read as the data is, merged, and checked against the graph as the note reads it
    (`world`, from read_for_drawing's store). Returns ({nudges, direction, shows, arrows,
    diagrams, flows, links, shown, pictures}, problems): each nudge {word, thing, other, group,
    direction as written, at: {block, line, id}}; each Show {property, kind, thing or type, view
    (if any), inline: 'on' or 'off', at}; each Arrows {arrowheads: 'show' or 'hide', view and type
    (if any), at}; each Diagram {type, view and relationship (if any), at}; each Flow {motion:
    'dashes', 'dot' or 'still', means, view and type (if any), at}; each Links {routing, merge and
    view (if any), at}; each Picture {property, kind or thing, view (if any), at}; only those
    sound and in no conflict; for each view saved as shown, the View menu's
    switches saved with it ({view: {labels, hubs, groups, merge: 'on' or 'off', as written}}); the
    direction a direction nudge sets, or None; and each problem {graph, block, line, severity,
    message, fix}, the block's index in `texts` and its line. The problems are the core's, word for
    word, for everything but a Look, ViewStyle or Shown: of those only the keys, and a Shown's view
    and switches, are checked (graphspec/style/checks.py), so the core's other problems with them
    are not given here; nor are the core's edits (replace, span). Nothing is ever written to the
    data."""
    blocks = [i for i, t in enumerate(texts) if style_of(t) == graph]
    first = {"block": blocks[0] if blocks else 0, "line": 1, "id": ""}
    style: dict[str, Any] = {
        "nudges": [],
        "direction": None,
        "shows": [],
        "arrows": [],
        "diagrams": [],
        "flows": [],
        "links": [],
        "shown": {},
        "pictures": [],
    }
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
    c = check_things(raws, _names(world, graph, g))
    checked = c["problems"]
    kept, direction, conflicts = settle_nudges(c["nudges"], graph)
    shows, show_conflicts = settle_shows(c["shows"], graph)
    arrows, arrow_conflicts = settle_arrows(c["arrows"], graph)
    diagrams, diagram_conflicts = settle_diagrams(c["diagrams"], graph)
    flows, flow_conflicts = settle_flows(c["flows"], graph)
    links, link_conflicts = settle_links(c["links"], graph)
    shown, shown_conflicts = settle_shown(c["shown"], graph)
    conflicts = [
        *conflicts,
        *show_conflicts,
        *arrow_conflicts,
        *diagram_conflicts,
        *flow_conflicts,
        *link_conflicts,
        *shown_conflicts,
    ]
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
    chosen = {"nudges": kept, "direction": direction, "shows": shows, "arrows": arrows}
    # a box's picture is the most particular Picture's, the first of two alike: none conflicts
    chosen = {**chosen, "diagrams": diagrams, "flows": flows, "pictures": c["pictures"]}
    return {**chosen, "links": links, "shown": shown}, every
