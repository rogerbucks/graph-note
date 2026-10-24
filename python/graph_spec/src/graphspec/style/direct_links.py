"""Direct links (editor spec §25, untangle_direct): each link one gentle curve from box to box,
the boxes moved aside so no link runs through a box it does not join. It is the core's
direct-links.ts, step for step, so both libraries draw the same links for the same layout
(direct-links-parity.test.js).

Graphviz places the boxes. In place of its routing, each link is one curve from box to box. A box
a link would pass through moves aside, just clear of it, and boxes moved into each other are
pushed apart again, a few rounds within a budget. Two links between the same two boxes bow apart.
A lone link bows a little toward the middle of the drawing. Each arrowhead lands on its box edge,
and the words sit by the curve (direct_words.py). It works on the marks marks.py reads from a
layout, and marks_svg.py writes them, so every part keeps its id, class and title."""

from __future__ import annotations

import math
from typing import Any

from graphspec.style.direct_curve import Curve, Placed, curve_of, hypot
from graphspec.style.direct_words import WORDS_OFF, js_length, word_spots

# How much room a link keeps from a box it passes, in pixels.
CLEARANCE = 10
# The room kept round a line or words at the edge of the drawing, in pixels.
EDGE = 2
# The room kept between two boxes pushed apart, in pixels.
BOX_GAP = 12
# The most rounds of moving boxes off links and apart again.
ROUNDS = 6
# The most box and link pairs looked at in all, so a big graph stays quick.
WORK_MOST = 4_000_000
# How far two links between the same boxes bow apart at their middle, as a share of their length.
BOW = 0.16
# How far a lone link bows toward the middle of the drawing, as a share of its length.
GENTLE = 0.08

Mark = dict[str, Any]


def _sign(x: float) -> float:
    return (x > 0) - (x < 0)


def direct_links(laid: dict[str, Any]) -> dict[str, Any]:
    """`laid` with its links drawn directly and its boxes moved off them. A self link keeps its
    loop, moved with its box."""
    marks: list[Mark] = laid["marks"]
    boxes: dict[str, Placed] = {}
    groups = {
        m["id"]: (m["x"], m["y"], m["x"] + m["width"], m["y"] + m["height"])
        for m in marks
        if m["kind"] == "group"
    }
    for m in marks:
        of = m.get("of")
        if m["kind"] == "box" and m.get("role") == "thing" and of is not None and of not in boxes:
            hw, hh = m["width"] / 2, m["height"] / 2
            boxes[of] = Placed(of, m["x"] + hw, m["y"] + hh, hw, hh, groups.get(m.get("group")))
    links = [
        m for m in marks if m["kind"] == "link" and m.get("from") in boxes and m.get("to") in boxes
    ]
    start = {k: (b.x, b.y) for k, b in boxes.items()}
    _settle(list(boxes.values()), links)

    # every mark of a moved box's part goes with it: its outline, its words, its pictures
    moved = {
        k: (b.x - start[k][0], b.y - start[k][1])
        for k, b in boxes.items()
        if b.x != start[k][0] or b.y != start[k][1]
    }
    layout = laid.get("layout")
    shift_of: dict[str, tuple[float, float]] = {}
    for part in (layout or {}).get("parts", []):
        if part["kind"] == "node" and part["title"] in moved:
            for i in part["marks"]:
                shift_of[i] = moved[part["title"]]
    for m in marks:
        by = shift_of.get(m["id"]) or (None if layout else moved.get(m.get("of")))
        if by and m["kind"] != "link":
            shift_of[m["id"]] = by
    # a self link's loop, its arrowheads and its words go with its box
    for link in links:
        by = moved.get(link["from"]) if link["from"] == link["to"] else None
        if by:
            for m in marks:
                if m["id"] == link["id"] or (
                    link.get("of") is not None and m.get("of") == link["of"]
                ):
                    shift_of[m["id"]] = by

    # links between the same two boxes, either way round: how many, and each one's place among them
    def pair_of(a: str, b: str) -> str:
        return f"{a}\n{b}" if a < b else f"{b}\n{a}"

    many: dict[str, int] = {}
    nth: dict[str, int] = {}
    for link in links:
        if link["from"] != link["to"]:
            p = pair_of(link["from"], link["to"])
            many[p] = many.get(p, 0) + 1
    every = list(boxes.values())
    sx = sy = 0.0
    for b in every:
        sx += b.x
        sy += b.y
    middle = (sx / max(1, len(every)), sy / max(1, len(every)))
    curves: dict[str, Curve] = {}
    for link in links:
        a, b = boxes[link["from"]], boxes[link["to"]]
        if a is b:
            continue
        pair = pair_of(a.key, b.key)
        i = nth.get(pair, 0)
        nth[pair] = i + 1
        side = 1 if a.key < b.key else -1
        count = many.get(pair, 1)
        base = _aside(a, b, every) or (0 if count > 1 else _gentle(a, b, side, middle, every))
        bow = (i - (count - 1) / 2) * BOW * side + base
        of = link.get("of")
        curves[link["id"] if of is None else of] = curve_of(a, b, bow)
    spots = word_spots(marks, boxes, curves)

    out: list[Mark] = []
    for m in marks:
        by = shift_of.get(m["id"])
        c = None if m.get("of") is None else curves.get(m["of"])
        if m["kind"] == "link" and c:
            # the line stops where an arrowhead begins, at either end that has one
            start_cut, end_cut = _heads_of(marks, m)
            rest = {k: v for k, v in m.items() if k != "outline"}
            out.append({**rest, "points": c.cubic(start_cut, end_cut), "curve": True})
        elif m["kind"] == "arrowhead" and c:
            at_start = m["id"].startswith("tail:") or c.nearer((m["x"], m["y"]))
            tip, angle = c.tip_at(at_start)
            rest = {k: v for k, v in m.items() if k != "outline"}
            out.append({**rest, "x": tip[0], "y": tip[1], "angle": angle})
        elif m["kind"] == "label" and c and m.get("of") not in boxes:
            x, y = spots.get(m["id"]) or c.words_at(0.5, m["size"] * WORDS_OFF)
            out.append({**m, "x": x, "y": y})
        else:
            out.append(_shifted(m, *by) if by else m)
    return _grown({**laid, "marks": out})


def _settle(boxes: list[Placed], links: list[Mark]) -> None:
    """Moves boxes off links they do not join and apart from each other, a few rounds, within the
    budget."""
    by_key = {b.key: b for b in boxes}
    rounds = max(1, min(ROUNDS, math.floor(WORK_MOST / max(1, len(boxes) * len(links)))))
    for _ in range(rounds):
        moves = 0
        for link in links:
            a, b = by_key.get(link["from"]), by_key.get(link["to"])
            if not a or not b or a is b:
                continue
            dx, dy = b.x - a.x, b.y - a.y
            long = hypot(dx, dy)
            if long < 1e-6:
                continue
            nx, ny = -dy / long, dx / long
            for c in boxes:
                if c is a or c is b:
                    continue
                # how far along the link the box's middle is, and how far to one side
                t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / (long * long)
                if t <= 0 or t >= 1:
                    continue
                off = (c.x - a.x) * nx + (c.y - a.y) * ny
                # the box's reach across the link: its half size seen square to it, and its room
                reach = abs(nx) * c.hw + abs(ny) * c.hh + CLEARANCE
                if abs(off) >= reach:
                    continue
                push = (1 if off >= 0 else -1) * (reach - abs(off))
                _move_to(c, c.x + nx * push, c.y + ny * push)
                moves += 1
        moves += _apart(boxes)
        if not moves:
            break


def _apart(boxes: list[Placed]) -> int:
    """Pushes apart boxes that overlap, along the way that parts them least, and says how many
    moved."""
    moves = 0
    ordered = sorted(boxes, key=lambda b: b.x - b.hw)
    for i, p in enumerate(ordered):
        for q in ordered[i + 1 :]:
            if q.x - q.hw >= p.x + p.hw + BOX_GAP:
                break
            ox = p.hw + q.hw + BOX_GAP - abs(q.x - p.x)
            oy = p.hh + q.hh + BOX_GAP - abs(q.y - p.y)
            if ox <= 0 or oy <= 0:
                continue
            # each moves half the overlap, along the way that is shorter
            if oy <= ox:
                s = (1 if q.y >= p.y else -1) * (oy / 2)
                _move_to(p, p.x, p.y - s)
                _move_to(q, q.x, q.y + s)
            else:
                s = (1 if q.x >= p.x else -1) * (ox / 2)
                _move_to(p, p.x - s, p.y)
                _move_to(q, q.x + s, q.y)
            moves += 1
    return moves


def _move_to(b: Placed, x: float, y: float) -> None:
    """Puts box `b`'s middle at (`x`, `y`), kept inside its group."""
    g = b.inside
    b.x = min(max(x, g[0] + b.hw), g[2] - b.hw) if g else x
    b.y = min(max(y, g[1] + b.hh), g[3] - b.hh) if g else y


def _aside(a: Placed, b: Placed, boxes: list[Placed]) -> float:
    """How far the link from `a` to `b` bows, as a share of its length, to clear a box still in
    its way: away from the box, just far enough. Nothing in its way, it does not bow."""
    dx, dy = b.x - a.x, b.y - a.y
    long = hypot(dx, dy)
    if long < 1e-6:
        return 0
    nx, ny = -dy / long, dx / long
    most = 0.0
    for c in boxes:
        if c is a or c is b:
            continue
        t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / (long * long)
        if t <= 0.05 or t >= 0.95:
            continue
        off = (c.x - a.x) * nx + (c.y - a.y) * ny
        reach = abs(nx) * c.hw + abs(ny) * c.hh + CLEARANCE
        if abs(off) >= reach:
            continue
        # a curve's middle moves half as far as its bend, scaled by how near the box is to it
        bend = (-_sign(off or 1) * 2 * (reach + abs(off))) / (4 * t * (1 - t)) / long
        if abs(bend) > abs(most):
            most = bend
    return max(-0.6, min(0.6, most))


def _gentle(a: Placed, b: Placed, side: int, middle, boxes: list[Placed]) -> float:
    """The gentle bow of a lone link with nothing in its way: toward the middle of the drawing. If
    that side would run through a box, it bows the other way; if both would, it stays straight."""
    dx, dy = b.x - a.x, b.y - a.y
    long = hypot(dx, dy)
    if long < 1e-6:
        return 0
    # the side the middle of the drawing is on, seen from the link's middle
    across = (middle[0] - (a.x + b.x) / 2) * -dy + (middle[1] - (a.y + b.y) / 2) * dx
    toward = side if abs(across) < 1e-6 * long * long else _sign(across)
    for bow in (toward * GENTLE, -toward * GENTLE):
        c = curve_of(a, b, bow)
        hits = any(
            o is not a
            and o is not b
            and any(
                abs(x - o.x) < o.hw and abs(y - o.y) < o.hh
                for x, y in (c.at(t) for t in (0.2, 0.35, 0.5, 0.65, 0.8))
            )
            for o in boxes
        )
        if not hits:
            return bow
    return 0


def _heads_of(marks: list[Mark], link: Mark) -> tuple[float, float]:
    """How long the arrowheads at the first and last ends of `link` are: none at an end, 0."""
    pts = link["points"]
    first, last = (pts[0], pts[-1]) if pts else (None, None)

    def gap(p, x, y):
        return hypot(p[0] - x, p[1] - y) if p else math.inf

    out = [0, 0]
    for h in marks:
        if h["kind"] == "arrowhead" and h.get("of") == link.get("of"):
            at_start = h["id"].startswith("tail:") or gap(first, h["x"], h["y"]) < gap(
                last, h["x"], h["y"]
            )
            out[0 if at_start else 1] = h["size"]
    return out[0], out[1]


def _shifted(m: Mark, dx: float, dy: float) -> Mark:
    """`m` moved by (`dx`, `dy`), its outline too."""

    def move(ps):
        return [[x + dx, y + dy] for x, y in ps]

    if m["kind"] == "link":
        return {**m, "points": move(m["points"])}
    out = {**m, "x": m["x"] + dx, "y": m["y"] + dy}
    if m.get("outline"):
        out["outline"] = {**m["outline"], "points": move(m["outline"]["points"])}
    return out


def _grown(laid: dict[str, Any]) -> dict[str, Any]:
    """`laid` with its space grown to hold every mark, should one have moved past its edge: every
    part, so a curve bowed past the edge is never cut off. A curve lies inside its points."""
    edges = [0.0, 0.0, laid["space"]["width"], laid["space"]["height"]]

    def take(ax: float, ay: float, bx: float, by: float) -> None:
        edges[:] = [min(edges[0], ax), min(edges[1], ay), max(edges[2], bx), max(edges[3], by)]

    for m in laid["marks"]:
        kind = m["kind"]
        if m["id"] == "background":
            continue
        if kind in ("box", "group"):
            take(m["x"], m["y"], m["x"] + m["width"], m["y"] + m["height"])
        elif kind == "link":
            for x, y in m["points"]:
                take(x - EDGE, y - EDGE, x + EDGE, y + EDGE)
        elif kind == "arrowhead":
            take(m["x"] - m["size"], m["y"] - m["size"], m["x"] + m["size"], m["y"] + m["size"])
        elif kind == "label":
            wide = m.get("maxWidth")
            wide = js_length(m["text"]) * m["size"] * 0.5 if wide is None else wide
            anchor = m.get("anchor")
            left = (
                m["x"]
                if anchor == "start"
                else m["x"] - wide
                if anchor == "end"
                else m["x"] - wide / 2
            )
            take(left - EDGE, m["y"] - m["size"], left + wide + EDGE, m["y"] + m["size"] * 0.3)
    x0, y0, x1, y1 = edges
    if x0 >= 0 and y0 >= 0 and x1 <= laid["space"]["width"] and y1 <= laid["space"]["height"]:
        return laid
    space = {"width": x1 - x0, "height": y1 - y0}
    marks = []
    for m in laid["marks"]:
        if m["id"] != "background":
            marks.append(_shifted(m, -x0, -y0))
        else:
            rest = {k: v for k, v in m.items() if k != "outline"}
            marks.append({**rest, "x": 0, "y": 0, **space})
    return {**laid, "space": space, "marks": marks}
