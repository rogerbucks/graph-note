"""A graph ready for graph_svg.render (editor spec §3, §6, §14, §15, §25): its boxes and its
written links, chosen as the core chooses them — the vault's graph-spec-draw.py and the parity
tests did this by hand — each link read in its schema's words, the graph's own or a shared one's,
each with its properties; its style read and applied for a view or the whole graph; and what its
View menu folds and merges, and how its links are routed (graphspec/style/folding.py). For what it
draws,
one call gives the core's source byte for byte: graph_svg.render(**render_args(texts, graph,
view)). It does not draw the links the core guesses from a near miss, nor read a misspelt type as
the type it is taken for: those estimates are the plugin's alone (layout.ts, drawingSource)."""

from __future__ import annotations

import sys
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from graphspec.reader.drawing import read_for_drawing
from graphspec.rules.plain_graph import World
from graphspec.rules.views import SCHEMA_LABELS, _word, readings
from graphspec.style.arrows import arrowless
from graphspec.style.diagram_types import diagram_for
from graphspec.style.flow import flow_links
from graphspec.style.folding import drawn_groups, fold_plan, links_of, starting_switches
from graphspec.style.inline import inline_rows
from graphspec.style.picture import pictures_for
from graphspec.style.reading import read_style

# The properties that give a thing its text, in the order the drawing chooses among them.
TEXT_KEYS = ("name", "title", "text", "label")


def graph_parts(world: World, graph: str, problems: Iterable[dict] = ()) -> dict[str, Any]:
    """The parts of `graph` (in `world`, from read_for_drawing's store) to draw: {nodes: [(key,
    kinds joined by ' · ', text)], edges: [(source key, reading, target key)], suggested: the keys
    drawn under a suggested name (from read_for_drawing's `problems`), boxes: [(key, kinds,
    properties)], links: [(relationship type, properties)]}, boxes and links in the order drawn —
    every thing but the schema's, and every link between two of them."""
    g = world[graph]
    ids = [i for i, (labels, _) in g.nodes.items() if not labels & SCHEMA_LABELS]
    # Each link in its schema's words. That is the graph's own schema, else the shared schema it
    # names. The core reads them so (drawing.ts), and reading.py's _names finds its types so.
    drawn, words = set(ids), readings(g, world.schema_for(graph)[1])

    def text(i):
        p = g.p(i)
        return next((p[k] for k in TEXT_KEYS if isinstance(p.get(k), str) and p[k]), i)

    def kind(i):
        return " · ".join(sorted(x for x in g.nodes[i][0] if x not in SCHEMA_LABELS))

    links = [(s, t, d, p) for s, t, d, p in g.edges if s in drawn and d in drawn]
    return {
        "nodes": [(i, kind(i), text(i)) for i in ids],
        "edges": [(s, _word(words, t), d) for s, t, d, _ in links],
        "suggested": {
            p["suggested"] for p in problems if p.get("suggested") and p["graph"] == graph
        },
        "boxes": [(i, kind(i), g.p(i)) for i in ids],
        "links": [(t, p) for _, t, _, p in links],
    }


def without_hidden(parts: Mapping[str, Any], plan: Mapping | None) -> Mapping[str, Any]:
    """`parts` (graph_parts) without the things a timeline's `plan` hides (timeline_show), and the
    links that touch them — the core's style-source.ts withoutHidden."""
    gone = set((plan or {}).get("hidden", ()))
    if not gone:
        return parts
    kept = [i for i, (s, _, d) in enumerate(parts["edges"]) if s not in gone and d not in gone]
    return {
        **parts,
        "nodes": [n for n in parts["nodes"] if n[0] not in gone],
        "edges": [parts["edges"][i] for i in kept],
        "boxes": [b for b in parts["boxes"] if b[0] not in gone],
        "links": [parts["links"][i] for i in kept],
    }


def render_args(
    texts: Sequence[str],
    graph: str,
    view: str | None = None,
    switches: Mapping[str, bool] | None = None,
    opened: Mapping[str, Sequence[str]] | None = None,
) -> dict[str, Any]:
    """The arguments graph_svg.render draws `graph` of a note's gql blocks (`texts`) with, as
    the plugin draws it in `view` (None: the whole graph): its boxes and links, the keys drawn
    under a suggested name, and its style — nudges, direction, the links drawn without their
    arrowheads, the properties shown inline, the links that move (§7, flow_links), the boxes drawn
    with a picture (§18, pictures_for), and the plan of
    the diagram type it is drawn as, while
    the data fits the one chosen (a network, with no plan, otherwise); a timeline leaves out the
    things it hides. A table chosen is drawn as a
    network, as only the plugin draws a table, and a note on stderr says so. How its links are
    routed (§25; None: curved). And, only when `switches` is given, what a View menu folds and
    merges: the switches start as the plugin's settings start a graph, links merged as the style
    graph says and a view as it was saved as shown (folding.starting_switches), then as `switches`
    turns them ({hubs, groups, merge: bool}; {} for as they start), with the busy hubs and groups
    `opened` again ({hubs: keys, groups: labels}). With no switches nothing is folded or merged,
    as an export and the Claude Code pane draw a graph."""
    store, problems = read_for_drawing(texts)
    world = World.from_store(store)
    parts = graph_parts(world, graph, problems)
    style = read_style(texts, graph, world)[0]
    choice = diagram_for(parts, style["diagrams"], view, style["nudges"])
    parts = without_hidden(parts, choice.get("plan"))
    if choice["drawn"] == "table":
        print(
            f"graph_svg: graph {graph} is chosen to be drawn as a table, which only the plugin "
            "draws; it is drawn here as a network",
            file=sys.stderr,
        )
    keys = [key for key, _, _ in parts["nodes"]]
    # with no View menu, as an export and the Claude Code pane draw a graph, nothing is folded
    folding = (
        None
        if switches is None
        else fold_plan(
            keys,
            [(s, d) for s, _, d in parts["edges"]],
            drawn_groups(style["nudges"], keys, choice.get("plan")),
            {**starting_switches(style, view), **switches, "opened": opened or {}},
        )
    )
    routing = links_of(style, view)["routing"]
    return {
        "nodes": parts["nodes"],
        "edges": parts["edges"],
        "suggested": parts["suggested"],
        "nudges": style["nudges"],
        "direction": style["direction"],
        "arrowless": arrowless([t for t, _ in parts["links"]], style["arrows"], view),
        "inline": inline_rows(parts["boxes"], parts["links"], style["shows"], view),
        "diagram": choice.get("plan"),
        "flow": flow_links([t for t, _ in parts["links"]], style["flows"], view),
        "folding": folding,
        "routing": None if routing == "curved" else routing,
        "pictures": pictures_for(parts["boxes"], style["pictures"], view),
    }
