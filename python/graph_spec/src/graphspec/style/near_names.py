"""The name nearest to one written (editor spec §3, §6): the core's estimates.ts distance and
nearest, function for function, so a style's fix offers the name the plugin offers.

Lengths and edits are counted in UTF-16 units, as JavaScript counts a string, so an emoji is two:
'hom🏠' is two edits from 'home' in both languages, never one."""

from __future__ import annotations

from collections.abc import Iterable


def utf16_units(s: str) -> list[int]:
    """A string as JavaScript holds it: its UTF-16 code units."""
    b = s.encode("utf-16-le")
    return [b[i] | b[i + 1] << 8 for i in range(0, len(b), 2)]


def distance(a: str, b: str) -> int:
    """The edit distance between two strings (Levenshtein), in UTF-16 units."""
    x, y = utf16_units(a), utf16_units(b)
    row = list(range(len(y) + 1))
    for i in range(1, len(x) + 1):
        prev, row[0] = row[0], i
        for j in range(1, len(y) + 1):
            t = row[j]
            row[j] = min(t + 1, row[j - 1] + 1, prev + (0 if x[i - 1] == y[j - 1] else 1))
            prev = t
    return row[len(y)]


def _plain(s: str) -> str:
    """A name as the graph library compares near duplicates: case and underscores ignored."""
    return s.replace("_", "").lower()


def nearest(name: str, among: Iterable[str]) -> dict | None:
    """The nearest of `among` to `name`, by the rule decided 7 Oct 2026: near is one letter for
    names under eight characters and two from eight, ignoring case and underscores; a name under
    three characters is never estimated. {'one': name, 'd': distance}, or {'several': names}
    sorted as JavaScript sorts them, or None."""
    if len(utf16_units(name)) < 3:
        return None
    best, found = None, []
    for c in among:
        if c == name:
            continue
        a, b = _plain(name), _plain(c)
        d = distance(a, b)
        if d > (2 if min(len(utf16_units(a)), len(utf16_units(b))) >= 8 else 1):
            continue
        if best is None or d < best:
            best, found = d, [c]
        elif d == best:
            found.append(c)
    if not found:
        return None
    if len(found) == 1:
        return {"one": found[0], "d": best}
    return {"several": sorted(found, key=lambda s: s.encode("utf-16-be"))}
