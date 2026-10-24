"""A built-in drawing's SVG, written from its marks (editor spec §43, plugin_interface). Graphviz
lays the drawing out, marks.py reads that layout as marks, and they are drawn here. It is the
core's graphviz-svg.ts, step for step, so both libraries write the same SVG for the same marks
(direct-links-parity.test.js).

- The SVG is the one Graphviz writes: the same parts, ids, classes, order, outlines and numbers.
- Colours are written as the layout's stand-ins, from each mark's style token, so the theme
  swaps them as before.
- Every text is escaped as Graphviz escapes it, so markup in a label is drawn as text."""

from __future__ import annotations

import math
import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from graphspec.style.marks_json import COLOUR_TOKENS, implied_line

# Graphviz's points in one CSS pixel.
PT = 3 / 4
# How round a rounded box's corners are, in points, when a mark gives no outline.
CORNER = 6
# How wide an arrowhead is beside its length, when a mark gives no outline.
ARROW_WIDTH = 0.35
# The font families Graphviz writes for the fonts it was given.
FAMILIES = {"Helvetica": "Helvetica,sans-Serif", "Times-Roman": "Times,serif"}
# The colour names Graphviz writes in place of a colour.
NAMES = {"#000000": "black", "#ffffff": "white"}
HEADER = (
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG'
    ' 1.1//EN"\n "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n'
)
_ENTITY = re.compile(r"^&(#\d+|#x[0-9a-f]+|[a-z]+);", re.IGNORECASE)
_HEX = {token: hex_ for hex_, token in COLOUR_TOKENS.items()}


def js_string(x: float) -> str:
    """`x` written as JavaScript's String writes it: no point for a whole number, -0 as 0."""
    if x == 0:
        return "0"
    return str(int(x)) if x == int(x) and abs(x) < 1e21 else repr(x)


def num(x: float) -> str:
    """`x` to two places, as the core's Math.round(x * 100) / 100 writes it."""
    return js_string(math.floor(x * 100 + 0.5) / 100)


def to_fixed(x: float, places: int = 2) -> str:
    """`x` as JavaScript's toFixed writes it: its exact value, a half rounded up."""
    q = Decimal(x).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    return f"{q:.{places}f}"


def escaped(s: str, label: bool = False) -> str:
    """Text as Graphviz escapes it: markup, quotes and dashes, and each space after a space in a
    label."""
    out, last = [], ""
    for i, c in enumerate(s):
        if c == "&":
            out.append("&amp;" if label or not _ENTITY.match(s[i:]) else "&")
        elif c in "<>\"'-":
            out.append({"<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "-": "&#45;"}[c])
        elif c == " " and last == " " and label:
            out.append("&#160;")
        else:
            out.append(c)
        last = c
    return "".join(out)


def colour_of(token: str, line: bool) -> str:
    """The stand-in colour a token is written in, as a fill or as a line."""
    if token == "none":
        return "none"
    parts = token.split(".")

    def hex2(n: str | None) -> str:
        return format(int(n or "0"), "02x")

    if parts[0] == "kind":
        c = f"#000{2 if line else 1}{hex2(parts[1] if len(parts) > 1 else None)}"
    elif parts[0] == "reading":
        third = parts[2] if len(parts) > 2 else None
        c = f"#000{4 if third == 'label' else 3}{hex2(parts[1] if len(parts) > 1 else None)}"
    else:
        c = _HEX.get(token, "#000000")
    return NAMES.get(c, c)


def paint_of(style: str) -> tuple[str, str, bool]:
    """How a style token paints: its fill (none for an outline), its line, and whether the line
    is dashed."""
    s = style
    dashed = s.endswith(".dashed")
    if dashed:
        s = s[: -len(".dashed")]
    if s.endswith(".outline"):
        return "none", colour_of(s[: -len(".outline")], True), dashed
    split = s.find(".line.")
    fill = s if split < 0 else s[:split]
    line = implied_line(fill) if split < 0 else s[split + len(".line.") :]
    return colour_of(fill, False), colour_of(line, True), dashed


def layout_svg(laid: dict[str, Any]) -> str:
    """A drawing's marks as Graphviz's SVG, from its layout: its size, room round it, and parts in
    order. Marks with no layout are drawn in their order, with no room round them."""
    space = laid["space"]
    order = sorted(enumerate(laid["marks"]), key=lambda p: (p[1].get("z", 0), p[0]))
    everything = {"kind": "graph", "id": "", "className": "", "title": "", "marks": []}
    everything["marks"] = [m["id"] for _, m in order]
    layout = laid.get("layout") or {}
    pad = layout.get("pad", 0) * PT
    left, top = layout.get("origin", [0, space["height"] * PT])
    parts = layout.get("parts", [everything])

    # as Graphviz rounds, to whole points: a half is rounded down
    def whole(x: float) -> int:
        return math.ceil(float(to_fixed(x)) - 0.5)

    width = whole(space["width"] * PT + 2 * pad)
    height = whole(space["height"] * PT + 2 * pad)

    def pt(p) -> str:
        return f"{num(p[0] * PT + left)},{num(p[1] * PT - top)}"

    def line_attrs(m, dashed: bool) -> str:
        w = m.get("lineWidth")
        return ("" if w is None else f' stroke-width="{num(w * PT)}"') + (
            ' stroke-dasharray="5,2"' if dashed else ""
        )

    def mark_svg(m) -> str:
        fill, line, dashed = paint_of(m["style"])
        if m["kind"] == "label":
            at = f'x="{num(m["x"] * PT + left)}" y="{num(m["y"] * PT - top)}"'
            family = FAMILIES.get(m.get("font") or "Times-Roman", m.get("font"))
            colour = "" if fill == "black" else f' fill="{fill}"'
            font = f'font-family="{family}" font-size="{to_fixed(m["size"] * PT)}"'
            text = escaped(m["text"], True)
            start = f'<text xml:space="preserve" text-anchor="{m["anchor"]}"'
            return f"{start} {at} {font}{colour}>{text}</text>"
        if m["kind"] == "link":
            points = m["outline"]["points"] if m.get("outline") else m["points"]
            first, rest = (points[0] if points else [0, 0]), points[1:]
            d = f"M{pt(first)}{'C' if m.get('curve') else 'L'}{' '.join(pt(p) for p in rest)}"
            return f'<path fill="none" stroke="{line}"{line_attrs(m, dashed)} d="{d}"/>'
        group = m["kind"] == "group"
        stroke = colour_of(re.sub(r"\.dashed$", "", m["style"]), True) if group else line
        paint = f' fill="{"none" if group else fill}" stroke="{stroke}"{line_attrs(m, dashed)}'
        outline = m.get("outline")
        if outline:
            ps = outline["points"]
            if m["kind"] == "box" and m.get("shape") == "ellipse" and len(ps) == 2:
                (ax, ay), (bx, by) = ps
                c = f'cx="{num((ax + bx) / 2 * PT + left)}" cy="{num((ay + by) / 2 * PT - top)}"'
                rx, ry = num(abs(bx - ax) / 2 * PT), num(abs(by - ay) / 2 * PT)
                return f'<ellipse{paint} {c} rx="{rx}" ry="{ry}"/>'
            if outline.get("curve"):
                rest = " ".join(pt(p) for p in ps[1:])
                return f'<path{paint} d="M{pt(ps[0] if ps else [0, 0])}C{rest}"/>'
            ring = " ".join(pt(p) for p in [*ps, ps[0] if ps else [0, 0]])
            return f'<polygon{paint} points="{ring}"/>'
        if m["kind"] == "arrowhead":
            return _arrow_svg(m, paint, pt)
        return _shape_svg(m, paint, pt)

    by_id = {m["id"]: m for m in laid["marks"]}
    out: list[str] = []
    for part in parts:
        drawn = [mark_svg(by_id[i]) for i in part["marks"] if i in by_id]
        if part["kind"] == "graph":
            if part.get("title"):
                out.append(f"<title>{escaped(part['title'])}</title>")
            out.extend(drawn)
            continue
        out.append(f'<g id="{escaped(part["id"])}" class="{escaped(part["className"])}">')
        out.append(f"<title>{escaped(part['title'])}</title>")
        out.extend([*drawn, "</g>"])
    body = "\n".join(out)
    return (
        f'{HEADER}<svg width="{width}pt" height="{height}pt"\n viewBox="0.00 0.00 {width}.00 '
        f'{height}.00" xmlns="http://www.w3.org/2000/svg" '
        f'xmlns:xlink="http://www.w3.org/1999/xlink">\n'
        f'<g id="graph0" class="graph" transform="scale(1 1) rotate(0) '
        f'translate({num(pad - left)} {num(top + pad)})">\n{body}\n</g>\n</svg>\n'
    )


def _shape_svg(m, paint: str, pt) -> str:
    """A box or group with no outline given, drawn from its shape and box."""
    x, y, w, hh = m["x"], m["y"], m["width"], m["height"]
    kind = m["kind"]
    shape = (m.get("shape") or "rect") if kind == "box" else "round" if kind == "group" else "rect"

    def corners(ps) -> str:
        return f'<polygon{paint} points="{" ".join(pt(p) for p in [*ps, ps[0]])}"/>'

    if shape == "ellipse":
        cx, cy = pt([x + w / 2, y + hh / 2]).split(",")
        return (
            f'<ellipse{paint} cx="{cx}" cy="{cy}" rx="{num(w / 2 * PT)}" ry="{num(hh / 2 * PT)}"/>'
        )
    if shape == "diamond":
        return corners([[x + w / 2, y], [x + w, y + hh / 2], [x + w / 2, y + hh], [x, y + hh / 2]])
    if shape != "round":
        return corners([[x + w, y], [x, y], [x, y + hh], [x + w, y + hh]])
    r = min(CORNER / PT, w / 2, hh / 2)
    a, b, c, d = pt([x + r, y]), pt([x + w - r, y]), pt([x + w, y]), pt([x + w, y + r])
    e, f, g, h = (
        pt([x + w, y + hh - r]),
        pt([x + w, y + hh]),
        pt([x + w - r, y + hh]),
        pt([x + r, y + hh]),
    )
    i, j, k, z = pt([x, y + hh]), pt([x, y + hh - r]), pt([x, y + r]), pt([x, y])
    pairs = " ".join(f"{p} {p}" for p in (b, c, d, e, f, g, h, i, j, k, z))
    path = f"M{a}C{a} {pairs} {a}"
    return f'<path{paint} d="{path}"/>'


def _arrow_svg(m, paint: str, pt) -> str:
    """An arrowhead with no outline given, drawn as a triangle from its tip, angle and size."""
    a, half = m["angle"] * math.pi / 180, m["size"] * ARROW_WIDTH
    tip = [m["x"], m["y"]]
    base = [m["x"] - m["size"] * math.cos(a), m["y"] - m["size"] * math.sin(a)]
    side = [-math.sin(a) * half, math.cos(a) * half]
    ps = [[base[0] + side[0], base[1] + side[1]], tip, [base[0] - side[0], base[1] - side[1]]]
    return f'<polygon{paint} points="{" ".join(pt(p) for p in [*ps, ps[0]])}"/>'
