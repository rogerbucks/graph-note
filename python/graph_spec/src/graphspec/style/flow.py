"""Links that show flow by moving (editor spec §7, links_show_flow): which links of a drawing move
— dashes running along them, or a dot travelling along them — as its style graph's Flows choose
for every link or a relationship type, in the whole graph or a view (flow_in_style_graph), and
that written into the layout source: each moving link's label opened by its icon, the classes a
style sheet moves it by, and dashes drawn dashed, so they show when still (motion_not_alone). The
core's link-flow.ts, function for function, so graph_svg writes the source the plugin does; the
movement itself is the host's style sheet, still under reduced motion."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence

from graphspec.style.arrows import LINK_LINE

# The icon on a moving link's label, one for each way it moves: what it means is in the legend.
FLOW_ICONS = {"dashes": "⇢", "dot": "•"}
# What a Flow that moves links lacks when it does not say what the movement means.
MEANS_NEEDED = (
    "a link that moves must say what its movement means, so it is never told by movement alone"
)

# A link line laid out from its far end (dir=back), so its line runs against the link.
_BACK = ", dir=back];"
# The opening of a link line, up to its label's text, and that text.
_LABEL = re.compile(r'^( {2}"[^"]*" -> "[^"]*" \[label=")([^"]*)"')


def flow_for(flows: Iterable[dict], view: str | None, type_: str) -> dict | None:
    """How links of `type_` move in `view` (None: the whole graph), as {motion, means}: as the
    most particular Flow for them says — one for the view over one for the whole graph, then one
    for the type over one for every link, the first written when two are as particular — and None
    when they are still, as they are when no Flow says otherwise. flows: as read_style gives
    them."""
    chosen = None
    for f in flows:
        if (f.get("view") is not None and f["view"] != view) or (
            f.get("type") is not None and f["type"] != type_
        ):
            continue
        rank = (2 if f.get("view") is not None else 0) + (1 if f.get("type") is not None else 0)
        if chosen is None or rank > chosen[1]:
            chosen = (f, rank)
    if chosen is None or chosen[0]["motion"] == "still":
        return None
    return {"motion": chosen[0]["motion"], "means": chosen[0].get("means") or ""}


def flow_links(types: Sequence[str], flows: Iterable[dict], view: str | None = None) -> list[dict]:
    """The links that move in `view`, as {index, motion, means}: `types` is each link's
    relationship type, in the order the layout source draws them."""
    flows = list(flows)
    if not flows:
        return []
    out = []
    for i, t in enumerate(types):
        f = flow_for(flows, view, t)
        if f:
            out.append({"index": i, **f})
    return out


def flow_source(dot: str, flow: Sequence[dict]) -> str:
    """The Graphviz source `dot` with each link of `flow` (by index of its link lines, in order)
    marked as moving: its label opened by its icon, the classes thoughtknot-flow, -dashes or -dot,
    and -back when its line runs against it, and dashes drawn dashed. With none, `dot`
    unchanged."""
    if not flow:
        return dot
    by, n, out = {f["index"]: f for f in flow}, -1, []
    for line in dot.split("\n"):
        if LINK_LINE.match(line):
            n += 1
            f = by.get(n)
            if f:
                back = " thoughtknot-flow-back" if line.endswith(_BACK) else ""
                cls = f"thoughtknot-flow thoughtknot-flow-{f['motion']}{back}"
                dashed = ", style=dashed" if f["motion"] == "dashes" else ""
                icon = FLOW_ICONS[f["motion"]]
                line = _LABEL.sub(
                    lambda m, icon=icon, cls=cls, dashed=dashed: (
                        f'{m.group(1)}{icon} {m.group(2)}", class="{cls}"{dashed}'
                    ),
                    line,
                    count=1,
                )
        out.append(line)
    return "\n".join(out)
