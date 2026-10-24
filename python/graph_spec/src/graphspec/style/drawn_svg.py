"""The SVG Graphviz draws from a layout source, as the core's render.ts svgOf draws it (editor
spec §25, untangle_direct). Direct links are the default: the drawing is read from Graphviz's
layout as marks (marks.py), its links drawn direct and its boxes moved aside (direct_links.py),
and written as Graphviz writes it (marks_svg.py). Any other routing is Graphviz's own, and so is a
layout the marks cannot give back exactly."""

from __future__ import annotations

import json
import subprocess

from graphspec.style.direct_links import direct_links
from graphspec.style.marks import layout_marks
from graphspec.style.marks_svg import layout_svg


def run_dot(dot: str, src: str, form: str) -> str:
    """What Graphviz (the `dot` program) writes for `src` in `form`, such as svg or json. Raises
    RuntimeError if it fails."""
    r = subprocess.run([dot, f"-T{form}"], input=src, capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError(f"Graphviz failed: {r.stderr.strip()[:300]}")
    return r.stdout


def drawn_svg(dot: str, src: str, routing: str | None = None) -> str:
    """The SVG of `src`, drawn by the `dot` program: with direct links unless `routing` chooses
    another way (None is the default, direct)."""
    if routing not in (None, "direct"):
        return run_dot(dot, src, "svg")
    laid = layout_marks(json.loads(run_dot(dot, src, "json")))
    return (
        run_dot(dot, src, "svg") if laid["layout"].get("lost") else layout_svg(direct_links(laid))
    )
