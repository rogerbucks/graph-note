"""Each thing of a style graph checked on its own (editor spec §2, style_graph_checked; §6): its
kind, and for a nudge its word, its values and every thing it names, against the graph it styles.
The core's style-checks.ts, function for function, as far as nudges go: what is sound is kept,
and each fault is a problem on its line with its fix, the same words as the core's.

A Show, Look, ViewStyle or Shown is drawn by the plugin alone, never by graph_svg, so here it is
taken as a style thing and not read further; the core checks it."""

from __future__ import annotations

from typing import Any

from graphspec.style.near_names import nearest
from graphspec.style.words import (
    DIRECTIONS,
    NUDGE_WORDS,
    STYLE_KINDS,
    or_list,
    replace_first,
    style_problem,
    word_fix,
)

FOUR = "a nudge must be one of four words: beside, before, group or direction"
KINDS = f"{', '.join(STYLE_KINDS[:-1])} or {STYLE_KINDS[-1]}"


class _Reader:
    """Reads one thing's properties, reporting each fault: a value of the wrong type, a word not
    allowed, a name not there."""

    def __init__(self, raw, names, out):
        self.raw, self.names, self.out = raw, names, out

    def report(self, message, fix):
        self.out.append(style_problem(self.names["graph"], self.raw["at"], message, fix))

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
        r.report(FOUR, "add word: " + or_list([f"'{w}'" for w in NUDGE_WORDS]))
        return None
    word = r.word("word", NUDGE_WORDS, FOUR, True)
    if not word:
        return None
    n: dict[str, Any] = {"word": word, "at": raw["at"]}
    things = names["things"]
    if word in ("beside", "before"):
        missing = next((k for k in ("thing", "other") if k not in props), None)
        if missing:
            r.report(f"a {word} nudge names two things: thing and other", f"add {missing}: '<id>'")
        else:
            n["thing"] = r.name("thing", things, "a thing", "the id of a thing")
            n["other"] = r.name("other", things, "a thing", "the id of a thing")
    elif word == "group":
        if "thing" not in props:
            r.report("a group nudge names a thing and its group", "add thing: '<id>'")
        elif "group" not in props:
            r.report(
                "a group nudge names a thing and its group", "add group: '<the group's label>'"
            )
        else:
            n["thing"] = r.name("thing", things, "a thing", "the id of a thing")
            n["group"] = r.text("group")
    elif "direction" not in props:
        r.report(
            "a direction nudge names its direction",
            "add direction: " + or_list([f"'{d}'" for d in DIRECTIONS]),
        )
    else:
        message = "$ is not a direction the locked style lays out in"
        n["direction"] = r.word("direction", DIRECTIONS, message)
    return n if len(out) == before else None


def check_things(raws: list[dict], names: dict) -> tuple[list[dict], list[dict]]:
    """Each thing of a style graph checked on its own, in the order written: the nudges that are
    sound, and the problems found. A raw thing is {labels (in the order written), props, at:
    {block, line, id}}; names is {graph, things: the ids of the graph styled}."""
    nudges, problems = [], []
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
        if kinds[0] == "Nudge":
            n = _nudge_of(raw, names, problems)
            if n:
                nudges.append(n)
    return nudges, problems
