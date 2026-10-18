"""A graph's nudges written into its layout source (editor spec §6), as the plugin's core writes
them (style-source.ts, nudgedSource), so a nudged graph is laid out the same by both, byte for byte
(python_honours_nudges). graph_svg re-exports it."""

from __future__ import annotations

import html
from collections.abc import Iterable, Mapping, Sequence

from graphspec.style.words import LOCKED


def nudged_source(
    dot: str, nudges: Sequence[Mapping], keys: Iterable[str], diagram: Mapping | None = None
) -> str:
    """The Graphviz source `dot` (from dot_source) with a graph's nudges (editor spec §6) written
    in before its last line, as the plugin's core writes them (style-source.ts, nudgedSource), so
    a nudged graph is laid out the same by both, byte for byte (python_honours_nudges): each
    beside a {rank=same; …} line and each before an invisible link, in the order written, after
    every link drawn — so Graphviz numbers the drawn links as before — then one box (a cluster)
    for each group label, in the order first written, its label in the kind caption's size and
    colour. nudges: as gql_profile.read_style gives them, each {word, thing, other, group}. A
    nudge naming a thing not among `keys` (the boxes drawn) is left out; so is a group when the
    plan `diagram` is lanes, which draw it inside its lane (diagram_types.typed_source). With
    nothing to add, `dot` is returned unchanged: with no nudges, the layout source as it is."""
    lanes = bool(diagram) and diagram["type"] == "lanes"
    drawn, added, groups = set(keys), [], {}
    for n in nudges:
        things = [k for k in (n.get("thing"), n.get("other")) if k is not None]
        if not things or not all(k in drawn for k in things):
            continue
        if n["word"] == "beside":
            added.append("  {rank=same; " + "; ".join(f'"{k}"' for k in things) + ";}")
        elif n["word"] == "before":
            other = things[1] if len(things) > 1 else ""
            added.append(f'  "{things[0]}" -> "{other}" [style=invis];')
        elif n["word"] == "group" and n.get("group") is not None and not lanes:
            groups.setdefault(n["group"], []).extend(things)
    # the label as an HTML-like label, entity-escaped as the boxes' own are: a backslash or a quote
    # is drawn as written
    for i, (label, members) in enumerate(groups.items()):
        added.append(
            f"  subgraph cluster_{i + 1} {{label=<{html.escape(label)}>; "
            f'fontname="{LOCKED["font"]}"; fontsize={LOCKED["kind_font_size"]}; '
            'fontcolor="#0000fe"; color="#0000fe"; style="rounded"; '
            + "".join(f'"{k}"; ' for k in members)
            + "}"
        )
    if not added:
        return dot
    end = dot.rfind("}")
    nudged = dot[:end] + "\n".join(added) + "\n" + dot[end:]
    # The layout source puts unlinked things of one kind on one rank. Without newrank, Graphviz
    # takes such things out of a group's box without a word. Only when a group is written, so any
    # other source stays the plugin's
    if not groups:
        return nudged
    at = nudged.find("{") + 1
    return nudged[:at] + "\n  newrank=true;" + nudged[at:]
