"""A block's top-level items (spec §3), as the core's block-items.ts finds them: each path, SET or
MATCH by where it is in the text, so what cannot be read can be left out of the drawing while the
rest is drawn; and the text with strings and comments blanked, so words in them never match."""

from __future__ import annotations

import re

# JavaScript's . — any character but a line break — which the core's patterns use
_NOT_BREAK = "[^\n\r  ]"


def _items(text):
    """A block's top-level items, as (start, end, comma at): split at commas outside brackets,
    strings and comments, and before SET, MATCH and INSERT; comma at is -1 when none ends it."""
    out = []
    depth, start, last, i, n = 0, -1, -1, 0, len(text)

    def end(comma):
        nonlocal start
        if start != -1:
            out.append((start, last + 1, comma))
        start = -1

    while i < n:
        c = text[i]
        if c == "/" and text[i + 1 : i + 2] == "/":
            while i < n and text[i] != "\n":
                i += 1
            i += 1
            continue
        if c.isspace():
            i += 1
            continue
        if (
            depth == 0
            and re.match(r"[A-Za-z]", c)
            and (i == 0 or not re.match(r"\w", text[i - 1], re.ASCII))
        ):
            w = re.match(r"[A-Za-z]+", text[i:]).group(0).upper()
            if w in ("SET", "MATCH", "INSERT") and start != -1:
                end(-1)
        if c == "," and depth == 0:
            end(i)
            i += 1
            continue
        # a path closed at the end of one line and another opened on the next: a missing comma,
        # so two items, for recovery
        if (
            c == "("
            and depth == 0
            and start != -1
            and text[last] == ")"
            and "\n" in text[last + 1 : i]
        ):
            end(-1)
        if start == -1:
            start = i
        if c == "'":
            i += 1
            while i < n and text[i] != "'":
                i += 2 if text[i] == "\\" else 1
            i = min(i, n - 1)
        elif c in "([{":
            depth += 1
        elif c in ")]}":
            depth = max(0, depth - 1)
        last = i
        i += 1
    end(-1)
    return out


def _line_at(text, pos):
    return text[:pos].count("\n") + 1


def _without(text, every, drop):
    """The block with items blanked out (newlines kept, so every other line keeps its number),
    with the comma beside each."""
    chars = list(text)

    def blank(a, b):
        for k in range(a, b):
            if chars[k] != "\n":
                chars[k] = " "

    for it in drop:
        blank(it[0], it[1])
        at = every.index(it)
        prior = every[at - 1] if at > 0 else None
        # keep its comma when the one before it is missing: it is then all that parts what came
        # before from what comes after
        if it[2] != -1 and not (prior and prior[2] == -1 and prior not in drop):
            blank(it[2], it[2] + 1)
        elif prior and prior[2] != -1 and prior not in drop:
            blank(prior[2], prior[2] + 1)
    return "".join(chars)


def blank_text(text: str) -> str:
    """The text with strings and comments blanked to spaces, so places hold and words in them
    never match."""
    text = re.sub(rf"'(?:[^'\\\n]|\\{_NOT_BREAK})*'?", lambda m: " " * len(m.group(0)), text)
    return re.sub(r"//[^\n]*", lambda m: " " * len(m.group(0)), text)
