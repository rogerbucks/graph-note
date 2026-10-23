"""A large graph laid out quickly (editor spec §11, large_drawn_quick), as the plugin's core does
(render.ts): past QUICK_LAYOUT things, once, in one direction, with Graphviz's quick settings."""

from collections.abc import Mapping

from graphspec.style import diagram_types
from graphspec.style.words import DIRECTIONS

# Past this many things a graph is laid out quickly (render.ts, QUICK_LAYOUT).
QUICK_LAYOUT = 300
# Graphviz's quick settings: links keep their curves, rows placed and uncrossed with less effort
# (render.ts, QUICK_SETTINGS).
QUICK_SETTINGS = "  graph [nslimit=0.5, mclimit=0.05];"


def quick_source(dot: str, things: int) -> str:
    """The source `dot` of a graph of `things`, with the quick settings after its first line when
    there are more than QUICK_LAYOUT; else `dot` unchanged. A routing chosen comes after, so it
    still wins."""
    if things <= QUICK_LAYOUT:
        return dot
    lines = dot.split("\n")
    lines.insert(1, QUICK_SETTINGS)
    return "\n".join(lines)


def directions(
    direction: str | None = None, diagram: Mapping | None = None, things: int = 0
) -> list[str]:
    """The directions a drawing of `things` is laid out in (diagram_types.directions), as the
    core's render.ts chooses them: with no direction or diagram type set, a graph of more than
    QUICK_LAYOUT things is laid out only in the first the style lists."""
    if not (direction and direction in DIRECTIONS) and not diagram and things > QUICK_LAYOUT:
        return list(DIRECTIONS[:1])
    return diagram_types.directions(direction, diagram)
