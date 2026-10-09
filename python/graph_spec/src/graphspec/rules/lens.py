"""§15 lens rules of the simple shape every lens here uses, evaluated without an engine."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph


# ── §15 lens rules — the simple shape, evaluated without an engine ───────────────────────────────
LENS = re.compile(
    r"^\s*MATCH \((\w+):(\w+)\) RETURN \1\.id AS id, CASE (.*) ELSE '([^']*)' END AS grp\s*$", re.S
)


def lens_buckets(g: Graph, rule: str | None) -> dict[str, str] | None:
    """{id: bucket} for a lens rule of the shape every lens here uses; None if the rule needs an
    engine."""
    m = LENS.match(rule or "")
    if not m:
        return None
    var, label, whens, other = m.groups()
    arms = re.findall(r"WHEN (.*?) THEN '([^']*)'\s*", whens)
    if " ".join(f"WHEN {c} THEN '{b}'" for c, b in arms) != re.sub(r"\s+", " ", whens.strip()):
        return None

    def test(cond, p):
        for part in re.split(r"\s+AND\s+", cond):
            t = re.fullmatch(
                rf"{var}\.(\w+)\s*(<=|>=|<>|=|<|>)\s*('([^']*)'|-?\d+(?:\.\d+)?)", part.strip()
            )
            if not t:
                raise ValueError("needs an engine")
            k, op, raw, s = t.groups()
            a, b = p.get(k), (s if s is not None else float(raw) if "." in raw else int(raw))
            if (
                a is None
                or not {
                    "=": a == b,
                    "<>": a != b,
                    "<": a < b,
                    ">": a > b,
                    "<=": a <= b,
                    ">=": a >= b,
                }[op]
            ):
                return False
        return True

    try:
        return {i: next((b for c, b in arms if test(c, g.p(i))), other) for i in g.labelled(label)}
    except (ValueError, TypeError):
        return None
