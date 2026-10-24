"""Folding a large graph (editor spec §25): a busy hub's links folded into one stub
(untangle_hubs), a group folded into one box (untangle_groups), links between two groups merged
into trunks (untangle_merge), and how the style graph routes links (untangle_routing): the core's
untangle-fold.ts and the switches of view-switches.ts, as far as graph_svg draws them. The plan
is written into the source by graphspec/style/fold_source.py. The View menu that turns the
switches is the plugin's; graph_svg draws as its settings start a graph, unless told otherwise:
busy hubs folded, groups not, links merged as the style graph says (view_switch_defaults)."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any

# A thing with more links than this is a busy hub, whose links can be folded into one stub.
BUSY_HUB = 12

# The switches as the plugin's settings start every graph (view_switch_defaults).
DEFAULT_SWITCHES = {"labels": True, "hubs": False, "groups": False, "merge": False}


def _links_by_thing(edges: Sequence[tuple[str, str]]) -> dict[str, list[int]]:
    """The links of each thing, by their place among the links: a link to itself counted once."""
    out: dict[str, list[int]] = {}
    for i, (s, d) in enumerate(edges):
        out.setdefault(s, []).append(i)
        if d != s:
            out.setdefault(d, []).append(i)
    return out


def busy_hubs(
    keys: Sequence[str], edges: Sequence[tuple[str, str]], most: int = BUSY_HUB
) -> list[str]:
    """The things, of `keys` and in their order, with more links than `most`: the busy hubs."""
    links = _links_by_thing(edges)
    return [k for k in keys if len(links.get(k, [])) > most]


def drawn_groups(
    nudges: Sequence[Mapping], keys: Iterable[str], diagram: Mapping | None = None
) -> list[list[Any]]:
    """The groups a graph's nudges draw (§6), as nudged_source draws their boxes: [label, things]
    for each label in the order first written, with its things drawn among `keys`, each once; none
    when the graph is laid out as lanes, which draw each group inside its lane."""
    drawn, groups = set(keys), {}
    if diagram and diagram.get("type") == "lanes":
        return []
    for n in nudges:
        things = [k for k in (n.get("thing"), n.get("other")) if k is not None]
        if n.get("word") != "group" or n.get("group") is None or not things:
            continue
        if not all(k in drawn for k in things):
            continue
        members = groups.setdefault(n["group"], [])
        members.extend(k for k in things if k not in members)
    return [[label, things] for label, things in groups.items()]


def fold_plan(
    keys: Sequence[str],
    edges: Sequence[tuple[str, str]],
    groups: Sequence[Sequence[Any]],
    choice: Mapping,
) -> dict[str, Any] | None:
    """The plan of what a graph folds and merges, as the core's foldPlan gives it, or None when it
    folds and merges nothing. `keys`: its things in order; `edges`: each link's (from, to), in
    order; `groups`: drawn_groups'; `choice`: {hubs, groups, merge: bool, opened: {hubs, groups}}.
    Returns {hidden, folded, hubs: [[key, links]], groups: [[label, things, folded]], merge}."""
    opened = choice.get("opened") or {}
    open_hubs, open_groups = set(opened.get("hubs") or ()), set(opened.get("groups") or ())
    planned = [
        [label, list(things), bool(choice["groups"]) and label not in open_groups]
        for label, things in groups
    ]
    boxed = {k: label for label, things, folded in planned if folded for k in things}
    folded = {i for i, (s, d) in enumerate(edges) if s in boxed and boxed.get(d, None) == boxed[s]}
    links, hubs = _links_by_thing(edges), []
    if choice["hubs"]:
        for key in busy_hubs(keys, edges):
            if key in boxed or key in open_hubs:
                continue
            mine = [i for i in links.get(key, []) if i not in folded]
            if not mine:
                continue
            folded.update(mine)
            hubs.append([key, len(mine)])
    is_hub = {k for k, _ in hubs}
    hidden = [
        k
        for k in keys
        if k not in boxed
        and k not in is_hub
        and links.get(k)
        and all(i in folded for i in links[k])
    ]
    merge = bool(choice["merge"]) and len(planned) > 0
    if not hubs and not boxed and not merge:
        return None
    return {
        "hidden": hidden,
        "folded": sorted(folded),
        "hubs": hubs,
        "groups": planned,
        "merge": merge,
    }


def links_of(style: Mapping, view: str | None = None) -> dict[str, Any]:
    """How the links of the whole graph, or of `view`, are drawn, as the core's linksOf says: a
    view's routing and merging over the whole graph's, each apart; curved and unmerged when the
    style graph says nothing. {routing, merge: bool}."""

    def chosen(key):
        ones = [x for x in style["links"] if key in x]
        own = next((x[key] for x in ones if view is not None and x.get("view") == view), None)
        return own if own is not None else next((x[key] for x in ones if "view" not in x), None)

    return {"routing": chosen("routing") or "curved", "merge": chosen("merge") == "on"}


def starting_switches(style: Mapping, view: str | None = None) -> dict[str, bool]:
    """The switches a graph, or `view`, starts with, as the core's startingSwitches gives them
    from the plugin's default settings: links merged as the style graph's Links merges them, where
    one is written for the graph or the view; and each as `view` was saved as shown with it."""
    start = dict(DEFAULT_SWITCHES)
    if any("merge" in x and x.get("view") in (None, view) for x in style["links"]):
        start["merge"] = links_of(style, view)["merge"]
    saved = (style.get("shown") or {}).get(view) if view is not None else None
    for k, v in (saved or {}).items():
        start[k] = v == "on"
    return start
