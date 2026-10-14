"""The words a style graph may use for what graph_svg draws — its nudges (editor spec §6,
four_nudge_words), the properties it shows inline (§14), where it hides arrowheads and the diagram
type it chooses (§15), how links move (§7), and how they are routed and merged and a view's
switches saved (§25) — the
keys each kind of style thing may have, and how a problem with one is said: the core's
style-graph.ts and style-words.ts, as far as these need them. The directions and sizes are the
locked style's, from graph_svg.style.json, the one file both renderers read."""

from __future__ import annotations

import json
import os
from collections.abc import Sequence

from graphspec.style.near_names import distance, nearest, utf16_units

_STYLE_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "graph_svg.style.json")
with open(_STYLE_FILE, encoding="utf-8") as _f:
    LOCKED: dict = json.load(_f)
DIRECTIONS: list[str] = LOCKED["directions"]

# The four words a nudge may be (§6, four_nudge_words).
NUDGE_WORDS = ("beside", "before", "group", "direction")
# Whether a property is shown inline (§14): on, unless a Show switches it off.
INLINE = ("on", "off")
# Whether links are drawn with their arrowheads (§15): shown, unless the style graph hides them.
ARROWHEADS = ("show", "hide")
# The diagram types (§15, diagram_type_set): what fits each, and how each is laid out, is in
# graphspec/style/diagram_types.py.
DIAGRAM_TYPES = ("network", "tree", "flow", "radial", "lanes", "timeline", "table")
# How a link moves to show flow (§7, links_show_flow): dashes, a dot, or still; still unless a
# Flow moves it (graphspec/style/flow.py).
FLOW_MOTIONS = ("dashes", "dot", "still")
# How links are drawn (§25, untangle_routing): curved, as Graphviz draws them, straight, or with
# right angles.
ROUTINGS = ("curved", "straight", "right-angled")
# A switch written in the style graph: links merged into trunks (§25), or a view's switches saved.
ON_OFF = ("on", "off")
# The View menu's switches a view saved as shown keeps (§25, view_switch_view_only).
SAVED_SWITCHES = ("labels", "hubs", "groups", "merge")
# The kinds of thing a style graph holds, by label.
STYLE_KINDS = (
    "Nudge",
    "Show",
    "Look",
    "ViewStyle",
    "Shown",
    "Arrows",
    "Diagram",
    "Flow",
    "Links",
    "Picture",
)
# The keys each kind of style thing may have (§2, style_words_checked); a thing's id is its name.
STYLE_KEYS = {
    "Nudge": ("word", "thing", "other", "group", "direction"),
    "Show": ("property", "kind", "thing", "type", "view", "inline"),
    "Look": (
        "view",
        "path",
        "thing",
        "kind",
        "from",
        "type",
        "to",
        "colour",
        "line",
        "format",
        "means",
    ),
    "ViewStyle": ("view", "outside"),
    "Shown": ("view", "zoom", "x", "y", "frame", "selected", *SAVED_SWITCHES),
    "Arrows": ("arrowheads", "view", "type"),
    "Diagram": ("type", "view", "relationship"),
    "Flow": ("motion", "means", "type", "view"),
    "Links": ("view", "routing", "merge"),
    "Picture": ("property", "kind", "thing", "view"),
}


def article(word: str) -> str:
    """A word as a sentence says it before a kind's name: 'an Arrows', 'a Show'."""
    return "an" if word[:1].upper() in ("A", "E", "I", "O", "U") else "a"


def or_list(xs: Sequence[str]) -> str:
    """Words joined as a sentence lists them: 'a, b or c'."""
    if len(xs) < 2:
        return xs[0] if xs else ""
    return f"{', '.join(xs[:-1])} or {xs[-1]}"


def word_fix(written: str, among: Sequence[str], always: bool = False) -> dict:
    """The fix for a word that is not one of `among`: the nearest by edit distance — always, when
    `always` is set (a nudge's word, §6); otherwise only when it is close (within two letters, or
    half the word) — else the list to choose from. {'fix': …, 'nearest': … or None}. Case is
    ignored on both sides, as the core ignores it, so 'tb' is fixed to TB, the direction it
    means."""
    best, near = None, None
    for w in among:
        d = distance(written.lower(), w.lower())
        if best is None or d < best:
            best, near = d, w
    if near is not None and (always or best <= max(2, len(utf16_units(written)) // 2)):
        return {"fix": f"change {written} to {near}", "nearest": near}
    some = "one of " if len(among) > 2 else ""
    return {"fix": f"change {written} to {some}{or_list(among)}", "nearest": None}


def style_problem(graph: str, at: dict, message: str, fix: str) -> dict:
    """A problem with the style of `graph`, on the line of the style thing at `at`: an error, as
    what it names is left out of the style, and the graph is drawn without it."""
    return {
        "graph": graph,
        "block": at["block"],
        "line": at["line"],
        "severity": "error",
        "message": message,
        "fix": fix,
    }


def unknown_keys(kind: str, written: Sequence[str], graph: str, at: dict) -> list[dict]:
    """A problem for each key written on a thing of `kind` that the style graph does not know, as
    the core's style-words.ts unknownKeys says it: the fix is the nearest known key the thing does
    not already write, or, of several equally near, each of them; with none near, the keys to
    choose from."""
    known = STYLE_KEYS[kind]
    out = []
    for k in written:
        if k == "id" or k in known:
            continue
        near = nearest(k, [c for c in known if c not in written])
        by = [] if not near else [near["one"]] if "one" in near else near["several"]
        if by:
            mean = "the one you mean: " if len(by) > 1 else ""
            fix = f"change {k} to {mean}{or_list(by)}"
        else:
            fix = f"remove {k}, or use one of {or_list(known)}"
        out.append(style_problem(graph, at, f"{k} is not a key {article(kind)} {kind} uses", fix))
    return out


def replace_first(s: str, pattern: str, replacement: str) -> str:
    """The first occurrence of `pattern` in `s` replaced by `replacement` exactly as written, as
    the core does it (`message.replace('$', () => v)`): a dollar sign followed by &, $, a backtick
    or an apostrophe in the written word is the word's own, never one of JavaScript's replacement
    patterns."""
    at = s.find(pattern)
    if at == -1:
        return s
    return s[:at] + replacement + s[at + len(pattern) :]
