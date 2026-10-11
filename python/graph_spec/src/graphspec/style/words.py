"""The words a style graph may use for its nudges (editor spec §6, four_nudge_words), and how a
problem with one is said: the core's style-graph.ts, as far as nudges need it. The directions are
the locked style's, from graph_svg.style.json, the one file both renderers read."""

from __future__ import annotations

import json
import os
from collections.abc import Sequence

from graphspec.style.near_names import distance, utf16_units

_STYLE_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "graph_svg.style.json")
with open(_STYLE_FILE, encoding="utf-8") as _f:
    DIRECTIONS: list[str] = json.load(_f)["directions"]

# The four words a nudge may be (§6, four_nudge_words).
NUDGE_WORDS = ("beside", "before", "group", "direction")
# The kinds of thing a style graph holds, by label.
STYLE_KINDS = ("Nudge", "Show", "Look", "ViewStyle", "Shown")


def or_list(xs: Sequence[str]) -> str:
    """Words joined as a sentence lists them: 'a, b or c'."""
    if len(xs) < 2:
        return xs[0] if xs else ""
    return f"{', '.join(xs[:-1])} or {xs[-1]}"


def word_fix(written: str, among: Sequence[str], always: bool = False) -> dict:
    """The fix for a word that is not one of `among`: the nearest by edit distance — always, when
    `always` is set (a nudge's word, §6); otherwise only when it is close (within two letters, or
    half the word) — else the list to choose from. {'fix': …, 'nearest': … or None}."""
    best, near = None, None
    for w in among:
        d = distance(written.lower(), w)
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


def js_replace_first(s: str, pattern: str, replacement: str) -> str:
    """s.replace(pattern, replacement) as JavaScript does it for a string pattern: the first
    occurrence only, and the replacement read for $$, $&, $` and $' as JavaScript reads them, so
    a message built so says exactly what the core's says."""
    at = s.find(pattern)
    if at == -1:
        return s
    out, i = [], 0
    while i < len(replacement):
        c, nxt = replacement[i], replacement[i + 1 : i + 2]
        if c == "$" and nxt in ("$", "&", "`", "'"):
            out.append({"$": "$", "&": pattern, "`": s[:at], "'": s[at + len(pattern) :]}[nxt])
            i += 2
        else:
            out.append(c)
            i += 1
    return s[:at] + "".join(out) + s[at + len(pattern) :]
