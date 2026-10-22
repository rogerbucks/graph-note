"""§21 a join's configuration: its defaults, and how it is built from the declared data in
the suite."""

from __future__ import annotations

from typing import Any

from graphspec.engine.joining.gql_rules import gql_rule
from graphspec.engine.joining.named_rules import RULES


# ── §21: joining documents' graphs ──
ABSENT = ("<absent>",)
META = {
    "id",
    "claimed_property",
    "claimed_value",
    "claimed_label",
    "claimed_relationship",
    "claimed_absent",
    "claimed_node",
    "claimed_exists",
    "about_removed",
    "edge_ident",
    "likelihood",
    "confidence",
    "status",
    "rule",
    "stated_in",
}


def config(**k: Any) -> dict[str, Any]:
    """A join configuration: every part empty, then the parts given."""
    c = dict(
        maps={},
        time={},
        id_map={},
        value_maps={},
        acyclic=set(),
        at_most_one={},
        constraints={},
        vocab={},
        edge_keys={},
        contexts={},
        types=[],
        trust={},
        owners={},
    )
    c.update(k)
    return c


def config_from(data: dict[str, Any] | None) -> dict[str, Any]:
    """Build a join configuration from the declared data in the suite (spec §17)."""
    d = data or {}
    _c = config(
        maps={
            sch: {k: tuple(v) for k, v in m.items()}
            for sch, m in (d.get("unit_maps") or {}).items()
        },
        time=d.get("time_restatements") or {},
        id_map=d.get("id_map") or {},
        value_maps={(m["type"], m["attribute"]): m["map"] for m in d.get("vocabulary_maps") or []},
        acyclic=set(d.get("acyclic") or []),
        at_most_one={(m["type"], m["side"]): m["rule"] for m in d.get("at_most_one") or []},
        constraints={},
        vocab={k: set(v) for k, v in (d.get("vocabulary") or {}).items()},
        edge_keys={k: tuple(v) for k, v in (d.get("identified_by") or {}).items()},
        contexts=d.get("guard_cases") or {},
        trust=d.get("trust") or {},
        owners=d.get("prefix_owners") or {},
        types=[("node", n, None) for n in (d.get("types") or {}).get("nodes", [])]
        + [("edge", e, r) for e, r in ((d.get("types") or {}).get("edges") or {}).items()],
    )
    cfg = _c
    # a constraint written in GQL with a named twin runs as that twin, whatever the parser
    # (req:3.reader-default). tests/test_reader_agrees_with_grafeo.py proves the two agree. One
    # with no twin is database work, run by the engine
    cfg["constraints"] = {
        c["why"]: (
            RULES[c["reference"]]
            if "gql" in c and "reference" in c
            else gql_rule(c["gql"], cfg)
            if "gql" in c
            else RULES[c["rule"]]
        )
        for c in d.get("constraints") or []
    }
    cfg["references"] = {
        c["why"]: RULES[c["reference"]]
        for c in d.get("constraints") or []
        if "gql" in c and "reference" in c
    }
    cfg["readings"] = dict(
        d.get("readings") or {}
    )  # §5: each edge type's forward reading, beside its reverse reading in `types`
    return cfg
