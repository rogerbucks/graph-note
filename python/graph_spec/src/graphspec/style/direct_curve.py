"""A direct link's curve (editor spec §25, untangle_direct), for direct_links.py: one gentle
curve from the edge of one box to the edge of another, its tip at either end, and where its words
go. It is the core's direct-links.ts curveOf, step for step, with lengths worked out as V8 works
them out, so both libraries draw the same curve."""

from __future__ import annotations

import math


class Placed:
    """A box being placed: its key, its middle, its half width and height, and the group it must
    stay inside, as its edges (x0, y0, x1, y1), when it is in one."""

    def __init__(self, key: str, x: float, y: float, hw: float, hh: float, inside=None):
        self.key, self.x, self.y, self.hw, self.hh, self.inside = key, x, y, hw, hh, inside


def hypot(x: float, y: float) -> float:
    """The length of (`x`, `y`) as JavaScript's Math.hypot works it out in V8, to the last bit, so
    both libraries move the boxes alike: scaled by the larger, its squares summed with Kahan's
    compensation."""
    big = max(abs(x), abs(y))
    if big == 0 or math.isinf(big):
        return big
    total = compensation = 0.0
    for v in (abs(x), abs(y)):
        n = v / big
        summand = n * n - compensation
        preliminary = total + summand
        compensation = (preliminary - total) - summand
        total = preliminary
    return math.sqrt(total) * big


class Curve:
    """A direct link's curve, from the edge of box `a` to the edge of box `b`, bowed sideways by
    `bow` of its length: its points, its tip at either end, and where its words go."""

    def __init__(self, a: Placed, b: Placed, bow: float):
        dx, dy = b.x - a.x, b.y - a.y
        long = hypot(dx, dy) or 1
        self.dx, self.dy, self.long = dx, dy, long
        self.mid = (
            (a.x + b.x) / 2 - (dy / long) * bow * long,
            (a.y + b.y) / 2 + (dx / long) * bow * long,
        )
        # where the curve leaves a's edge and meets b's, along the line to the bow's middle
        self.ends = (_edge_of(a, self.mid), _edge_of(b, self.mid))

    def at(self, t: float) -> tuple[float, float]:
        """The point `t` of the way along the curve."""
        (p0, p3), mid, u = self.ends, self.mid, 1 - t
        return (
            u * u * p0[0] + 2 * u * t * mid[0] + t * t * p3[0],
            u * u * p0[1] + 2 * u * t * mid[1] + t * t * p3[1],
        )

    def cubic(self, cut_start: float, cut_end: float) -> list[list[float]]:
        """The quadratic curve written as Graphviz's cubic one, its ends drawn in where an
        arrowhead takes their place."""
        mid = self.mid
        s, e = _toward(self.ends[0], mid, cut_start), _toward(self.ends[1], mid, cut_end)
        return [
            list(s),
            [s[0] + (2 / 3) * (mid[0] - s[0]), s[1] + (2 / 3) * (mid[1] - s[1])],
            [e[0] + (2 / 3) * (mid[0] - e[0]), e[1] + (2 / 3) * (mid[1] - e[1])],
            list(e),
        ]

    def tip_at(self, at_start: bool) -> tuple[tuple[float, float], float]:
        """Where the tip at the first end, or the last, is, and the way it points, in degrees."""
        tip = self.ends[0] if at_start else self.ends[1]
        return tip, math.atan2(tip[1] - self.mid[1], tip[0] - self.mid[0]) * 180 / math.pi

    def words_at(self, t: float, off: float) -> tuple[float, float]:
        """Words sit just above the line where it runs across, and beside it where it runs up or
        down."""
        x, y = self.at(t)
        flip = -1 if self.dx >= 0 else 1
        return (x - (self.dy / self.long) * off * flip, y + (self.dx / self.long) * off * flip)

    def nearer(self, p: tuple[float, float]) -> bool:
        """Whether `p` is nearer the curve's first end than its last."""
        (a, b) = self.ends
        return hypot(p[0] - a[0], p[1] - a[1]) < hypot(p[0] - b[0], p[1] - b[1])


def curve_of(a: Placed, b: Placed, bow: float) -> Curve:
    """The curve from the edge of box `a` to the edge of box `b`, bowed by `bow` of its length."""
    return Curve(a, b, bow)


def _toward(p, q, by: float) -> tuple[float, float]:
    d = hypot(q[0] - p[0], q[1] - p[1]) or 1
    return (p[0] + ((q[0] - p[0]) * by) / d, p[1] + ((q[1] - p[1]) * by) / d)


def _edge_of(b: Placed, p) -> tuple[float, float]:
    """Where the line from box `b`'s middle toward `p` crosses its edge."""
    dx, dy = p[0] - b.x, p[1] - b.y
    k = min(math.inf if dx == 0 else b.hw / abs(dx), math.inf if dy == 0 else b.hh / abs(dy), 1)
    return (b.x + dx * k, b.y + dy * k)
