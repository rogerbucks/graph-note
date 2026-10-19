"""Splits a data block into tokens and reads its header — the first step of reading the
document profile (§3); ProfileError, the one error every reading step raises."""

from __future__ import annotations

import datetime as dt
import re

from graphspec.reader.whitespace import N, S, strip


UTC = dt.timezone.utc


class ProfileError(ValueError):
    """A block outside the profile: its line, what is wrong, the fix — and, where the fix is one
    insertion, `at`: the character on the line it goes before (0-based). `code` is the problem's
    stable code, the same from the JavaScript reader (editor spec §42, problem_codes); the table of
    codes is packages/graph-spec/src/reader/problem-codes.json, which this library never reads:
    each raise passes its code as a literal."""

    def __init__(self, line, message, fix, at=None, code=None):
        super().__init__(f"line {line}: {message} — {fix}")
        self.line, self.message, self.fix, self.at = line, message, fix, at
        self.code = code


TOKEN = re.compile(
    S + r"""*(?:(?P<str>'(?:[^'\\]|\\.)*')"""
    r"""|(?P<num>-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"""
    r"""|(?P<id>[A-Za-z_][A-Za-z0-9_]*)"""
    r"""|(?P<arrow>->)"""
    r"""|(?P<p>[()\[\]{}:,.=-]))""",
    re.ASCII,  # \d and \b as JavaScript's: a digit or letter in another script is neither
)
KEYWORDS = {"INSERT", "MATCH", "SET", "DATE", "DATETIME", "TRUE", "FALSE"}
# only whitespace from here to the line's end, matched in place. Slicing the rest of the line
# before every token would make one long line quadratic to read (editor spec §9)
BLANK_REST = re.compile(rf"{S}*\Z")
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
        raise ProfileError(
            1, "the block names no graph", "start it with '// graph: <name>'", code="GN101"
        )
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
            "use letters, digits and underscores only, such as reader_choice, not reader-choice",
            code="GN102",
        )
    return m.group(1), kind


# §3: comments are whole lines; one after code on its line cannot be told from // inside an
# identifier
COMMENT_RULE = (
    "a comment must be on a line of its own: // also occurs inside values, such as ni:/// hashes"
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
            if BLANK_REST.match(raw, pos):
                break
            m = TOKEN.match(raw, pos)
            if not m and strip(raw[pos:]).startswith("//"):
                raise ProfileError(
                    n, COMMENT_RULE, COMMENT_FIX, code="GN103"
                )  # a comment after code (§3)
            if not m:
                # quoted as the JavaScript quotes it: repr() would escape what it cannot print
                raise ProfileError(
                    n,
                    f"cannot read '{_excerpt(strip(raw[pos:]))}'",
                    "a data block holds only things, links and plain values",
                    code="GN104",
                )
            kind = m.lastgroup
            text = m.group(kind)
            raw_text = text
            bad = bad_escape(text[1:-1]) if kind == "str" else None
            if bad:  # req:3.gql-escapes: refused at its backslash, whose fix doubles it
                raise ProfileError(
                    n,
                    f"'{bad[1]}' is not an escape GQL names",
                    f"double the backslash to write a backslash: \\{bad[1]}",
                    m.start(kind) + 1 + bad[0],
                    code="GN105",
                )
            if kind == "id" and text.upper() in KEYWORDS:
                kind, text = "kw", text.upper()
            out.append((kind, text, n, raw_text, line_begins + m.end()))
            pos = m.end()
    return out


# req:3.gql-escapes: the escapes ISO GQL names — each character after a backslash, and \uXXXX and
# \UXXXXXX for a character by its code point
ESCAPES = {
    "\\": "\\",
    "'": "'",
    '"': '"',
    "`": "`",
    "t": "\t",
    "b": "\b",
    "n": "\n",
    "r": "\r",
    "f": "\f",
}
HEX = {"u": 4, "U": 6}


def _code_point(s: str, i: int) -> int | None:
    """The character a \\u or \\U escape at s[i] names, or None when it names none."""
    digits = s[i + 2 : i + 2 + HEX[s[i + 1]]]
    if len(digits) != HEX[s[i + 1]] or not re.fullmatch(r"[0-9A-Fa-f]+", digits):
        return None
    cp = int(digits, 16)
    return None if cp > 0x10FFFF or 0xD800 <= cp <= 0xDFFF else cp


def bad_escape(s: str) -> tuple[int, str] | None:
    """The first escape GQL does not name in a quoted text (quotes off): where its backslash is,
    and the escape as written — for \\u and \\U, with the digits that follow. None when every
    escape is one GQL names."""
    i = s.find("\\")
    while i != -1:
        c = s[i + 1 : i + 2]
        if c in HEX:
            if _code_point(s, i) is None:
                return i, s[i : i + 2 + HEX[c]]
            i = s.find("\\", i + 2 + HEX[c])
        elif c in ESCAPES:
            i = s.find("\\", i + 2)
        else:
            return i, s[i : i + 2]
    return None


# each character a writer escapes, and its escape: all GQL names but the double quote and backtick,
# which a single-quoted text holds as themselves
WRITTEN = {c: "\\" + e for e, c in ESCAPES.items() if e not in '"`'}


def quote(s: str) -> str:
    """A text quoted as the profile writes it: a backslash, a quote and each control character GQL
    has an escape for written as that escape, so the text reads back on one line, as itself."""
    return "'" + "".join(WRITTEN.get(c, c) for c in s) + "'"


def unquote(s: str) -> str:
    """A quoted profile string's text: its quotes taken off and its escapes read as GQL reads them
    (req:3.gql-escapes; tokens() has refused any GQL does not name)."""

    def one(m):
        e = m.group(1)
        return chr(int(e[1:], 16)) if e[0] in HEX else ESCAPES[e]

    return re.sub(r"\\(u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{6}|.)", one, s[1:-1], flags=re.S)
