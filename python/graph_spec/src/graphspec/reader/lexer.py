"""Splits a data block into tokens and reads its header — the first step of reading the
document profile (§3); ProfileError, the one error every reading step raises."""

from __future__ import annotations

import datetime as dt
import re


UTC = dt.timezone.utc


class ProfileError(ValueError):
    def __init__(self, line, message, fix):
        super().__init__(f"line {line}: {message} — {fix}")
        self.line, self.message, self.fix = line, message, fix


TOKEN = re.compile(
    r"""\s*(?:(?P<str>'(?:[^'\\]|\\.)*')"""
    r"""|(?P<num>-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"""
    r"""|(?P<id>[A-Za-z_][A-Za-z0-9_]*)"""
    r"""|(?P<arrow>->)"""
    r"""|(?P<p>[()\[\]{}:,.=-]))"""
)
KEYWORDS = {"INSERT", "MATCH", "SET", "DATE", "DATETIME", "TRUE", "FALSE"}


def header(block: str) -> tuple[str | None, str]:
    """A block's graph and its kind — 'data', 'schema', 'query', 'changeset' or 'excerpt' — read
    from its first line (§3); an excerpt need name no graph. Raises ProfileError when the line
    names no graph, or a graph name that is not one word."""
    first = next((line for line in block.splitlines() if line.strip()), "")
    if re.match(r"\s*//\s*excerpt\b", first, re.I):
        return None, "excerpt"  # an illustration, said to be one (§3)
    m = re.match(r"\s*//\s*graph:\s*(\S+)(.*)$", first)
    if not m:
        raise ProfileError(1, "the block names no graph", "start it with '// graph: <name>' (§3)")
    rest = m.group(2)
    kind = (
        "schema"
        if re.search(r"·\s*SCHEMA\s+\S+", rest)
        else "excerpt"
        if re.search(r"·\s*excerpt\b", rest, re.I)
        else "query"
        if re.search(r"·\s*QUERY\b", rest)
        else "changeset"
        if re.search(r"·\s*CHANGE SET\b", rest)
        else "data"
    )
    # a GQL engine names a graph by an identifier — 'reader-choice' cannot be loaded
    if kind != "excerpt" and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", m.group(1)):
        raise ProfileError(
            1,
            f"the graph name {m.group(1)!r} is not one word",
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


def tokens(block: str) -> list[tuple[str, str, int, str]]:
    """(kind, text, line) for every token, whole-line comments removed — '//' also occurs inside
    ni:/// ids."""
    out = []
    for n, raw in enumerate(block.splitlines(), 1):
        if raw.strip().startswith("//"):
            continue
        pos = 0
        while pos < len(raw):
            if not raw[pos:].strip():
                break
            m = TOKEN.match(raw, pos)
            if not m and raw[pos:].strip().startswith("//"):
                raise ProfileError(n, COMMENT_RULE, COMMENT_FIX)  # a comment after code (§3)
            if not m:
                raise ProfileError(
                    n,
                    f"cannot read {raw[pos:].strip()[:20]!r}",
                    "a data block holds only nodes, relationships and simple values",
                )
            kind = m.lastgroup
            text = m.group(kind)
            raw_text = text
            if kind == "id" and text.upper() in KEYWORDS:
                kind, text = "kw", text.upper()
            out.append((kind, text, n, raw_text))
            pos = m.end()
    return out


def unquote(s: str) -> str:
    """A quoted profile string's text: its quotes taken off and its escapes read."""
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t"}.get(m.group(1), m.group(1)), s[1:-1])
