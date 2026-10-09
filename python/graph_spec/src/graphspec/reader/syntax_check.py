"""Checks a data block's shape against the document profile without applying it."""

from __future__ import annotations

from typing import Any

from graphspec.reader.grammar import Parser
from graphspec.reader.lexer import ProfileError, header, tokens


def check_syntax(block: str) -> ProfileError | None:
    """A data block's shape against the profile, without applying it — None, or the ProfileError.
    Query blocks are not data and pass."""
    try:
        g, kind = header(block)
        if kind in ("query", "excerpt"):
            return None
        toks = tokens(block)
        if toks:
            bind_order(*Parser(toks).statement()[:2])
    except ProfileError as e:
        return e
    return None


def bind_order(
    matches: list[dict[str, Any]], paths: list[tuple[list[dict[str, Any]], list[dict[str, Any]]]]
) -> None:
    """§3: a name is reused only once its node is written — by MATCH, earlier in the block, or
    earlier in its path. Grafeo refuses anything else."""
    bound = {m["var"] for m in matches}
    written = {n["var"] for ns, _ in paths for n in ns if n["labels"] or n["props"]}
    for nodes, _ in paths:
        for n in nodes:
            if n["labels"] or n["props"]:
                bound.add(n["var"])
            elif n["var"] not in bound and n["var"] in written:
                raise ProfileError(
                    n["line"],
                    f"{n['var']} is used before it is written",
                    "write the node before any relationship that uses it — "
                    "GQL binds a name only once its node is written (§3)",
                )
