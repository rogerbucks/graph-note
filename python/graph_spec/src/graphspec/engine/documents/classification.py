"""The destination matrix and ranked classes, read from the classification note a host
names, and a document's own class."""

from __future__ import annotations

import re

from graphspec.engine import settings


def _classification_note(path):
    path = path or settings.CLASSIFICATION_NOTE
    if not path:
        raise ValueError(
            "refused: no classification note — set graph_spec.CLASSIFICATION_NOTE to the note "
            "that holds the destination matrix"
        )
    return path


def destination_matrix(path: str | None = None) -> dict[str, dict[str, str]]:
    """The destination matrix read from the classification note itself —
    {consumer kind: {class: 'yes' | 'conditional' | 'no'}}. Never a copy."""
    text = open(_classification_note(path), encoding="utf-8").read()
    head = next(
        text_line
        for text_line in text.splitlines()
        if re.match(r"\|\s*\|\s*Unmoderated", text_line)
    )
    classes = [c.strip() for c in head.strip("|").split("|")[1:]]
    out = {}
    for kind, row in settings.MATRIX_ROWS.items():
        line = next(
            text_line for text_line in text.splitlines() if text_line.startswith(f"| **{row}")
        )
        marks = [c.strip() for c in line.strip("|").split("|")[1:]]
        out[kind] = {
            c: {"✅": "yes", "⚠️": "conditional", "❌": "no"}.get(m, "no")
            for c, m in zip(classes, marks)
        }
    return out


def class_order(path: str | None = None) -> list[str]:
    """Classes highest risk first, from the classification note's ranked table."""
    return [
        m.group(1)
        for m in re.finditer(
            r"^\| \d+ \| \*\*([^*]+)\*\*",
            open(_classification_note(path), encoding="utf-8").read(),
            re.M,
        )
    ]


def may_serve(
    kind: str | None,
    cls: str | None,
    conditions_met: bool | None = False,
    matrix: dict[str, dict[str, str]] | None = None,
) -> bool:
    """Whether the destination matrix — the classification note's, unless one is given — lets a
    consumer of this kind be served an item of this class; an unknown consumer or class is
    refused, and a conditional one needs its conditions met."""
    v = (
        (matrix or destination_matrix()).get(kind, {}).get(cls)
    )  # an unknown consumer or class is refused
    return v == "yes" or (v == "conditional" and bool(conditions_met))


def document_class(path: str) -> str:
    """A document's classification, from its frontmatter; Unmoderated when it has none."""
    m = re.search(
        r"^classification:\s*\"?([^\"\n]+)\"?\s*$", open(path, encoding="utf-8").read(), re.M
    )
    return m.group(1).strip() if m else "Unmoderated"  # unassessed is Unmoderated
