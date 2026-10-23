"""Each thing of a style graph checked on its own (editor spec §2, style_graph_checked; §6; §7;
§14; §15; §18; §25): its kind, the keys it writes, and for a nudge, a Show, an Arrows, a Diagram, a
Flow, a Links or a Picture its words, its values and every name it uses, against the graph it
styles. The core's style-checks.ts, style-choice-checks.ts, link-flow.ts and picture.ts, function
for function, as far as what graph_svg draws goes: what is sound is kept, and each fault is a
problem on its line with its fix, the same words as the core's.

A Look or ViewStyle is drawn by the plugin alone, never by graph_svg, so here only the keys it
writes are checked; the core checks the rest. Of a Shown, graph_svg draws the switches a view was
saved with, so its view and those are checked too; its zoom, place, frame and selection are the
plugin's alone."""

from __future__ import annotations

from typing import Any

from graphspec.style.flow import MEANS_NEEDED
from graphspec.style.legend import legend_checked
from graphspec.style.near_names import nearest
from graphspec.style.picture import PICTURE_FOR
from graphspec.style.radial import centre_problem
from graphspec.style.timeline import timeline_problem
from graphspec.style.words import (
    ARROWHEADS,
    DIAGRAM_TYPES,
    DIRECTIONS,
    FLOW_MOTIONS,
    INLINE,
    NUDGE_WORDS,
    ON_OFF,
    ROUTINGS,
    SAVED_SWITCHES,
    TIMELINE_ORDERS,
    TIMELINE_SHOWS,
    STYLE_KINDS,
    or_list,
    plugin_type_of,
    replace_first,
    style_problem,
    unknown_keys,
    word_fix,
)

FOUR = "a nudge must be one of four words: beside, before, group or direction"
KINDS = f"{', '.join(STYLE_KINDS[:-1])} or {STYLE_KINDS[-1]}"
# What a Show is for: one kind, thing or relationship type (§14).
SHOW_FOR = "a Show is for one kind, thing or relationship type"
# What a Diagram's relationship is for (§15): the branches of a tree, and nothing else.
TREE_ONLY = "a relationship is chosen only for a tree"


class _Reader:
    """Reads one thing's properties, reporting each fault: a value of the wrong type, a word not
    allowed, a name not there."""

    def __init__(self, raw, names, out):
        self.raw, self.names, self.out = raw, names, out

    def report(self, message, fix):
        self.out.append(style_problem(self.names["graph"], self.raw["at"], "GN805", message, fix))

    def missing(self, message, fix):
        """A fault of something absent, said unless a misspelt key may be it: the rename comes
        first, then this is said."""
        if not self.raw.get("misspelt"):
            self.report(message, fix)

    def text(self, key):
        props = self.raw["props"]
        if key not in props or isinstance(props[key], str):
            return props.get(key)
        self.report(f"{key} must be text", f"write {key} in quotes")
        return None

    def word(self, key, among, message, always=False):
        """A word of `among`, or None and a problem."""
        v = self.text(key)
        if v is None or v in among:
            return v
        self.report(replace_first(message, "$", v), word_fix(v, among, always)["fix"])
        return None

    def name(self, key, among, what, fix_what=None):
        """A name of the styled graph, or None and a problem whose fix is the nearest name."""
        fix_what = what if fix_what is None else fix_what
        v = self.text(key)
        if v is None or v in among:
            return v
        near = nearest(v, among)
        by = [] if not near else [near["one"]] if "one" in near else near["several"]
        graph = self.names["graph"]
        if by:
            mean = "the one you mean: " if len(by) > 1 else ""
            fix = f"change {v} to {mean}{or_list(by)}"
        else:
            fix = f"write {fix_what} in graph {graph}, or remove it"
        self.report(f"{v} is not {what} in graph {graph}", fix)
        return None


def _nudge_of(raw, names, out):
    """A nudge, checked: one of the four words, with the parts its word needs, each naming a
    thing of the graph."""
    r, before, props = _Reader(raw, names, out), len(out), raw["props"]
    if "word" not in props:
        r.missing(FOUR, "add word: " + or_list([f"'{w}'" for w in NUDGE_WORDS]))
        return None
    word = r.word("word", NUDGE_WORDS, FOUR, True)
    if not word:
        return None
    n: dict[str, Any] = {"word": word, "at": raw["at"]}
    things = names["things"]
    if word in ("beside", "before"):
        missing = next((k for k in ("thing", "other") if k not in props), None)
        if missing:
            r.missing(
                f"a {word} nudge names two things: thing and other", f"add {missing}: '<id>'"
            )
        else:
            n["thing"] = r.name("thing", things, "a thing", "the id of a thing")
            n["other"] = r.name("other", things, "a thing", "the id of a thing")
    elif word == "group":
        if "thing" not in props:
            r.missing("a group nudge names a thing and its group", "add thing: '<id>'")
        elif "group" not in props:
            r.missing(
                "a group nudge names a thing and its group", "add group: '<the group's label>'"
            )
        else:
            n["thing"] = r.name("thing", things, "a thing", "the id of a thing")
            n["group"] = r.text("group")
    elif "direction" not in props:
        r.missing(
            "a direction nudge names its direction",
            "add direction: " + or_list([f"'{d}'" for d in DIRECTIONS]),
        )
    else:
        message = "$ is not a direction the locked style lays out in"
        n["direction"] = r.word("direction", DIRECTIONS, message)
    return n if len(out) == before else None


def _show_of(raw, names, out):
    """A property switched on or off for showing inline, checked: a property of the kind's things,
    of the thing, or of the type's links, that it names; on unless it says off; in a view when it
    names one, whose name is the user's own."""
    r, before, props = _Reader(raw, names, out), len(out), raw["props"]
    targets = sum(1 for k in ("kind", "thing", "type") if k in props)
    if "property" not in props:
        r.missing("a Show names the property to show", "add property: '<name>'")
    elif targets > 1:
        r.report(SHOW_FOR, "remove all but one of them")
    elif not targets:
        r.missing(SHOW_FOR, "add kind: '<Kind>', thing: '<id>' or type: '<TYPE>'")
    else:
        kind = r.name("kind", names["kinds"], "a kind")
        thing = r.name("thing", names["things"], "a thing", "the id of a thing")
        typ = r.name("type", names["types"], "a relationship type")
        of = (
            {"kind": kind}
            if kind
            else {"thing": thing}
            if thing
            else {"type": typ}
            if typ
            else None
        )
        if of:
            what = next(iter(of.values()))
            prop = r.name(
                "property", names["properties"](of), f"a property of {what}", "a property it has"
            )
            message = f"inline must be {or_list(INLINE)}"
            inline = "on" if "inline" not in props else r.word("inline", INLINE, message)
            view = r.text("view")
            if prop and inline and len(out) == before:
                seen = {} if view is None else {"view": view}
                return {"property": prop, **of, **seen, "inline": inline, "at": raw["at"]}
    return None


def _arrows_of(raw, names, out):
    """Where arrowheads are hidden or shown, checked (§15): show or hide, for every link or the
    links of a relationship type the graph has, in the whole graph or in a view, whose name is the
    user's own."""
    r, before, props = _Reader(raw, names, out), len(out), raw["props"]
    if "arrowheads" not in props:
        add = "add arrowheads: " + or_list([f"'{w}'" for w in ARROWHEADS])
        r.missing("an Arrows says show or hide", add)
        return None
    arrowheads = r.word("arrowheads", ARROWHEADS, f"arrowheads must be {or_list(ARROWHEADS)}")
    typ = r.name("type", names["types"], "a relationship type")
    view = r.text("view")
    if not arrowheads or len(out) != before:
        return None
    seen = {} if view is None else {"view": view}
    return {
        "arrowheads": arrowheads,
        **seen,
        **({} if typ is None else {"type": typ}),
        "at": raw["at"],
    }


def _diagram_of(raw, names, out):
    """The diagram type chosen, checked (§15, type_remembered): one of the types, in the whole
    graph or a view, whose name is the user's own; for a tree, a relationship type the graph has,
    which no other type takes; a timeline's order, by and what it shows (timeline_order,
    timeline_show); a radial drawing's centre, a thing (radial_centre_chosen)."""
    r, before, props = _Reader(raw, names, out), len(out), raw["props"]
    if "type" not in props:
        add = "add type: " + or_list([f"'{w}'" for w in DIAGRAM_TYPES])
        r.missing("a Diagram names its type", add)
        return None
    # a type a plug-in adds is named under its id, and drawn as a network where none draws it
    written = props["type"]
    plugin = written if isinstance(written, str) and plugin_type_of(written) else None
    typ = "network" if plugin else r.word("type", DIAGRAM_TYPES, "$ is not a diagram type")
    relationship = r.name("relationship", names["types"], "a relationship type")
    centre = r.name("centre", names["things"], "a thing", "the id of a thing")
    view = r.text("view")
    order = r.word("order", TIMELINE_ORDERS, f"order must be {or_list(TIMELINE_ORDERS)}")
    by = r.text("by")
    show = r.word("show", TIMELINE_SHOWS, f"show must be {or_list(TIMELINE_SHOWS)}")
    if typ and relationship is not None and typ != "tree":
        r.report(TREE_ONLY, "remove relationship, or make it type: 'tree'")
    whys = [centre_problem(typ, centre), timeline_problem(typ, order, by, show)] if typ else []
    for why in filter(None, whys):
        r.report(*why)
    if not typ or len(out) != before:
        return None
    chosen = {"centre": centre, "order": order, "by": by, "show": show}
    return {
        "type": typ,
        **({} if plugin is None else {"plugin": plugin}),
        **({} if view is None else {"view": view}),
        **({} if relationship is None else {"relationship": relationship}),
        **{k: v for k, v in chosen.items() if v is not None},
        "at": raw["at"],
    }


def _links_of(raw, names, out):
    """How links are drawn, checked (§25, untangle_routing, untangle_merge): a routing of the
    three, merging on or off, or both, in the whole graph or in a view, whose name is the user's
    own."""
    r, before, props = _Reader(raw, names, out), len(out), raw["props"]
    if "routing" not in props and "merge" not in props:
        add = "add routing: " + or_list([f"'{w}'" for w in ROUTINGS]) + ", or merge: 'on'"
        r.missing("a Links sets routing or merge", add)
        return None
    routing = r.word("routing", ROUTINGS, f"$ is not a routing: links are {or_list(ROUTINGS)}")
    merge = r.word("merge", ON_OFF, f"merge must be {or_list(ON_OFF)}")
    view = r.text("view")
    if len(out) != before:
        return None
    chosen = {"routing": routing, "merge": merge, "view": view}
    return {**{k: v for k, v in chosen.items() if v is not None}, "at": raw["at"]}


def _shown_of(raw, names, out):
    """How a view was shown, as far as graph_svg draws it (§25, view_switch_view_only): the view,
    the View menu's switches saved with it, each on or off, and the legend's choices
    (untangle_legend, graphspec/style/legend.py), the sound ones kept. Its zoom, place, frame and
    selection are the plugin's alone, so they are not read here."""
    r = _Reader(raw, names, out)
    view = r.text("view")
    if not view:
        r.missing("a Shown names its view", "add view: '<the view's name>'")
        return None
    shown = {"view": view, "at": raw["at"]}
    for k in SAVED_SWITCHES:
        v = r.word(k, ON_OFF, f"{k} must be {or_list(ON_OFF)}")
        if v is not None:
            shown[k] = v
    legend = legend_checked(r, names)
    if legend is not None:
        shown["legend"] = legend
    return shown


def _flow_of(raw, names, out):
    """A Flow, checked (§7): how its links move — dashes, a dot, or still — for every link or the
    links of a relationship type the graph has, in the whole graph or a view, whose name is the
    user's own; one that moves links says what the movement means, or it is a problem and its links
    stay still (motion_not_alone)."""
    r, before, props = _Reader(raw, names, out), len(out), raw["props"]
    if "motion" not in props:
        add = "add motion: " + or_list([f"'{w}'" for w in FLOW_MOTIONS])
        r.missing("a Flow says how its links move", add)
        return None
    motion = r.word("motion", FLOW_MOTIONS, f"motion must be {or_list(FLOW_MOTIONS)}")
    typ = r.name("type", names["types"], "a relationship type")
    view = r.text("view")
    means = r.text("means")
    if motion and motion != "still" and not means and len(out) == before:
        r.missing(MEANS_NEEDED, "add means: '<what the movement means>'")
    if not motion or len(out) != before:
        return None
    return {
        "motion": motion,
        **({} if means is None else {"means": means}),
        **({} if view is None else {"view": view}),
        **({} if typ is None else {"type": typ}),
        "at": raw["at"],
    }


def _picture_of(raw, names, out):
    """A Picture, checked (§18): the property that holds the image, of the kind's things or of
    the thing it names, which the graph has; in a view when it names one, whose name is the
    user's own."""
    r, before, props = _Reader(raw, names, out), len(out), raw["props"]
    targets = sum(1 for k in ("kind", "thing") if k in props)
    if "property" not in props:
        r.missing("a Picture names the property that holds its image", "add property: '<name>'")
    elif targets > 1:
        r.report(PICTURE_FOR, "remove one of them")
    elif not targets:
        r.missing(PICTURE_FOR, "add kind: '<Kind>' or thing: '<id>'")
    else:
        kind = r.name("kind", names["kinds"], "a kind")
        thing = r.name("thing", names["things"], "a thing", "the id of a thing")
        of = {"kind": kind} if kind else {"thing": thing} if thing else None
        if of:
            what = next(iter(of.values()))
            prop = r.name(
                "property", names["properties"](of), f"a property of {what}", "a property it has"
            )
            view = r.text("view")
            if prop and len(out) == before:
                seen = {} if view is None else {"view": view}
                return {"property": prop, **of, **seen, "at": raw["at"]}
    return None


# The kinds a style graph checks here, each with its check and where what it gives goes.
_CHECKS = {
    "Nudge": (_nudge_of, "nudges"),
    "Show": (_show_of, "shows"),
    "Arrows": (_arrows_of, "arrows"),
    "Diagram": (_diagram_of, "diagrams"),
    "Flow": (_flow_of, "flows"),
    "Links": (_links_of, "links"),
    "Shown": (_shown_of, "shown"),
    "Picture": (_picture_of, "pictures"),
}


def check_things(raws: list[dict], names: dict) -> dict[str, list[dict]]:
    """Each thing of a style graph checked on its own, in the order written: the nudges, Shows,
    Arrows, Diagrams, Flows, Links, Shown and Pictures that are sound, and the problems found
    ({nudges, shows, arrows, diagrams, flows, links, shown, pictures, problems}). A raw thing
    is {labels (in the order written), props, at: {block, line, id}}; names is {graph, things,
    kinds, types: names in the graph styled, properties(of): the property names of a kind's things,
    a thing or a type's links}. A thing that writes a key its kind does not know is reported on
    the key and left out, and what it lacks is not yet said: it may be that key, misspelt."""
    c: dict[str, list[dict]] = {
        "nudges": [],
        "shows": [],
        "arrows": [],
        "diagrams": [],
        "flows": [],
        "links": [],
        "shown": [],
        "pictures": [],
        "problems": [],
    }
    problems = c["problems"]
    for raw in raws:
        kinds = [x for x in raw["labels"] if x in STYLE_KINDS]
        if len(kinds) != 1 or len(raw["labels"]) != 1:
            other = next((x for x in raw["labels"] if x not in kinds), None)
            message = (
                f"{other} is not a kind of thing a style graph holds: {KINDS}"
                if other
                else f"a thing of a style graph is one of {KINDS}"
            )
            fix = f"write it as one of {KINDS}, or remove it"
            problems.append(style_problem(names["graph"], raw["at"], "GN807", message, fix))
            continue
        unknown = unknown_keys(kinds[0], list(raw["props"]), names["graph"], raw["at"])
        problems.extend(unknown)
        thing = {**raw, "misspelt": True} if unknown else raw
        check, into = _CHECKS.get(kinds[0], (None, None))
        kept = check(thing, names, problems) if check else None
        if kept and not unknown:
            c[into].append(kept)
    return c
