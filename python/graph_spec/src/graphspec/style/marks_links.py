"""A layout's links as drawing marks (editor spec §43, plugin_interface): each link's line, its
arrowheads and its label, and the order Graphviz writes them in. Part of marks.py, which hands in
its reading of the layout as `r`. The core's graphviz-marks.ts, `linkMarks`, step for step."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from graphspec.style.marks_json import arrowhead

INVISIBLE = re.compile(r"(^|,)\s*invis\s*(,|$)")
Mark = dict[str, Any]


def edges_of(
    r: Any, objects: Sequence[Mapping[str, Any]]
) -> list[tuple[int, int, int, dict[str, Any] | None]]:
    """Each link as its write order, its two ends and its part; None for a link not drawn."""
    g = r.g
    seen: dict[str, int] = {}
    edge_parts: list[tuple[int, int, int, dict[str, Any] | None]] = []
    for n, e in enumerate(g.get("edges") or []):
        tail, head = e["tail"], e["head"]
        frm = objects[tail]["name"] if tail < len(objects) else ""
        to = objects[head]["name"] if head < len(objects) else ""
        key = json.dumps([frm, to], separators=(",", ":"), ensure_ascii=False)
        count = seen.get(key, 0)
        seen[key] = count + 1
        eid = f"e:{key}#{count}"
        order = e["_gvid"] if e.get("_gvid") is not None else n
        # A link Graphviz draws no line for (style=invis) is left out on purpose, with its
        # arrowheads and label. Its count is used up all the same, so the links after it keep
        # their ids.
        line = next(
            (
                d
                for d in e.get("_draw_") or []
                if d.get("op") in ("b", "L") and d.get("points") is not None
            ),
            None,
        )
        if line is None or INVISIBLE.search(e.get("style") or ""):
            edge_parts.append((order, tail, head, None))
            continue
        ids = _link(r, e, line, eid, key, frm, to)
        ids += r.drawn(e.get("_ldraw_"), eid, key)
        title = f"{frm}{'--' if g.get('directed') is False else '->'}{to}"
        cls = f"edge {e['class']}" if e.get("class") else "edge"
        part_id = e["id"] if e.get("id") is not None else f"edge{n + 1}"
        edge_parts.append(
            (
                order,
                tail,
                head,
                {
                    "kind": "edge",
                    "id": part_id,
                    "className": cls,
                    "title": title,
                    "marks": ids,
                },
            )
        )
    return edge_parts


def _link(r, e, line, eid: str, key: str, frm: str, to: str) -> list[str]:
    """A link's line and arrowheads as marks: the tail's arrowhead drawn first, as Graphviz
    draws it."""
    ids: list[str] = []
    raw = [r.exact(x, y) for x, y in line["points"]]
    points = [r.at(x, y) for x, y in line["points"]]
    curve = line["op"] == "b" and (len(points) - 1) % 3 == 0
    moved = any(p != q for p, q in zip(raw, points, strict=True))
    looks = r.drawn(e.get("_draw_"), f"x:{eid}")
    shown = _taken(r, len(looks))
    mark: Mark = {"id": eid, "of": key, "from": frm, "to": to}
    mark["style"] = shown["style"].replace(".outline", "", 1) if shown else "link"
    mark.update({"kind": "link", "points": points})
    if curve:
        mark["curve"] = True
    if moved:
        mark["outline"] = {"points": raw, **({"curve": True} if curve else {})}
    if shown and shown.get("lineWidth") is not None:
        mark["lineWidth"] = shown["lineWidth"]
    mark["role"] = "link"
    r.marks.append(mark)
    ids.append(eid)
    for ops, end, near in (
        (e.get("_tdraw_"), "tail", points[0] if points else None),
        (e.get("_hdraw_"), "head", points[-1] if points else None),
    ):
        tip = arrowhead(ops, r.at, near)
        if tip is None:
            continue
        look = r.drawn(ops, f"x:{end}:{eid}")
        box = _taken(r, len(look))
        head: Mark = {
            "id": f"{end}:{eid}",
            "of": key,
            "style": box["style"] if box else "link",
            "kind": "arrowhead",
            **tip,
        }
        if box and box["kind"] == "box" and box.get("outline"):
            head["outline"] = box["outline"]
        if box and box.get("lineWidth") is not None:
            head["lineWidth"] = box["lineWidth"]
        r.marks.append(head)
        ids.append(head["id"])
    return ids


def _taken(r, n: int) -> Mark | None:
    """Takes the last `n` marks back off, giving the first: the look of a line drawn twice."""
    if n == 0:
        return None
    taken = r.marks[-n:]
    del r.marks[-n:]
    return taken[0]
