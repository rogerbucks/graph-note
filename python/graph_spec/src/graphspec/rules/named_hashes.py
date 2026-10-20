"""Named hashes (editor spec §51, spec_hashes_named; requirements/hashes.md).

A hash is written with the name of its algorithm, from the IANA registry RFC 6920 uses:
`sha-256-64:` then 16 hex digits, or `sha-256:` then 64. An `ni:` id names its algorithm already.
A bare string of digits does not say how it was made, so it is refused. The JavaScript twin is
packages/graph-spec/src/hashing/named.js.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph

# each name the check knows, and how many hex digits it has
ALGORITHMS = {"sha-256-64": 16, "sha-256": 64}
NI = re.compile(r"ni:///sha-256;[A-Za-z0-9_-]{43}", re.A)
NAMED_RULE = (
    "every hash names its algorithm: sha-256-64: or sha-256: before its digits (editor spec §51)"
)
NAMED_FIX = "write each hash with its algorithm's name, such as 'sha-256-64:' then its 16 digits"
NAMED_STATE = (
    "the state it was made against names its algorithm: against sha-256-64:<digits> "
    "(editor spec §51)"
)


def named(digits: str) -> str:
    """A hash written with its algorithm's name: sha-256-64 for 16 digits, sha-256 for 64."""
    return ("sha-256:" if len(digits) == 64 else "sha-256-64:") + digits


def is_named(v: Any) -> bool:
    """Whether v is a hash that names an algorithm the check knows, with the right number of
    digits for it."""
    if not isinstance(v, str):
        return False
    if NI.fullmatch(v):
        return True
    name, colon, digits = v.partition(":")
    want = ALGORITHMS.get(name)
    return (
        bool(colon)
        and want is not None
        and re.fullmatch(f"[0-9a-f]{{{want}}}", digits) is not None
    )


def digits_of(v: Any) -> Any:
    """The digits of a hash, its algorithm's name taken off; a bare hash is its own digits, so it
    still compares."""
    return v.partition(":")[2] if isinstance(v, str) and re.match(r"sha-256(-64)?:", v) else v


def unnamed_hashes(rows: list[tuple[str, Any]]) -> list[tuple[str, Any]]:
    """Of (where, value) pairs, the ones whose value names no algorithm."""
    return [(where, v) for where, v in rows if not is_named(v)]


def hashes_of(g: Graph) -> list[tuple[str, Any]]:
    """The hashes graph g holds that the graph spec writes — content_hash on a node, hash on a
    link — as (where, value) pairs."""
    rows = [(i, p["content_hash"]) for i, (_, p) in g.nodes.items() if "content_hash" in p]
    rows += [(f"{s} {t} {d}", p["hash"]) for s, t, d, p in g.edges if "hash" in p]
    return rows


def state_named(block: str) -> bool:
    """Whether a change set's header names the algorithm of the state it was made against."""
    first = next((line for line in block.split("\n") if line.strip()), "")
    return re.search(r"·\s*against\s+sha-256-64:", first) is not None
