"""A radial drawing's centre (editor spec §15, radial_centre_chosen): the thing the style graph
names, else the thing with the most links; and the first thing not joined to it. The core's
types.ts and types-shape.ts, function for function."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def centre_of(shape: Mapping[str, Any]) -> str:
    """The thing with the most links, the first drawn when two have as many."""
    degree: dict[str, int] = {}
    for link in shape["links"]:
        for k in (link["from"], link["to"]):
            degree[k] = degree.get(k, 0) + 1
    best = shape["things"][0]["key"] if shape["things"] else ""
    for t in shape["things"]:
        if degree.get(t["key"], 0) > degree.get(best, 0):
            best = t["key"]
    return best


def radial_centre(shape: Mapping[str, Any], chosen: str | None = None) -> str:
    """The centre: the thing chosen, while the drawing holds it, else centre_of."""
    if chosen is not None and any(t["key"] == chosen for t in shape["things"]):
        return chosen
    return centre_of(shape)


def lone_thing(shape: Mapping[str, Any], centre: str) -> Mapping[str, Any] | None:
    """The first thing not joined to `centre`, whichever way its links run, or None."""
    near: dict[str, list[str]] = {}
    for link in shape["links"]:
        near.setdefault(link["from"], []).append(link["to"])
        near.setdefault(link["to"], []).append(link["from"])
    reached, queue = {centre}, [centre]
    for k in queue:
        for n in near.get(k, []):
            if n not in reached:
                reached.add(n)
                queue.append(n)
    return next((t for t in shape["things"] if t["key"] not in reached), None)
