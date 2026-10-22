"""Graphviz's layout, as its JSON gives it (editor spec §43, plugin_interface): the style token
each stand-in colour stands for, and an arrowhead's tip, angle and size from the shape drawn for
it. marks.py reads a layout as drawing marks with these. It is the core's graphviz-json.ts, step
for step."""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Mapping, Sequence
from typing import Any

# CSS pixels in one of Graphviz's points.
PX = 4 / 3

# The layout's stand-in colours, by the token each stands for. A kind's and a reading's are
# worked out.
COLOUR_TOKENS = {
    "#0000fd": "text",
    "#0000fe": "text.muted",
    "#0000fc": "link",
    "#0005fe": "picture",
    "#000000": "line",
    "#ffffff": "background",
}

_KIND = re.compile(r"^#000([1-4])([0-9a-f]{2})$")
_CLEAR = re.compile(r"^#[0-9a-f]{6}00$")
_KNOWN = re.compile(r"^#(000[0-4][0-9a-f]{2}|0005fe|ffffff|[0-9a-f]{6}00)$", re.IGNORECASE)
_LEADING = re.compile(r"^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")

Point = list[float]


def colour_token(colour: str | None) -> str:
    """The style token a stand-in colour stands for: a kind's (`kind.2`), a reading's
    (`reading.0`), or a fixed one."""
    c = (colour or "").lower()
    if not c or c in ("transparent", "none") or _CLEAR.match(c):
        return "none"
    if c in COLOUR_TOKENS:
        return COLOUR_TOKENS[c]
    m = _KIND.match(c)
    if not m:
        return "line"
    i = int(m.group(2), 16)
    if m.group(1) in ("1", "2"):
        return f"kind.{i}"
    return f"reading.{i}" if m.group(1) == "3" else f"reading.{i}.label"


def implied_line(fill: str) -> str:
    """The colour a fill implies for its line: a kind's own line, none for the background and
    pictures, else the same."""
    if fill.startswith("kind."):
        return fill
    return "none" if fill in ("background", "picture") else fill


def shape_style(fill: str | None, pen: str | None, dashed: bool) -> str:
    """A shape's style token. A filled shape's is its fill's token. Then `.line.` and its line's,
    when that is not the one its fill implies. An outline's is its line's token and `.outline`. A
    dashed one ends `.dashed`."""
    line = colour_token(pen)
    ways = ".dashed" if dashed else ""
    if fill is None:
        return f"{line}.outline{ways}"
    f = colour_token(fill)
    return f"{f}{'' if implied_line(f) == line else f'.line.{line}'}{ways}"


def known(colour: str | None) -> bool:
    """Whether a colour is a stand-in, black, white or none: one a token gives back exactly."""
    return bool(_KNOWN.match(colour or "")) or colour == "transparent"


def _js_round(x: float) -> float:
    """`x` to two places, a half rounded up, as JavaScript's Math.round does."""
    return math.floor(x * 100 + 0.5) / 100


def js_number(s: str | None, default: float = math.nan) -> float:
    """The number `s` starts with, as JavaScript's parseFloat reads it."""
    m = _LEADING.match(s or "")
    return float(m.group(0)) if m else default


def arrowhead(
    ops: Sequence[Mapping[str, Any]] | None,
    at: Callable[[float, float], Point],
    near: Point | None,
) -> dict[str, float] | None:
    """Where an arrowhead's tip is, its angle and its size, from the shape Graphviz draws for it;
    or None for none."""
    shape = next(
        (d for d in ops or () if d.get("op") in ("P", "p") and len(d.get("points") or ()) >= 3),
        None,
    )
    if shape is None or near is None:
        return None
    corners = [at(x, y) for x, y in shape["points"]]

    def far(p: Point) -> float:
        return math.hypot(p[0] - near[0], p[1] - near[1])

    t = 0
    for i, p in enumerate(corners):
        if far(p) > far(corners[t]):
            t = i
    tip = corners[t]
    base = [p for i, p in enumerate(corners) if i != t]
    mid = [sum(p[0] for p in base) / len(base), sum(p[1] for p in base) / len(base)]
    angle = math.atan2(tip[1] - mid[1], tip[0] - mid[0]) * 180 / math.pi
    size = max(math.hypot(tip[0] - mid[0], tip[1] - mid[1]), 1)
    return {"x": tip[0], "y": tip[1], "angle": _js_round(angle), "size": size}
