"""§24 H1 the dialect linter: every known E10 trap in a GQL text flagged before it runs,
with its fix."""

from __future__ import annotations

import re
from typing import Any


# ── §24 H1: the dialect linter ────────────────────────────────────────────────────────────────
# Every known E10 trap flagged before a block runs, with its fix.
RESERVED_ANYWHERE = {
    "for",
    "groups",
    "group",
}  # rejected by Grafeo 0.5.43 as a key, label, type or variable
AGGREGATES = r"\b(sum|count|avg|min|max|collect)\s*\("


def _blank(text):
    """Comments removed and string contents blanked, keeping every position — so nothing inside a
    string is linted."""
    out = re.sub(r"//[^\n]*", lambda m: " " * len(m.group(0)), text)
    return re.sub(r"'(?:[^'\\]|\\.)*'", lambda m: "'" + " " * (len(m.group(0)) - 2) + "'", out)


def _close(src, i):
    depth = 0
    for j in range(i, len(src)):
        depth += {"(": 1, ")": -1}.get(src[j], 0)
        if depth == 0:
            return j
    return len(src) - 1


def lint(text: str) -> list[dict[str, Any]]:
    """The E10 traps in a GQL text, as findings {trap, line, text, fix}. Four of them return a
    wrong answer with no error."""
    src, out = _blank(text), []

    def add(trap, pos, snippet, fix):
        out.append(
            {
                "trap": trap,
                "line": src.count("\n", 0, pos) + 1,
                "text": snippet.strip()[:80],
                "fix": fix,
            }
        )

    for m in re.finditer(r"(?:(?<=[:.({,])|(?<=[:.({,]\s))\s*([A-Za-z_]\w*)\b", src):
        w = m.group(1)
        if w.lower() in RESERVED_ANYWHERE and not re.match(r"\s*BY\b", src[m.end() :], re.I):
            add(
                "reserved word",
                m.start(1),
                w,
                f"rename '{w}' — Grafeo 0.5.43 rejects it as a name (E10)",
            )
    for m in re.finditer(r"\(\s*(on)\s*[:)]", src):
        add(
            "reserved word",
            m.start(1),
            m.group(0),
            "rename the variable 'on' — Grafeo 0.5.43 rejects it (E10)",
        )
    for m in re.finditer(r"\bZONED\s+DATETIME\b", src, re.I):
        add(
            "zoned datetime",
            m.start(),
            m.group(0),
            "use DATETIME with an offset — a ZONED DATETIME comparison returns null, "
            "silently (E10)",
        )
    for m in re.finditer(AGGREGATES, src, re.I):
        end = _close(src, m.end() - 1)
        after = src[end + 1 : end + 60]
        before = src[max(0, m.start() - 60) : m.start()]
        right = re.match(r"\s*(<>|<=|>=|[<>=+\-*/%])\s*([\w.]+)", after)
        left = re.search(r"([\w.]+)\s*(<>|<=|>=|[<>=+\-*/%])\s*$", before)
        if (right and "." in right.group(2)) or (left and "." in left.group(1)):
            add(
                "aggregate mixed with a value",
                m.start(),
                src[m.start() : end + 1 + (right.end() if right else 0)],
                "aggregate first with WITH, then compare — "
                "mixed in one expression it returns null, silently (E10)",
            )
    for m in re.finditer(
        r"\bMATCH\b(.*?)(?=\b(?:WHERE|RETURN|WITH|INSERT|SET|MATCH|OPTIONAL|ORDER|DELETE|CALL|LIMIT)\b|$)",
        src,
        re.S | re.I,
    ):
        for chain in re.split(r",(?![^()\[\]{}]*[)\]}])", m.group(1)):
            names = re.findall(r"\(\s*([A-Za-z_]\w*)", chain)
            if len(names) != len(set(names)):
                add(
                    "pattern returns to a bound variable",
                    m.start(1),
                    chain,
                    "match twice and compare ids — a pattern returning to its own variable is not "
                    "enforced, silently (E10)",
                )
    for m in re.finditer(r"\bSET\b", src, re.I):
        if re.search(r"\bINSERT\b", src[m.end() :], re.I):
            add(
                "SET before INSERT",
                m.start(),
                src[m.start() : m.start() + 40],
                "write MATCH … INSERT … SET — Grafeo rejects SET before INSERT (E10)",
            )
    for m in re.finditer(r"(?<![\w\-\]>)'])\s*\[", src):
        end = src.find("]", m.end())
        body = re.sub(
            r"\{[^{}]*\}", "", src[m.end() : end]
        )  # a map inside the list keeps its nulls safely
        if re.search(r"[A-Za-z_]\w*\.(?!id\b)[A-Za-z_]", body) and not body.lstrip().startswith(
            ":"
        ):  # an id is never null (§10)
            add(
                "list literal with values that may be null",
                m.start(),
                src[m.start() : end + 1],
                "return a map — a list literal drops its null elements and shifts positions, "
                "silently (E10)",
            )
    for m in re.finditer(r"(?<!\w)[Xx]'", src):
        add(
            "byte literal",
            m.start(),
            text[m.start() : m.start() + 20],
            "store bytes in a blob and link it by hash (§13, E6) — Grafeo has no byte literals",
        )
    if re.match(
        r"\s*//\s*graph:", text
    ):  # a data block must also keep to the document profile (portable checker P1)
        from graphspec.reader.syntax_check import check_syntax

        e = check_syntax(text)
        if e:
            out.append(
                {
                    "trap": "outside the document profile",
                    "line": e.line,
                    "text": e.message[:80],
                    "fix": e.fix
                    + " — or mark the block '// graph: G · QUERY' if it asks a question",
                }
            )
    return sorted(out, key=lambda f: f["line"])


SILENT_TRAPS = {
    "zoned datetime",
    "aggregate mixed with a value",
    "pattern returns to a bound variable",
    "list literal with values that may be null",
}
