"""Arrowheads hidden or shown (editor spec §15): which links a drawing draws without their
arrowheads, as its style graph chooses for the whole graph, a view or a relationship type
(arrows_switchable), and that choice written into the layout source. A link keeps its arrowhead
unless the style graph hides it (arrows_shown_unless_hidden), and only the arrowhead changes: each
link is laid out from the same ends. The core's arrows.ts, function for function, so graph_svg
hides them as the plugin does (arrows_both_renderers)."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence

# A line of a layout source that draws a link (never one of the nudges' invisible links).
LINK_LINE = re.compile(r'^ {2}"[^"]*" -> "[^"]*" \[label=')


def arrows_shown(arrows: Iterable[dict], view: str | None, type_: str) -> bool:
    """Whether links of `type_` are drawn with their arrowheads in `view` (None: the whole graph):
    as the most particular choice the style graph makes for them says — one for the view over one
    for the whole graph, then one for the type over one for every link, the first written when two
    are as particular — and shown when it makes none. arrows: as read_style gives them."""
    chosen = None
    for a in arrows:
        if (a.get("view") is not None and a["view"] != view) or (
            a.get("type") is not None and a["type"] != type_
        ):
            continue
        rank = (2 if a.get("view") is not None else 0) + (1 if a.get("type") is not None else 0)
        if chosen is None or rank > chosen[1]:
            chosen = (a["arrowheads"] == "hide", rank)
    return not (chosen and chosen[0])


def arrowless(types: Sequence[str], arrows: Iterable[dict], view: str | None = None) -> list[int]:
    """The links drawn without their arrowheads in `view`, as indexes into `types`: each link's
    relationship type, in the order the layout source draws them."""
    arrows = list(arrows)
    return [i for i, t in enumerate(types) if not arrows_shown(arrows, view, t)]


def arrowless_source(dot: str, hidden: Sequence[int]) -> str:
    """The Graphviz source `dot` with each link of `hidden` (indexes of its link lines, in order)
    drawn without its arrowhead: dir=none, in place of the dir=back of a link laid out from its far
    end. With none, `dot` unchanged."""
    if not hidden:
        return dot
    chosen, n, out = set(hidden), -1, []
    for line in dot.split("\n"):
        if LINK_LINE.match(line):
            n += 1
            if n in chosen:
                if line.endswith(", dir=back];"):
                    line = line[: -len("dir=back];")] + "dir=none];"
                else:
                    line = line[:-2] + ", dir=none];"
        out.append(line)
    return "\n".join(out)
