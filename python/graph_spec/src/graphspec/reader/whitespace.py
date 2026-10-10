"""Whitespace as GQL names it (§3), the one set every reader uses, never the language's own idea
of it: Python's isspace() and str.split() take in U+0085, splitlines() also ends a line at U+2028
and seven more, and each leaves out what GQL counts. A line ends at LF only. The same code points
are in packages/graph-spec/src/reader/whitespace.js (decided 10 Oct 2026)."""

from __future__ import annotations

CODES = (
    *(0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x1C, 0x1D, 0x1E, 0x1F, 0x20, 0xA0, 0x1680, 0x180E),
    *range(0x2000, 0x200B),
    *(0x2028, 0x2029, 0x202F, 0x205F, 0x3000),
)
SPACE = "".join(map(chr, CODES))
# one whitespace character, and one that is not, for building a pattern: f"{S}*", f"({N}+)"
S, N = f"[{SPACE}]", f"[^{SPACE}]"


def is_space(c: str) -> bool:
    """Whether one character is whitespace."""
    return c != "" and c in SPACE


def strip(s: str) -> str:
    """The text without the whitespace it starts and ends with."""
    return s.strip(SPACE)


def rstrip(s: str) -> str:
    """The text without the whitespace it ends with."""
    return s.rstrip(SPACE)


def lstrip(s: str) -> str:
    """The text without the whitespace it starts with."""
    return s.lstrip(SPACE)
