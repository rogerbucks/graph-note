"""A timeline's order and what it shows (editor spec §15, timeline_order, timeline_show): which
things a timeline shows, and their places across it, by date, by number, as written or by links.
The core's timeline.ts, function for function, byte for byte (type_both_renderers)."""

from __future__ import annotations

import math

from collections.abc import Mapping
from typing import Any


def is_number(v: Any) -> bool:
    """Whether a timeline may order by `v`: a finite number; true and false are not numbers."""
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def timeline_shown(shape: Mapping[str, Any], show: str | None) -> list[dict]:
    """The things a timeline shows (timeline_show): every thing, only those with a date, or only
    those without one."""
    if show == "dated":
        return [t for t in shape["things"] if "date" in t]
    if show == "undated":
        return [t for t in shape["things"] if "date" not in t]
    return shape["things"]


def _most_numbered(things):
    """The number property most of `things` carry; of two carried as often, the first by name."""
    count: dict[str, int] = {}
    for t in things:
        for k in t.get("numbers", {}):
            count[k] = count.get(k, 0) + 1
    ranked = sorted(count, key=lambda k: (-count[k], k.encode("utf-16-be")))
    return ranked[0] if ranked else None


def _link_places(things, links):
    """The places of `things` along their `links`: each thing one place after the last of the
    things that link to it, placed in the order written once the things before it are placed. In
    a loop none is ready: the first thing left is placed, after those placed already."""
    before: dict[str, list[str]] = {}
    for link in links:
        before.setdefault(link["to"], []).append(link["from"])
    place: dict[str, int] = {}
    left = [t["key"] for t in things]
    while left:
        ready = next(
            (i for i, k in enumerate(left) if all(b in place for b in before.get(k, []))), 0
        )
        k = left.pop(ready)
        place[k] = max([-1, *(place[b] for b in before.get(k, []) if b in place)]) + 1
    last = max(place.values())
    return [[t["key"] for t in things if place[t["key"]] == p] for p in range(last + 1)]


def timeline_plan(shape: Mapping[str, Any], choice: Mapping[str, Any]) -> dict[str, Any]:
    """How a timeline is laid out (timeline_order, timeline_show): its things in places, first
    first, and those it hides, as the core's timelinePlan gives them."""
    shown = timeline_shown(shape, choice.get("show"))
    keys = {t["key"] for t in shown}
    links = [
        link
        for link in shape["links"]
        if link["from"] != link["to"] and link["from"] in keys and link["to"] in keys
    ]
    chosen, by = choice.get("order"), choice.get("by")
    if chosen == "number" and by is None:
        by = _most_numbered(shown)

    def value(order, t):
        if order == "number":
            return None if by is None else t.get("numbers", {}).get(by)
        # a place is a day: an instant shares the place of a date on its day
        date = t.get("dates", {}).get(by) if chosen == "date" and by is not None else t.get("date")
        return None if date is None else date[:10]

    order = chosen or "date"
    if order in ("date", "number") and all(value(order, t) is None for t in shown):
        order = "links" if links else "written"
    if order == "written":
        dates = [[t["key"]] for t in shown]
    elif order == "links":
        dates = _link_places(shown, links)
    else:
        valued = [t for t in shown if value(order, t) is not None]
        places = list(dict.fromkeys(value(order, t) for t in valued))
        places.sort(key=(lambda p: p.encode("utf-16-be")) if order == "date" else None)
        dates = [[t["key"] for t in valued if value(order, t) == p] for p in places]
        rest = [t["key"] for t in shown if value(order, t) is None]
        if rest:
            dates.append(rest)
    hidden = [t["key"] for t in shape["things"] if t["key"] not in keys]
    plan = {"type": "timeline", "order": order, "dates": dates}
    return {**plan, "hidden": hidden} if hidden else plan


def timeline_fit(shape: Mapping[str, Any], choice: Mapping[str, Any]) -> dict[str, Any]:
    """Whether a timeline fits (timeline_fits): it does while it has a thing to show, as the
    core's types.ts timelineFit says, word for word."""
    if timeline_shown(shape, choice.get("show")):
        return {"type": "timeline", "fits": True}
    if choice.get("show") == "dated":
        why = "a timeline of the things with a date needs one, and no thing carries a date"
    else:
        why = "a timeline of the things without a date needs one, and every thing carries a date"
    return {"type": "timeline", "fits": False, "why": why}


def timeline_problem(
    typ: str, order: str | None, by: str | None, show: str | None
) -> tuple[str, str] | None:
    """What is wrong with a Diagram's order, by and show, and its fix, or None: they are only for
    a timeline, and by only for an order by date or number (the core's style-choice-checks.ts)."""
    if typ != "timeline" and any(v is not None for v in (order, by, show)):
        why = "an order and what is shown are chosen only for a timeline"
        return why, "remove them, or make it type: 'timeline'"
    if by is not None and order not in ("date", "number"):
        why = "by is chosen only for an order by date or number"
        return why, "remove by, or make it order: 'date' or 'number'"
    return None
