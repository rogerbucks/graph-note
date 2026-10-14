"""The legend's choices saved with a view (editor spec §25, untangle_legend; §7,
view_saved_as_shown): what the plugin's legend brings forward and hides, written to the style graph
as a Shown's `legend` only when the user saves the view as shown, such as
'kind:Person forward, type:NEAR hidden'. The core's untangle-saved.ts and LegendFilter.apply,
function for function: the text read and checked against the graph, each fault a problem on the
Shown's line with the core's words and fix, the rest kept; and what the choices bring forward and
hide in a drawing, so both renderers draw a view saved so alike. tests/legend_cases.json holds both
to one table."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any

from graphspec.style.near_names import nearest, utf16_units
from graphspec.style.words import or_list, word_fix

# What a legend's line may be saved as: brought forward, the rest faded; or hidden.
LEGEND_CHOICES = ("forward", "hidden")
# What a legend may choose, before the colon of its id.
_WHAT = {"kind": "a kind", "type": "a relationship type"}
_UNREADABLE = "is not a legend choice: write kind:<Kind> or type:<TYPE>, then forward or hidden"
_UNREADABLE_FIX = "write it as kind:<Kind> forward or type:<TYPE> hidden, or remove it"
# The separator between a box's kinds, as the drawing joins them.
_SEPARATOR = " · "


def _id_parts(entry_id: str) -> tuple[str, str] | None:
    """An id's kind of line and name, or None when it is neither kind:<name> nor type:<name>."""
    colon = entry_id.find(":")
    what, name = entry_id[:colon], entry_id[colon + 1 :]
    if colon > 0 and what in _WHAT and name != "" and ":" not in name:
        return what, name
    return None


def legend_text(choices: Iterable[dict]) -> str:
    """The text a Shown saves the choices as: each id and how it stands, comma-joined."""
    return ", ".join(f"{c['id']} {c['state']}" for c in choices)


def legend_checked(r: Any, names: dict) -> list[dict] | None:
    """The choices a Shown's `legend` holds, read with the style reader `r` (checks._Reader) and
    checked against the graph `names` styles: each entry between commas an id and a state, spaces
    around either taken off. Each fault is a problem with its fix, and that entry left out: an
    empty entry, one that cannot be read, a state not allowed, a kind or type the graph lacks (the
    nearest given), or a line chosen again; one fault for each entry, the first found. The rest are
    kept, in the order written, as [{id, state}]; None when no legend is written."""
    written = r.text("legend")
    if written is None:
        return None
    if written.strip(" ") == "":
        return []
    kept, seen = [], set()
    for entry in (e.strip(" ") for e in written.split(",")):
        parts = [p for p in entry.split(" ") if p]
        parsed = _id_parts(parts[0]) if len(parts) == 2 else None
        if not entry:
            r.report("the legend has an empty choice between its commas", "remove the extra comma")
        elif not parsed:
            r.report(f"{entry} {_UNREADABLE}", _UNREADABLE_FIX)
        else:
            entry_id, state = parts
            what, name = parsed
            among = names["kinds"] if what == "kind" else names["types"]
            if state not in LEGEND_CHOICES:
                message = f"{state} is not a legend choice's state: {or_list(LEGEND_CHOICES)}"
                r.report(message, word_fix(state, LEGEND_CHOICES)["fix"])
            elif name not in among:
                near = nearest(name, among)
                by = [] if not near else [near["one"]] if "one" in near else near["several"]
                graph = names["graph"]
                if by:
                    mean = "the one you mean: " if len(by) > 1 else ""
                    fix = f"change {name} to {mean}{or_list(by)}"
                else:
                    fix = f"write {_WHAT[what]} in graph {graph}, or remove it"
                r.report(f"{name} is not {_WHAT[what]} in graph {graph}", fix)
            elif entry_id in seen:
                r.report(f"{entry_id} is chosen twice in the legend", "keep one of them")
            else:
                seen.add(entry_id)
                kept.append({"id": entry_id, "state": state})
    return kept


def _sorted_keys(keys: Iterable[str]) -> list[str]:
    """Keys sorted as JavaScript sorts strings, by UTF-16 code units."""
    return sorted(keys, key=utf16_units)


def legend_layers(
    nodes: Sequence[tuple], links: Sequence[tuple[str, str, str]], choices: Iterable[dict]
) -> dict:
    """What the legend's choices come to for a drawing, as the core's LegendFilter.apply says:
    {forward: {things, edges} or None when nothing is brought forward, hidden: {things, edges}},
    things by key and links by their place in `links`, each list sorted. `nodes` are (key, kinds
    joined by ' · ', …) as graph_parts gives them; `links` are (from key, relationship type, to
    key), in the order drawn. A kind hidden hides its things and every link to them, a type its
    links; a kind brought forward brings its things and the links among them, a type its links and
    the things they join; what is hidden is never brought forward."""
    states = {c["id"]: c["state"] for c in choices}

    def chosen(what, state):
        at = len(what) + 1
        return {i[at:] for i, s in states.items() if s == state and i.startswith(f"{what}:")}

    def has(kind, wanted):
        return any(k in wanted for k in kind.split(_SEPARATOR))

    hidden_kinds, hidden_types = chosen("kind", "hidden"), chosen("type", "hidden")
    hidden_things = {n[0] for n in nodes if has(n[1], hidden_kinds)}
    hidden_edges = {
        i
        for i, (s, t, d) in enumerate(links)
        if t in hidden_types or s in hidden_things or d in hidden_things
    }
    hidden = {"things": _sorted_keys(hidden_things), "edges": sorted(hidden_edges)}
    if "forward" not in states.values():
        return {"forward": None, "hidden": hidden}
    forward_kinds, forward_types = chosen("kind", "forward"), chosen("type", "forward")
    things = {n[0] for n in nodes if has(n[1], forward_kinds)}
    of_kinds, edges = set(things), set()
    for i, (s, t, d) in enumerate(links):
        if t in forward_types:
            edges.add(i)
            things.update((s, d))
        elif s in of_kinds and d in of_kinds:
            edges.add(i)
    forward = {
        "things": _sorted_keys(things - hidden_things),
        "edges": sorted(edges - hidden_edges),
    }
    return {"forward": forward, "hidden": hidden}
