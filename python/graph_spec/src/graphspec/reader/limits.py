"""The limits every reader, check and join stops at, with a clear refusal (editor spec §51,
spec_read_limits). Size: the characters in one block, and the things and links in one graph.
Nesting: how deep paths open into paths (§22). Join size: the documents in one join, and the
things and links they hold in all. The JavaScript library states the same
(packages/graph-spec/src/reader/limits.js), and test/limit-cases.json holds both to them."""

from __future__ import annotations

from graphspec.reader.lexer import ProfileError

LIMITS = {
    "block_chars": 1000000,
    "items": 50000,
    "nesting": 64,
    "join_documents": 64,
    "join_items": 100000,
}


def within_size(block: str) -> None:
    """Refuses a block longer than the limit. It is measured, never read."""
    size, limit = len(block), LIMITS["block_chars"]
    if size > limit:
        raise ProfileError(
            1,
            f"the block is {size} characters long, over the limit of {limit}",
            "split it into smaller graphs, each in its own block",
            code="GN601",
        )


def within_items(graph: str, count: int) -> None:
    """Refuses a graph holding more things and links than the limit."""
    if count > LIMITS["items"]:
        raise ProfileError(
            1,
            f"graph {graph} holds more than {LIMITS['items']} things and links",
            "split it into smaller graphs that link to each other",
            code="GN602",
        )


def within_nesting(depth: int) -> None:
    """Refuses paths opened deeper than the limit, before the stack runs out."""
    if depth > LIMITS["nesting"]:
        raise ProfileError(
            1,
            f"paths open into paths more than {LIMITS['nesting']} deep",
            f"give the paths fewer levels, at most {LIMITS['nesting']}",
            code="GN603",
        )


def within_join_documents(count: int) -> None:
    """Refuses a join of more documents than the limit."""
    if count > LIMITS["join_documents"]:
        raise ProfileError(
            1,
            f"a join of {count} documents is over the limit of {LIMITS['join_documents']}",
            f"join at most {LIMITS['join_documents']} documents at a time, then join the results",
            code="GN604",
        )


def within_join_items(count: int) -> None:
    """Refuses a join whose documents hold more things and links in all than the limit."""
    if count > LIMITS["join_items"]:
        raise ProfileError(
            1,
            f"the documents joined hold more than {LIMITS['join_items']} things and links",
            "join fewer or smaller documents at a time",
            code="GN605",
        )
