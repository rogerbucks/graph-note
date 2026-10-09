"""The GQL queries written inside a Python script, so §24 H1 lints them too."""

from __future__ import annotations

import re


EMBEDDED = re.compile(
    r"""(?:\bQ_?\(\s*(?:self\.)?db\s*,|_q\([^,]+,[^,]+,|\.execute(?:_cypher)?\()\s*(f?)(["'])(.*?)(?<!\\)\2""",
    re.S,
)


def embedded_queries(path: str) -> list[tuple[int, str]]:
    """The GQL queries written inside a Python script — (line, text), an f-string's slots replaced
    by a placeholder value. §24 H1 lints them too."""
    src = open(path, encoding="utf-8").read()
    out = []
    for m in EMBEDDED.finditer(src):
        q = m.group(3)
        if m.group(1):
            q = (
                re.sub(r"\{[^{}]*\}", "_", q.replace("{{", "\x00").replace("}}", "\x01"))
                .replace("\x00", "{")
                .replace("\x01", "}")
            )
        if re.search(r"\b(MATCH|INSERT|RETURN)\b", q):
            out.append((src.count("\n", 0, m.start()) + 1, q))
    return out
