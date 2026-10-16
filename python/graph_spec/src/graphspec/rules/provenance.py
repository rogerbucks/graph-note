"""W3C PROV is normative for provenance (graph spec §11, §12, §24): a derivation links to its rule
with HAD_PLAN (req:11.had-plan), who proposed, decided or wrote a thing is WAS_ATTRIBUTED_TO an
agent (req:24.prov-attributed), and a revision is generated after what it supersedes
(req:12.prov-revision). Each rule is given only where the graph holds what it is about, so a graph
without provenance gains no check. The twin of provenance.js."""

from __future__ import annotations

import datetime as dt
from collections.abc import Collection
from typing import TYPE_CHECKING, Any

from graphspec.rules.judgements import resolve

if TYPE_CHECKING:
    from graphspec.rules.plain_graph import Graph, World

# the agent types: a Model counts as a SoftwareAgent wherever one is accepted (decided 16 Oct 2026)
AGENT_LABELS = frozenset({"Person", "Organization", "SoftwareAgent", "Model"})

HAD_PLAN_LABEL = (
    "§11 req:11.had-plan: every activity that derives an element by a rule links to that rule "
    "with HAD_PLAN"
)
ATTRIBUTED_LABEL = (
    "§24 req:24.prov-attributed: every WAS_ATTRIBUTED_TO link goes to a Person, Organization or "
    "SoftwareAgent (a Model counts as one)"
)
REVISION_LABEL = "§12 req:12.prov-revision: every successor was generated after what it supersedes"


def is_agent(labels: Collection[str]) -> bool:
    """Whether labels type an agent: a Person, an Organization, a SoftwareAgent, or a Model, which
    counts as one."""
    return bool(AGENT_LABELS & set(labels))


def had_plan(g: Graph, a: str) -> bool:
    """Whether an activity HAD_PLAN a rule: it carries out one, so what it generated is a cache
    (§24)."""
    return bool(g.out(a, "HAD_PLAN"))


def names_rule(g: Graph, thing: str, rule: str) -> bool:
    """Whether a thing is the rule named: its id is it, or it says so in its `rule`, or it is a Ref
    to it (a rule's id is often not a name a statement can write, as rule:total@1 is not)."""
    p = g.p(thing)
    return thing == rule or p.get("rule") == rule or (g.has(thing, "Ref") and p.get("ref") == rule)


def when(v: Any) -> dt.datetime | None:
    """The instant a value says: a date is its midnight; anything else says none."""
    if isinstance(v, dt.datetime):
        return v
    if isinstance(v, dt.date):
        return dt.datetime(v.year, v.month, v.day)
    return None


def prov_rules(w: World, name: str) -> list[tuple[str, bool, str]]:
    """The provenance rules that apply to graph `name` of world `w`, as [(label, ok, detail)]."""
    g = w[name]
    out = []
    derives = [
        a for a in g.labelled("Activity") if isinstance(g.p(a).get("rule"), str) and g.p(a)["rule"]
    ]
    if derives:
        bad = [
            a
            for a in derives
            if not any(names_rule(g, e[2], g.p(a)["rule"]) for e in g.out(a, "HAD_PLAN"))
        ]
        out.append(
            (HAD_PLAN_LABEL, not bad, f"{sorted(bad)} — link each to its rule with HAD_PLAN")
        )
    attributed = [e for e in g.edges if e[1] == "WAS_ATTRIBUTED_TO"]
    if attributed:
        bad = [
            (e[0], e[2])
            for e in attributed
            if not is_agent(resolve(w, g.p(e[2]))[1] if g.has(e[2], "Ref") else g.nodes[e[2]][0])
        ]
        out.append(
            (
                ATTRIBUTED_LABEL,
                not bad,
                f"{bad[:4]} — attribute to a Person, Organization or SoftwareAgent",
            )
        )
    pairs = [
        (e[0], e[2], when(g.p(e[0]).get("generated_at")), when(g.p(e[2]).get("generated_at")))
        for e in g.edges
        if e[1] == "SUPERSEDES"
    ]
    pairs = [x for x in pairs if x[2] is not None and x[3] is not None]
    if pairs:
        bad = [(s, p) for s, p, ts, tp in pairs if ts < tp]
        out.append(
            (
                REVISION_LABEL,
                not bad,
                f"{bad[:4]} — a successor is generated after what it supersedes",
            )
        )
    return out
