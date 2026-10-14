"""A picture on a box (editor spec §18, animated_image_shown): where its style asks, a thing's
image is drawn on its box. A Picture in the style graph names the property that holds the image,
for every thing of a kind or one thing, in the whole graph or a view; the most particular Picture
for a box decides. The layout source keeps room for it: a fixed square at the top of the box's
label, filled with PICTURE_MARK, which a host fills with the image. The core's picture.ts,
function for function, so graph_svg keeps the same room as the plugin, byte for byte; graph_svg
draws the square itself and loads no image."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence

from graphspec.style.words import LOCKED

# The side of the square kept for a picture, in Graphviz's points.
PICTURE_SIZE = 48
# The colour the square kept for a picture is filled with: one no theme gives, so a host finds it.
PICTURE_MARK = "#0005fe"
# What a Picture is for: one kind, or one thing.
PICTURE_FOR = "a Picture is for one kind or one thing"

# How a box's line opens its label, a table.
_BOX_LABEL = "[label=<<table "
# The row kept for a picture: a fixed square, marked, then the gap a kind caption has below it.
_ROW = (
    f'<tr><td fixedsize="true" width="{PICTURE_SIZE}" height="{PICTURE_SIZE}" '
    f'bgcolor="{PICTURE_MARK}"></td></tr>'
    f'<tr><td cellpadding="0" height="{LOCKED["caption_gap"]}"></td></tr>'
)


def picture_for(
    pictures: Iterable[Mapping], view: str | None, key: str, kinds: Sequence[str]
) -> Mapping | None:
    """The Picture that decides a box's picture in `view`: of those for its thing or one of its
    kinds, in scope, the most particular — one for the view over one for the whole graph, then one
    for the thing over one for its kind — and the first written of two as particular; None when
    none is for it. pictures: as read_style gives them."""
    chosen = None
    for p in pictures:
        if p.get("view") is not None and p["view"] != view:
            continue
        if p.get("thing") is not None:
            if p["thing"] != key:
                continue
        elif p.get("kind") is None or p["kind"] not in kinds:
            continue
        rank = (2 if p.get("view") is not None else 0) + (1 if p.get("thing") is not None else 0)
        if chosen is None or rank > chosen[1]:
            chosen = (p, rank)
    return chosen[0] if chosen else None


def pictures_for(
    boxes: Sequence[tuple], pictures: Iterable[Mapping], view: str | None = None
) -> list[dict]:
    """The boxes drawn with a picture in `view` (None: the whole graph), in the order drawn, as
    {index, key, property, value}: each whose Picture's property holds text. boxes: [(key, kinds
    joined by ' · ', properties)], as drawn.graph_parts gives them."""
    pictures = list(pictures)
    if not pictures:
        return []
    out = []
    for index, (key, kind, props) in enumerate(boxes):
        p = picture_for(pictures, view, key, kind.split(" · ") if kind else [])
        value = props.get(p["property"]) if p else None
        if p and isinstance(value, str):
            out.append({"index": index, "key": key, "property": p["property"], "value": value})
    return out


def picture_source(dot: str, pictures: Sequence[Mapping]) -> str:
    """The Graphviz source `dot` with room kept for each picture of `pictures` (each {key, …}):
    its box's label opened by the marked square and a gap, above the kind caption and the text.
    With none, `dot` unchanged."""
    if not pictures:
        return dot
    opens = {f'  "{p["key"]}" {_BOX_LABEL}' for p in pictures}
    out = []
    for line in dot.split("\n"):
        at = line.find(_BOX_LABEL)
        if at >= 0 and line[: at + len(_BOX_LABEL)] in opens:
            end = line.find(">", at + len(_BOX_LABEL)) + 1
            line = line[:end] + _ROW + line[end:]
        out.append(line)
    return "\n".join(out)
