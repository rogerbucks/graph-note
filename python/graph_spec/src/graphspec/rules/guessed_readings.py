"""Readings guessed for a relationship type with none declared, forward and reverse, from the
type's own words."""

from __future__ import annotations

import re


# ── Readings guessed for a type with none declared ───────────────────────────────────────────────
# Forward and reverse, from the type's own words, as the lock writes them for checking (vault task
# of 6 Oct 2026; the same rules as graph-spec-check.js guessReadings, held to one table:
# packages/graph-spec/test/reading-cases.json).
_IRREGULAR = {
    "chose": "was chosen by",
    "made": "was made by",
    "wrote": "was written by",
    "took": "was taken by",
    "gave": "was given by",
    "has": "belongs to",
    "had": "belonged to",
    "is": "is",
    "leads": "is led by",
    "holds": "is held by",
    "sent": "was sent by",
    "paid": "was paid by",
    "built": "was built by",
    "found": "was found by",
    "met": "was met by",
    "led": "was led by",
}
# a passive reading that reverses to its active verb: only where the verb is known, so never a
# wrong guess
_ACTIVE = {
    "proved": "proves",
    "cited": "cites",
    "decided": "decides",
    "owned": "owns",
    "caused": "causes",
    "supported": "supports",
    "written": "writes",
    "made": "makes",
    "chosen": "chooses",
    "approved": "approves",
    "funded": "funds",
    "used": "uses",
    "required": "requires",
    "replaced": "replaces",
    "blocked": "blocks",
    "led": "leads",
    "held": "holds",
}
_NAMED = {"part of": ("is part of", "contains"), "decided in": ("was decided in", "decides")}
_PREPOSITIONS = {
    "by", "of", "in", "on", "to", "from", "with", "for", "at", "into", "about", "against", "under",
    "over",
}  # fmt: skip


def _participle(w):
    return bool(re.search(r"(ed|en)$", w)) or w in _ACTIVE


def reverse_reading(reading: str) -> str:
    """The reverse of a forward reading: the active verb of a known passive, the passive of a verb,
    or a placeholder — never a wrong reading or a doubled preposition."""
    for forward, reverse in _NAMED.values():
        if forward == reading:
            return reverse
    passive = re.fullmatch(r"(is|was) (\w+) (\w+)", reading)
    if passive and passive.group(3) in _PREPOSITIONS:
        if passive.group(3) == "by" and passive.group(2) in _ACTIVE:
            return _ACTIVE[passive.group(2)]
        return f"inverse of {reading}"
    first, *rest = reading.split(" ")
    tail = (" " + " ".join(rest)) if rest else ""
    if first in _IRREGULAR and not (
        _IRREGULAR[first].endswith(" by") and rest and rest[-1] == "by"
    ):
        if _IRREGULAR[first].endswith(" by"):
            return _IRREGULAR[first][: -len(" by")] + tail + " by"
        return _IRREGULAR[first] + tail
    if (
        not first.endswith("s")
        or first.endswith("ss")
        or len(first) < 3
        or (rest and rest[-1] == "by")
    ):
        return f"inverse of {reading}"
    base = first[:-1]
    if base.endswith("e"):
        done = base + "d"
    elif re.search(r"[^aeiou]y$", base):
        done = base[:-1] + "ied"
    else:
        done = base + "ed"
    return f"is {done}{tail} by"


def guess_readings(type_name: str) -> tuple[str, str]:
    """The readings guessed for a relationship type with none declared: (forward, reverse)."""
    written = type_name.replace("_", " ").lower().strip()
    words = re.sub(r"^is ", "", written)
    if words in _NAMED:
        return _NAMED[words]
    parts = words.split(" ")
    passive = len(parts) > 1 and _participle(parts[0]) and parts[-1] in _PREPOSITIONS
    forward = f"is {words}" if passive else written
    return forward, reverse_reading(forward)
