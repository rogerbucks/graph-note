"""Splits a data block into tokens and reads its header — the first step of reading the
document profile (§3); ProfileError, the one error every reading step raises."""

from __future__ import annotations

import datetime as dt
import re

from graphspec.reader.whitespace import N, S, strip


UTC = dt.timezone.utc


class ProfileError(ValueError):
    def __init__(self, line, message, fix):
        super().__init__(f"line {line}: {message} — {fix}")
        self.line, self.message, self.fix = line, message, fix


TOKEN = re.compile(
    S + r"""*(?:(?P<str>'(?:[^'\\]|\\.)*')"""
    r"""|(?P<num>-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"""
    r"""|(?P<id>[A-Za-z_][A-Za-z0-9_]*)"""
    r"""|(?P<arrow>->)"""
    r"""|(?P<p>[()\[\]{}:,.=-]))""",
    re.ASCII,  # \d and \b as JavaScript's: a digit or letter in another script is neither
)
KEYWORDS = {"INSERT", "MATCH", "SET", "DATE", "DATETIME", "TRUE", "FALSE"}
EXCERPT = re.compile(rf"{S}*//{S}*excerpt\b", re.I | re.ASCII)
GRAPH = re.compile(rf"{S}*//{S}*graph:{S}*({N}+)([^\n]*)$")
SCHEMA = re.compile(rf"·{S}*SCHEMA{S}+{N}+")
EXCERPT_OF = re.compile(rf"·{S}*excerpt\b", re.I | re.ASCII)
QUERY = re.compile(rf"·{S}*QUERY\b", re.ASCII)
CHANGE_SET = re.compile(rf"·{S}*CHANGE SET\b", re.ASCII)


def header(block: str) -> tuple[str | None, str]:
    """A block's graph and its kind — 'data', 'schema', 'query', 'changeset' or 'excerpt' — read
    from its first line (§3); an excerpt need name no graph. Raises ProfileError when the line
    names no graph, or a graph name that is not one word."""
    first = next((line for line in block.split("\n") if strip(line)), "")
    if EXCERPT.match(first):
        return None, "excerpt"  # an illustration, said to be one (§3)
    m = GRAPH.match(first)
    if not m:
        raise ProfileError(1, "the block names no graph", "start it with '// graph: <name>' (§3)")
    rest = m.group(2)
    kind = (
        "schema"
        if SCHEMA.search(rest)
        else "excerpt"
        if EXCERPT_OF.search(rest)
        else "query"
        if QUERY.search(rest)
        else "changeset"
        if CHANGE_SET.search(rest)
        else "data"
    )
    # a GQL engine names a graph by an identifier — 'reader-choice' cannot be loaded
    if kind != "excerpt" and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", m.group(1)):
        raise ProfileError(
            1,
            f"the graph name '{m.group(1)}' is not one word",
            "use letters, digits and underscores only — reader_choice, not reader-choice (§3)",
        )
    return m.group(1), kind


# §3: comments are whole lines; one after code on its line cannot be told from // inside an
# identifier
COMMENT_RULE = (
    "a comment must be on a line of its own: // also occurs inside identifiers, such as ni:/// "
    "hashes (§3)"
)
COMMENT_FIX = "put the comment on its own line"


def _excerpt(s: str, n: int = 20) -> str:
    """The start of a text, cut at n UTF-16 units as the JavaScript reader counts them, and never
    inside an emoji: a cut that would split one moves back a unit."""
    units = s.encode("utf-16-le", "surrogatepass")[: 2 * n]
    if len(units) == 2 * n and 0xD800 <= int.from_bytes(units[-2:], "little") <= 0xDBFF:
        units = units[:-2]
    return units.decode("utf-16-le", "surrogatepass")


def tokens(block: str) -> list[tuple[str, str, int, str, int]]:
    """(kind, text, line, raw, end) for every token, whole-line comments removed — '//' also
    occurs inside ni:/// ids. raw is the token as written; end is where it ends in the block."""
    out = []
    # offsets count code points, as Python strings index; the JavaScript reader counts UTF-16
    # units. Each is used only on the text it was counted in (Store.corrected), so both readers
    # write the same text
    begins = 0  # where line n begins in the block
    for n, raw in enumerate(block.split("\n"), 1):
        line_begins, begins = begins, begins + len(raw) + 1
        if strip(raw).startswith("//"):
            continue
        pos = 0
        while pos < len(raw):
            if not strip(raw[pos:]):
                break
            m = TOKEN.match(raw, pos)
            if not m and strip(raw[pos:]).startswith("//"):
                raise ProfileError(n, COMMENT_RULE, COMMENT_FIX)  # a comment after code (§3)
            if not m:
                # quoted as the JavaScript quotes it: repr() would escape what it cannot print
                raise ProfileError(
                    n,
                    f"cannot read '{_excerpt(strip(raw[pos:]))}'",
                    "a data block holds only nodes, relationships and simple values",
                )
            kind = m.lastgroup
            text = m.group(kind)
            raw_text = text
            if kind == "id" and text.upper() in KEYWORDS:
                kind, text = "kw", text.upper()
            out.append((kind, text, n, raw_text, line_begins + m.end()))
            pos = m.end()
    return out


def unquote(s: str) -> str:
    """A quoted profile string's text: its quotes taken off and its escapes read."""
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t"}.get(m.group(1), m.group(1)), s[1:-1])
