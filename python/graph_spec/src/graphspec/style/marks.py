"""Graphviz's layout as drawing marks (editor spec §43, plugin_interface): the one picture format
every diagram type gives back. Read as JSON, Graphviz's layout gives each shape, line and text it
draws, and this turns them into marks. It is the core's graphviz-marks.ts, step for step, so
both libraries give the same marks for the same layout (graphviz-marks-parity.test.js). It reads
a layout already made: Graphviz is run by the caller (`dot -Tjson`).

- Graphviz counts points from the bottom, in points. Marks count from the top, in CSS pixels: 4/3
  of a point.
- Each shape keeps the exact outline Graphviz drew.
- Each id starts with what it marks: `t:` a thing, `g:` a group, `e:` a link, `l:` a label,
  `head:` and `tail:` an arrowhead, `s1:` and on any other shape.
- How a mark looks is a style token, never a colour. Each stand-in colour the layout is written in
  is read back as the token it stands for (`colour_token`).

A mark is a dict with the same keys as the core's, such as `maxWidth` and `lineWidth`, so the two
can be compared as they are."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

from graphspec.style.marks_links import INVISIBLE, edges_of
from graphspec.style.marks_json import (
    PX,
    Point,
    colour_token,
    js_number,
    known,
    shape_style,
)

# Graphviz's shapes, by the outline drawn for each. Any other is drawn as a plain box.
SHAPES = {
    "box": "rect",
    "rect": "rect",
    "rectangle": "rect",
    "square": "rect",
    "ellipse": "ellipse",
    "oval": "ellipse",
    "circle": "ellipse",
    "point": "ellipse",
    "diamond": "diamond",
    "cylinder": "cylinder",
    "note": "note",
    "hexagon": "hexagon",
}
_ANCHORS = {"l": "start", "c": "middle", "r": "end"}
_LINE_WIDTH = re.compile(r"^setlinewidth\(([\d.]+)\)$")
Mark = dict[str, Any]


def layout_marks(g: Mapping[str, Any]) -> dict[str, Any]:
    """The marks Graphviz's layout `g` (its `json` format) gives, the space they need, and how
    Graphviz's own SVG holds them: its room round the drawing, its top left and its parts."""
    return _Reader(g).read()


class _Reader:
    """One reading of a layout: its space, the marks so far, and each owner's counts."""

    def __init__(self, g: Mapping[str, Any]) -> None:
        self.g = g
        self.pad = js_number(g.get("pad", "0.0555")) * 72
        # JSON gives the bounding box to five figures only. The page Graphviz fills is given to two
        # places, so it is read instead. The page holds the room round the drawing only when the
        # graph sets its pad.
        page = next(
            (
                d["points"]
                for d in g.get("_draw_") or ()
                if d.get("op") == "P" and d.get("points") is not None
            ),
            None,
        )
        inset = 0 if g.get("pad") is None else self.pad
        if page:
            xs, ys = [p[0] for p in page], [p[1] for p in page]
            box = [min(xs) + inset, min(ys) + inset, max(xs) - inset, max(ys) - inset]
        else:
            box = [float(n) for n in (g.get("bb") or "").split(",")]
        self.x0, self.y0, self.x1, self.y1 = (box + [0, 0, 0, 0])[:4]
        self.space = {"width": (self.x1 - self.x0) * PX, "height": (self.y1 - self.y0) * PX}
        self.marks: list[Mark] = []
        self.lost = False
        self.counts: dict[str, dict[str, int]] = {}

    def exact(self, x: float, y: float) -> Point:
        return [(x - self.x0) * PX, (self.y1 - y) * PX]

    def at(self, x: float, y: float) -> Point:
        ex, ey = self.exact(x, y)
        return [min(self.space["width"], max(0, ex)), min(self.space["height"], max(0, ey))]

    def inside(self, points: Sequence[Point]) -> dict[str, float]:
        """The box `points` cover, kept inside the space: a shape can reach a little past it."""
        w_max, h_max = self.space["width"], self.space["height"]
        xs, ys = [p[0] for p in points], [p[1] for p in points]
        left = min(max(0, min(xs)), w_max)
        top = min(max(0, min(ys)), h_max)
        w = min(max(xs), w_max) - left
        h = min(max(ys), h_max) - top
        return {"x": left, "y": top, "width": max(w, 0.01), "height": max(h, 0.01)}

    def drawn(self, ops, owner: str, of: str | None = None, first=None) -> list[str]:
        """Each step of `ops` as marks, ids made from `owner`; the first shape is `first`'s, when
        given. Returns their ids."""
        ids: list[str] = []
        ops = ops or []
        if any(o.get("op") == "F" for o in ops) and not any(o.get("op") == "T" for o in ops):
            self.lost = True
        pen = fill = face = width = None
        dashed, size = False, 14
        count = self.counts.setdefault(owner, {"shapes": 0, "lines": 0})
        extra = {} if of is None else {"of": of}

        def push(m: Mark) -> None:
            self.marks.append(m)
            ids.append(m["id"])

        for o in ops:
            op = o.get("op")
            if op in ("c", "C") and not known(o.get("color")):
                self.lost = True
            if op == "c":
                pen = o.get("color")
            elif op == "C":
                fill = o.get("color")
            elif op == "F":
                size = o["size"] if o.get("size") is not None else size
                face = o.get("face")
            elif op == "S" and o.get("style") == "dashed":
                dashed = True
            elif op == "S" and o.get("style") == "solid":
                dashed = False
            elif op == "S":
                w = _LINE_WIDTH.match(o.get("style") or "")
                if w:
                    width = None if float(w.group(1)) == 1 else float(w.group(1)) * PX
            elif op == "T" and o.get("pt") is not None and o.get("text"):
                x, y = self.at(o["pt"][0], o["pt"][1])
                n = count["lines"]
                count["lines"] += 1
                mark = {
                    "id": f"l:{owner}" if n == 0 else f"l{n}:{owner}",
                    "style": colour_token(pen),
                    "kind": "label",
                    "x": x,
                    "y": y,
                    "text": o["text"],
                    "size": size * PX,
                    "anchor": _ANCHORS.get(o.get("align") or "c", "middle"),
                }
                if o.get("width"):
                    mark["maxWidth"] = o["width"] * PX
                if face:
                    mark["font"] = face
                push({**mark, **extra})
            elif op in ("P", "p", "B", "b", "E", "e") and (
                o.get("points") is not None or o.get("rect") is not None
            ):
                push(self._shape(o, op, count, owner, fill, pen, dashed, width, extra, first))
        return ids

    def _shape(self, o, op, count, owner, fill, pen, dashed, width, extra, first) -> Mark:
        """One shape step as a box mark, keeping the outline Graphviz drew."""
        filled = op == op.upper()
        curve = op in ("B", "b")
        rect = o.get("rect")
        if rect is not None:
            points = [
                self.exact(rect[0] - rect[2], rect[1] + rect[3]),
                self.exact(rect[0] + rect[2], rect[1] - rect[3]),
            ]
        else:
            points = [self.exact(x, y) for x, y in o.get("points") or []]
        outline: dict[str, Any] = {"points": points}
        if curve and (len(points) - 1) % 3 == 0:
            outline["curve"] = True
        n = count["shapes"]
        count["shapes"] += 1
        box: Mark = {
            "id": owner if n == 0 else f"s{n}:{owner}",
            "style": shape_style(fill if filled else None, pen, dashed),
            "kind": "box",
            **self.inside(points),
        }
        if rect is not None:
            box["shape"] = "ellipse"
        box["outline"] = outline
        if width is not None:
            box["lineWidth"] = width
        box.update(extra)
        return first(box) if n == 0 and first else box

    def read(self) -> dict[str, Any]:
        g, pad, space = self.g, self.pad, self.space
        parts: list[dict[str, Any]] = []
        # Graphviz's own SVG fills the whole page, the room round the drawing too, unless its
        # background is transparent
        graph_marks: list[str] = []
        background = colour_token("#ffffff" if g.get("bgcolor") is None else g["bgcolor"])
        if background != "none":
            left, top = -pad * PX, -pad * PX
            r, b = space["width"] + pad * PX, space["height"] + pad * PX
            page = [[left, b], [left, top], [r, top], [r, b]]
            mark = {"id": "background", "style": background, "kind": "box", **self.inside(page)}
            self.marks.append({**mark, "outline": {"points": page}})
            graph_marks.append("background")
        graph_marks += self.drawn(g.get("_ldraw_"), "g:")
        name = g.get("name")
        title = name if name and not name.startswith("%") else ""
        parts.append(
            {"kind": "graph", "id": "", "className": "", "title": title, "marks": graph_marks}
        )
        objects = g.get("objects") or []
        subgraphs = g.get("_subgraph_cnt")
        if subgraphs is None:
            subgraphs = sum(1 for o in objects if not o.get("pos"))
        self._clusters(objects, subgraphs, parts)
        node_parts = self._nodes(objects, subgraphs)
        edge_parts = edges_of(self, objects)
        # Graphviz writes each thing, then for each of its links out the thing at the other end and
        # then the link. A link not drawn still writes the thing at its other end first.
        written: set[int] = set()

        def write_node(i: int) -> None:
            if i in node_parts and i not in written:
                parts.append(node_parts[i])
            written.add(i)

        edge_parts.sort(key=lambda e: e[0])
        for i in range(subgraphs, len(objects)):
            write_node(i)
            for _, tail, head, part in edge_parts:
                if tail == i:
                    write_node(head)
                    if part:
                        parts.append(part)
        layout: dict[str, Any] = {"pad": pad * PX, "origin": [self.x0, self.y1], "parts": parts}
        if self.lost:
            layout["lost"] = True
        return {"space": space, "marks": self.marks, "layout": layout}

    def _clusters(self, objects, subgraphs: int, parts: list) -> None:
        """Each cluster, then the clusters in it, numbered by their place among the subgraphs."""
        inner = {c for o in objects[:subgraphs] for c in o.get("subgraphs") or []}

        def cluster(i: int) -> None:
            if i >= len(objects):
                return
            o = objects[i]
            if o["name"].startswith("cluster") and o.get("bb"):
                gid = f"g:{o['name']}"
                draw = o.get("_draw_") or []
                pen = next((d.get("color") for d in draw if d.get("op") == "c"), None)
                dashed = any(d.get("op") == "S" and d.get("style") == "dashed" for d in draw)
                style = colour_token(pen) + (".dashed" if dashed else "")

                def group(m: Mark) -> Mark:
                    return (
                        {**m, "kind": "group", "style": style, "role": "group"}
                        if m["kind"] == "box"
                        else m
                    )

                ids = self.drawn(o.get("_draw_"), gid, None, group) + self.drawn(
                    o.get("_ldraw_"), gid
                )
                cls = f"cluster {o['class']}" if o.get("class") else "cluster"
                part_id = o["id"] if o.get("id") is not None else f"clust{i + 1}"
                parts.append(
                    {
                        "kind": "cluster",
                        "id": part_id,
                        "className": cls,
                        "title": o["name"],
                        "marks": ids,
                    }
                )
            for c in o.get("subgraphs") or []:
                cluster(c)

        for i in range(subgraphs):
            if i not in inner:
                cluster(i)

    def _nodes(self, objects, subgraphs: int) -> dict[int, dict[str, Any]]:
        """Each thing drawn, as its part, by its place among the objects."""
        node_parts: dict[int, dict[str, Any]] = {}
        for n, o in enumerate(objects[subgraphs:]):
            if INVISIBLE.search(o.get("style") or ""):
                continue
            tid = f"t:{o['name']}"
            shape = (
                "round"
                if "rounded" in (o.get("style") or "")
                else SHAPES.get(o.get("shape") or "ellipse", "rect")
            )
            # a label of several lines is one T step a line: a screen reader says them all, as one
            # name
            lines = [
                d["text"] for d in o.get("_ldraw_") or [] if d.get("op") == "T" and d.get("text")
            ]
            name = {"name": " ".join(lines)} if lines else {}

            def thing(m: Mark, shape=shape, name=name) -> Mark:
                if m["kind"] != "box":
                    return m
                return {
                    **m,
                    "shape": "ellipse" if m.get("shape") == "ellipse" else shape,
                    "role": "thing",
                    **name,
                }

            ids = self.drawn(o.get("_draw_"), tid, o["name"], thing) + self.drawn(
                o.get("_ldraw_"), tid, o["name"]
            )
            cls = f"node {o['class']}" if o.get("class") else "node"
            part_id = o["id"] if o.get("id") is not None else f"node{n + 1}"
            node_parts[subgraphs + n] = {
                "kind": "node",
                "id": part_id,
                "className": cls,
                "title": o["name"],
                "marks": ids,
            }
        return node_parts
