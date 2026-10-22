"""Diagram types (editor spec §15): which of the seven types fit a graph, and why each that does
not fit does not (type_only_when_fits, tree_fits, timeline_fits); the type that fits best,
suggested and never drawn unless chosen (suggest_type); the type the style graph chooses, drawn
only while the data fits it — else the graph is drawn as a network, and the nearest type that fits
is offered (type_stops_fitting); and each type laid out by Graphviz from the same source as the
plugin's (type_both_renderers). The core's types.ts and graph-layout.js typedSource, function for
function, byte for byte. A table is drawn by the plugin's host, never by graph_svg: here it is
judged, and drawn as a network."""

from __future__ import annotations

import datetime as dt
import html
import re
from collections.abc import Mapping, Sequence
from typing import Any

from graphspec.style.inline import value_text
from graphspec.style.radial import lone_thing, radial_centre
from graphspec.style.words import DIAGRAM_TYPES, DIRECTIONS, LOCKED, plugin_type_of

# More things than this are too many to read in one drawing (§15, large_way_in).
LARGE_GRAPH = 50
_NOTHING = "there is nothing here to draw"
# The types tried, in order, when the chosen one stops fitting; the network fits always.
_NEAREST = {
    "network": (),
    "tree": ("flow", "radial"),
    "flow": ("tree", "lanes"),
    "radial": ("tree", "flow"),
    "lanes": ("flow",),
    "timeline": ("flow", "table"),
    "table": (),
}
_TYPE_DIRECTION = {"tree": "TB", "flow": "LR", "radial": "LR", "lanes": "LR", "timeline": "LR"}
_KIND_COLUMN = re.compile(r"^ {2}\{ rank=same; ")
_LINK = re.compile(r'^ {2}"[^"]*" -> "[^"]*" \[label=')
_BACK = re.compile(r'^ {2}("[^"]*") -> ("[^"]*") \[(.*), dir=back\];$')


def _and_list(xs):
    return xs[0] if len(xs) < 2 else f"{', '.join(xs[:-1])} and {xs[-1]}"


def _counted(n):
    return "two" if n == 2 else str(n)


def shape_of(parts: Mapping[str, Any], nudges: Sequence[Mapping] = ()) -> dict[str, list]:
    """The shape a type is judged on, from graph_parts: each thing {key, text, kinds, date (the
    first date it carries, said as inline, if any)}, each written link {from, type, to}, and, when
    any are written, the groups `nudges` (read_style's) draw, [label, keys of things drawn], in
    the order first written — the core's types-shape.ts shapeOf."""
    things = []
    for (key, kind, text), (_, _, props) in zip(parts["nodes"], parts["boxes"], strict=True):
        date = next((v for v in props.values() if isinstance(v, dt.date)), None)
        thing = {"key": key, "text": text, "kinds": kind.split(" · ") if kind else []}
        things.append(thing if date is None else {**thing, "date": value_text(date)})
    links = [
        {"from": s, "type": t, "to": d}
        for (s, _, d), (t, _) in zip(parts["edges"], parts["links"], strict=True)
    ]
    drawn, groups = {key for key, _, _ in parts["nodes"]}, {}
    for n in nudges:
        thing, group = n.get("thing"), n.get("group")
        if n["word"] == "group" and group is not None and thing in drawn:
            keys = groups.setdefault(group, [])
            if thing not in keys:
                keys.append(thing)
    shape: dict[str, list] = {"things": things, "links": links}
    return {**shape, "groups": [[g, keys] for g, keys in groups.items()]} if groups else shape


def _loop_in(things, links):
    """The first loop the links make, followed from each thing in turn: the things around it,
    back to where it starts; or None."""
    out: dict[str, list[str]] = {}
    for link in links:
        out.setdefault(link["from"], []).append(link["to"])
    state: dict[str, str] = {}
    for start in things:
        if start in state:
            continue
        path, nxt = [start], [0]
        state[start] = "open"
        while path:
            k, i = path[-1], nxt[-1]
            ends = out.get(k, [])
            if i >= len(ends):
                state[k] = "done"
                path.pop()
                nxt.pop()
                continue
            nxt[-1] = i + 1
            n = ends[i]
            if state.get(n) == "open":
                return [*path[path.index(n) :], n]
            if n not in state:
                state[n] = "open"
                path.append(n)
                nxt.append(0)
    return None


def _tree_along(shape, type_, text):
    """Why the links of `type_` make no tree — a thing with a second parent, or a loop — or None
    when they make one. A parent linked to a thing twice by the type is one parent."""
    links = [link for link in shape["links"] if link["type"] == type_]
    if not links:
        return f"there is no {type_} link here"
    parents: dict[str, list[str]] = {}
    for link in links:
        ps = parents.setdefault(link["to"], [])
        if link["from"] not in ps:
            ps.append(link["from"])
    for t in shape["things"]:
        ps = parents.get(t["key"], [])
        if len(ps) > 1:
            named = _and_list([text(p) for p in ps])
            return f"{t['text']} has {_counted(len(ps))} parents, {named}"
    loop = _loop_in([t["key"] for t in shape["things"]], links)
    return f"it loops back: {' → '.join(text(k) for k in loop)}" if loop else None


def _no(type_, why):
    return {"type": type_, "fits": False, "why": why}


def _yes(type_):
    return {"type": type_, "fits": True}


def _tree_fit(shape, relationship, text):
    if not shape["links"]:
        return _no("tree", "a tree needs links, and there are none")
    if relationship is not None:
        why = _tree_along(shape, relationship, text)
        if why:
            return _no("tree", f"along {relationship}, {why}")
        return {**_yes("tree"), "relationship": relationship}
    # The most links first. Of two with as many, the first by name. Names compare in UTF-16 code
    # units, as JavaScript compares them, so the choice never hangs on the order written.
    types = list(dict.fromkeys(link["type"] for link in shape["links"]))
    types.sort(
        key=lambda t: (
            -sum(1 for link in shape["links"] if link["type"] == t),
            t.encode("utf-16-be"),
        )
    )
    best = next((t for t in types if _tree_along(shape, t, text) is None), None)
    if best is not None:
        return {**_yes("tree"), "relationship": best}
    why = _tree_along(shape, types[0], text)
    return _no("tree", f"no relationship makes a tree: along {types[0]}, {why}")


def _radial_fit(shape, text, chosen=None):
    if len(shape["things"]) < 3:
        return _no("radial", "a radial drawing needs three things or more")
    if shape.get("groups"):
        # Graphviz's radial layout cannot draw a group's box
        label = shape["groups"][0][0]
        return _no("radial", f"a radial drawing cannot draw the box of group {label}")
    centre = radial_centre(shape, chosen)
    lone = lone_thing(shape, centre)
    if lone is None:
        return _yes("radial")
    why = f"joined to the centre, {text(centre)}, and {lone['text']} is not"
    return _no("radial", f"a radial drawing needs every thing {why}")


def _lanes_fit(shape):
    for t in shape["things"]:
        if not t["kinds"]:
            return _no("lanes", f"{t['text']} has no kind, so it has no lane")
        if len(t["kinds"]) > 1:
            kinds = f"{_counted(len(t['kinds']))} kinds, {_and_list(t['kinds'])}"
            return _no("lanes", f"{t['text']} is of {kinds}, so it cannot sit in one lane")
    kind_of = {t["key"]: t["kinds"][0] for t in shape["things"]}
    for label, keys in shape.get("groups", ()):
        if len({kind_of.get(k) for k in keys}) > 1:
            return _no("lanes", f"group {label} holds things of two kinds")
    if len({t["kinds"][0] for t in shape["things"]}) < 2:
        return _no("lanes", "lanes need things of two kinds or more")
    return _yes("lanes")


def type_fits(
    shape: Mapping[str, list], relationship: str | None = None, centre: str | None = None
) -> list[dict]:
    """Whether each type fits the shape (§15, type_only_when_fits), in the order of DIAGRAM_TYPES,
    each {type, fits, why (when it does not fit), relationship (a tree that fits)}, as the core's
    typeFits gives them, word for word. A radial drawing is judged around `centre`, if chosen."""
    if not shape["things"]:
        return [_yes(t) if t == "network" else _no(t, _NOTHING) for t in DIAGRAM_TYPES]
    texts = {t["key"]: t["text"] for t in shape["things"]}

    def text(k):
        return texts.get(k, k)

    loop = _loop_in([t["key"] for t in shape["things"]], shape["links"])
    undated = next((t for t in shape["things"] if "date" not in t), None)
    if not shape["links"]:
        flow = _no("flow", "a flow needs links, and there are none")
    elif loop:
        around = " → ".join(map(text, loop))
        flow = _no("flow", f"a flow runs one way, and this loops back: {around}")
    else:
        flow = _yes("flow")
    if undated:
        why = f"a timeline needs every thing to carry a date, and {undated['text']} carries none"
        timeline = _no("timeline", why)
    else:
        timeline = _yes("timeline")
    return [
        _yes("network"),
        _tree_fit(shape, relationship, text),
        flow,
        _radial_fit(shape, text, centre),
        _lanes_fit(shape),
        timeline,
        _yes("table"),
    ]


def nearest_type(type_: str, fits: Sequence[Mapping]) -> str:
    """The type to offer when `type_` stops fitting: the first of its neighbours that fits, else a
    network."""
    fitting = {f["type"] for f in fits if f["fits"]}
    return next((t for t in _NEAREST[type_] if t in fitting), "network")


def chosen_diagram(diagrams: Sequence[Mapping], view: str | None = None) -> Mapping | None:
    """The diagram type the style graph chooses in `view` (None: the whole graph): the view's own
    over the whole graph's. diagrams: as read_style gives them."""
    own = next((d for d in diagrams if view is not None and d.get("view") == view), None)
    return own or next((d for d in diagrams if d.get("view") is None), None)


def _plan_of(fit, shape, centre=None):
    """How Graphviz lays a fitting type out (typed_source); None for a network or a table."""
    typ = fit["type"]
    if typ == "tree":
        tree = [i for i, link in enumerate(shape["links"]) if link["type"] == fit["relationship"]]
        return {"type": "tree", "tree": tree}
    if typ == "flow":
        return {"type": "flow"}
    if typ == "radial":
        return {"type": "radial", "centre": radial_centre(shape, centre)}
    if typ == "lanes":
        lanes: dict[str, list[str]] = {}
        for t in shape["things"]:
            lanes.setdefault(t["kinds"][0], []).append(t["key"])
        # each group is drawn inside its lane (typed_source), never as a box of its own
        plan = {"type": "lanes", "lanes": [[k, keys] for k, keys in lanes.items()]}
        return {**plan, "groups": shape["groups"]} if shape.get("groups") else plan
    if typ == "timeline":
        # a rank is a day, the date's first ten characters: an instant shares a date's rank
        days = sorted(dict.fromkeys(t["date"][:10] for t in shape["things"]))
        return {
            "type": "timeline",
            "dates": [[t["key"] for t in shape["things"] if t["date"][:10] == d] for d in days],
        }
    return None


def diagram_for(
    parts: Mapping[str, Any],
    diagrams: Sequence[Mapping],
    view: str | None = None,
    nudges: Sequence[Mapping] = (),
) -> dict[str, Any]:
    """The type `parts` (graph_parts) is drawn as in `view` (None: the whole graph), its groups
    those `nudges` draw, as the core's diagramFor gives it: {drawn} with none chosen; {chosen,
    drawn, plan (if any)} while the chosen type fits; else {chosen, drawn: 'network', stopped:
    {type, why, nearest}}."""
    d = chosen_diagram(diagrams, view)
    if d is None:
        return {"drawn": "network"}
    own = plugin_type_of(d["plugin"]) if "plugin" in d else None
    if own:
        why = (
            f"the diagram type {d['plugin']} comes from the plug-in {own['plugin']}, "
            "which is not here, so the graph is drawn as a network"
        )
        return {
            "drawn": "network",
            "plugin": {"type": d["plugin"], "plugin": own["plugin"], "why": why},
        }
    shape = shape_of(parts, nudges)
    fits = type_fits(shape, d.get("relationship"), d.get("centre"))
    fit = next(f for f in fits if f["type"] == d["type"])
    if not fit["fits"]:
        stopped = {"type": d["type"], "why": fit["why"], "nearest": nearest_type(d["type"], fits)}
        return {"chosen": d["type"], "drawn": "network", "stopped": stopped}
    plan = _plan_of(fit, shape, d.get("centre"))
    return {"chosen": d["type"], "drawn": d["type"], **({"plan": plan} if plan else {})}


def directions(direction: str | None = None, diagram: Mapping | None = None) -> list[str]:
    """The directions a drawing is laid out in: only `direction`, when a direction nudge sets one
    the style lists (read_style gives it); else only its diagram type's (a plan, from
    diagram_for), a tree down and the rest across; else every direction the style lists, in its
    order — as the plugin's core chooses them (render.ts, directions)."""
    if direction and direction in DIRECTIONS:
        return [direction]
    if diagram:
        return [_TYPE_DIRECTION[diagram["type"]]]
    return list(DIRECTIONS)


def typed_source(dot: str, plan: Mapping | None) -> str:
    """The layout source `dot` laid out as a diagram type, by its plan (diagram_for's), as
    graph-layout.js typedSource writes it: a radial drawing around its centre, by twopi; a tree, a
    flow, lanes and a timeline with every link laid out forward and no kind in a column of its own,
    a tree's other links and every link of a timeline never moving a thing; lanes a box for each
    kind, each group drawn inside its lane; a timeline each day's things on one rank, the days in
    order, joined by links never drawn. With no plan, `dot` unchanged."""
    if not plan:
        return dot
    lines = dot.split("\n")
    if plan["type"] == "radial":
        root = plan["centre"]
        lines.insert(2, f'  graph [layout=twopi, root="{root}", overlap=scale, splines=true];')
        return "\n".join(lines)
    tree, out, n = set(plan.get("tree", ())), [], -1
    for line in lines:
        if _KIND_COLUMN.match(line):
            continue
        if not _LINK.match(line):
            out.append(line)
            continue
        n += 1
        back = _BACK.match(line)
        forward = f"  {back[2]} -> {back[1]} [{back[3]}];" if back else line
        free = plan["type"] == "timeline" or (plan["type"] == "tree" and n not in tree)
        out.append(f"{forward[:-2]}, constraint=false];" if free else forward)
    added = []
    if plan["type"] == "lanes":
        for i, (label, keys) in enumerate(plan["lanes"]):
            inner = [g for g in plan.get("groups", ()) if g[1][0] in keys]
            nested = " ".join(
                _box(f"cluster_lane_{i + 1}_{j + 1}", group, members)
                for j, (group, members) in enumerate(inner)
            )
            added.append("  " + _box(f"cluster_lane_{i + 1}", label, keys, nested))
    if plan["type"] == "timeline":
        for i, keys in enumerate(plan["dates"]):
            if len(keys) > 1:
                added.append("  {rank=same; " + "; ".join(f'"{k}"' for k in keys) + ";}")
            if i:
                added.append(f'  "{plan["dates"][i - 1][0]}" -> "{keys[0]}" [style=invis];')
    out[-1:-1] = added
    # groups inside lanes: without newrank, Graphviz may take a thing out of its box without a word
    if plan["type"] == "lanes" and plan.get("groups"):
        out.insert(1, "  newrank=true;")
    return "\n".join(out)


def _box(name, label, keys, inside=""):
    """A box labelled as a group's is (graph_svg.nudged_source): a lane, or a group inside one."""
    return (
        f"subgraph {name} {{label=<{html.escape(label)}>; "
        f'fontname="{LOCKED["font"]}"; fontsize={LOCKED["kind_font_size"]}; '
        'fontcolor="#0000fe"; color="#0000fe"; style="rounded"; '
        + "".join(f'"{k}"; ' for k in keys)
        + inside
        + "}"
    )
