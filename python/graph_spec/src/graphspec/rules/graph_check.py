"""Every rule that applies to one graph, run together — the portable equivalent of the
suite's per-graph checks."""

from __future__ import annotations

from collections.abc import Collection
from typing import TYPE_CHECKING

from graphspec.rules.certainty_checks import section20
from graphspec.rules.judgement_checks import is_judgement_graph, judgements_rules
from graphspec.rules.paths import paths_rules
from graphspec.rules.projection import projects_back
from graphspec.rules.schema_types import drafted, is_draft, near_duplicates, typed
from graphspec.rules.servings import served_rules

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import World


def check(
    w: World,
    name: str,
    matrix: dict[str, dict[str, str]] | None = None,
    switches: Collection[str] = frozenset(),
) -> list[tuple[str, bool, str]]:
    """Every rule that applies to graph `name`, as [(label, ok, detail)] — the portable equivalent
    of the suite's per-graph checks."""
    g = w[name]
    sname, shared = w.schema_for(name) if not g.labelled("ElementType") else (None, None)
    if is_draft(w, name):
        kinds, type_names = drafted(g)
        near = near_duplicates(kinds) + near_duplicates(type_names)
        t5 = (
            "§5: a draft's kinds and relationship types hold no near-duplicates",
            not near,
            "; ".join(
                f"{a} and {b} look like one name misspelt — "
                "correct one, or lock the graph to declare both"
                for a, b in near
            )
            or f"a draft: {len(kinds)} kinds, {len(type_names)} relationship types, "
            "worked out from the data — lock it to declare them",
        )
    else:
        t5 = (
            "§5: every element has a declared type",
            typed(g, shared),
            ""
            if shared is not None or not sname
            else f"its header names schema {sname}, and no schema document for it was given — "
            "supply it with the graph",
        )
    try:
        back, why18 = projects_back(g, name), ""
    except ValueError as e:
        back, why18 = False, str(e)
    out = [t5, ("§18: the flat projection rebuilds the graph", back, why18)]
    out += section20(g, switches) + paths_rules(g)
    if is_judgement_graph(g):
        out += judgements_rules(w, name) + (
            served_rules(w, name, matrix) if matrix is not None else []
        )
    return out
