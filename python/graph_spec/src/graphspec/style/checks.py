"""Each thing of a style graph checked on its own (editor spec §2, style_graph_checked; §6; §14;
§15): its kind, the keys it writes, and for a nudge, a Show or an Arrows its words, its values and
every name it uses, against the graph it styles. The core's style-checks.ts, function for function,
as far as what graph_svg draws goes: what is sound is kept, and each fault is a problem on its line
with its fix, the same words as the core's.

A Look, ViewStyle or Shown is drawn by the plugin alone, never by graph_svg, so here only the keys
it writes are checked; the core checks the rest."""

from __future__ import annotations

from typing import Any

from graphspec.style.near_names import nearest
from graphspec.style.words import (
    ARROWHEADS,
    DIRECTIONS,
    INLINE,
    NUDGE_WORDS,
    STYLE_KINDS,
    or_list,
    replace_first,
    style_problem,
    unknown_keys,
    word_fix,
)

FOUR = "a nudge must be one of four words: beside, before, group or direction"
KINDS = f"{', '.join(STYLE_KINDS[:-1])} or {STYLE_KINDS[-1]}"
# What a Show is for: one kind, thing or relationship type (§14).
SHOW_FOR = "a Show is for one kind, thing or relationship type"


class _Reader:
    """Reads one thing's properties, reporting each fault: a value of the wrong type, a word not
    allowed, a name not there."""

    def __init__(self, raw, names, out):
        self.raw, self.names, self.out = raw, names, out

    def report(self, message, fix):
        self.out.append(style_problem(self.names["graph"], self.raw["at"], message, fix))

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


def check_things(raws: list[dict], names: dict) -> dict[str, list[dict]]:
    """Each thing of a style graph checked on its own, in the order written: the nudges, Shows and
    Arrows that are sound, and the problems found ({nudges, shows, arrows, problems}). A raw thing
    is {labels (in the order written), props, at: {block, line, id}}; names is {graph, things,
    kinds, types: names in the graph styled, properties(of): the property names of a kind's things,
    a thing or a type's links}. A thing that writes a key its kind does not know is reported on
    the key and left out, and what it lacks is not yet said: it may be that key, misspelt."""
    c: dict[str, list[dict]] = {"nudges": [], "shows": [], "arrows": [], "problems": []}
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
            problems.append(style_problem(names["graph"], raw["at"], message, fix))
            continue
        unknown = unknown_keys(kinds[0], list(raw["props"]), names["graph"], raw["at"])
        problems.extend(unknown)
        thing = {**raw, "misspelt": True} if unknown else raw
        check = {"Nudge": _nudge_of, "Show": _show_of, "Arrows": _arrows_of}.get(kinds[0])
        kept = check(thing, names, problems) if check else None
        if kept and not unknown:
            c[{"Nudge": "nudges", "Show": "shows", "Arrows": "arrows"}[kinds[0]]].append(kept)
    return c
