"""Named rules and figures — what a configuration in the suite refers to by name."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from graphspec.engine.queries import Q
from graphspec.rules.plain_graph import Graph

if TYPE_CHECKING:
    from grafeo import GrafeoDB


# ── named rules and figures — what a configuration in the suite refers to by name ─────────────
def rule_repaid_after_drawn(
    nodes: dict[str, dict[str, Any]], edges: dict[tuple[Any, ...], dict[str, Any]]
) -> list[dict[str, Any]]:
    """A repayment is never dated before its loan was drawn down."""
    return [
        {"slots": [(k[0], "at"), (k[2], "drawn_at")]}
        for k in edges
        if k[1] == "REPAYS"
        and "at" in nodes[k[0]]["props"]
        and "drawn_at" in nodes[k[2]]["props"]
        and nodes[k[0]]["props"]["at"] < nodes[k[2]]["props"]["drawn_at"]
    ]


def rule_one_start(
    nodes: dict[str, dict[str, Any]], edges: dict[tuple[Any, ...], dict[str, Any]]
) -> list[dict[str, Any]]:
    """§7: a flow has one start state."""
    by = {}
    for nid, n in nodes.items():
        if n["props"].get("initial"):
            by.setdefault(n["props"].get("flow"), []).append(nid)
    return [{"slots": [(x, "initial") for x in sorted(xs)]} for f, xs in by.items() if len(xs) > 1]


def rule_final_is_final(
    nodes: dict[str, dict[str, Any]], edges: dict[tuple[Any, ...], dict[str, Any]]
) -> list[dict[str, Any]]:
    """§7: a final state has no way out."""
    return [
        {"slots": [(k[0], "final")], "edges": [k]}
        for k in edges
        if k[1] == "TRANSITION" and nodes[k[0]]["props"].get("final")
    ]


def flow_parents(
    nodes: dict[str, dict[str, Any]], edges: dict[tuple[Any, ...], dict[str, Any]]
) -> dict[Any, Any]:
    """Each sub-flow's parent state: {flow name: the state DETAILED_IN it}."""
    return {
        nodes[k[2]]["props"].get("flow"): k[0]
        for k in edges
        if k[1] == "DETAILED_IN" and k[2] in nodes
    }


def ancestors(
    state: str, nodes: dict[str, dict[str, Any]], edges: dict[tuple[Any, ...], dict[str, Any]]
) -> list[Any]:
    """The parent states above a state's flow, nearest first — stopping before a nesting loop comes
    back round."""
    par, out, f = flow_parents(nodes, edges), [], nodes[state]["props"].get("flow")
    while (
        f in par and par[f] not in out and par[f] != state
    ):  # in a nesting loop the walk would come back round — stop before itself
        out.append(par[f])
        f = nodes[par[f]]["props"].get("flow")
    return out


def _else_over(nodes, edges, above):
    out = []
    for k, p in edges.items():
        if k[1] == "TRANSITION" and p.get("guard") == "else":
            pe = [
                e
                for e, q in edges.items()
                if e[0] in above(k[0])
                and e[1] == "TRANSITION"
                and q.get("event") == p.get("event")
            ]
            if pe:
                out.append({"edges": [k] + sorted(pe, key=str)})
    return out


def rule_else_over_ancestor(
    nodes: dict[str, dict[str, Any]], edges: dict[tuple[Any, ...], dict[str, Any]]
) -> list[dict[str, Any]]:
    """§16 rule 3, every level: no else in a sub-flow for an event handled by any state above
    it."""
    return _else_over(nodes, edges, lambda s: ancestors(s, nodes, edges))


def rule_else_over_parent(
    nodes: dict[str, dict[str, Any]], edges: dict[tuple[Any, ...], dict[str, Any]]
) -> list[dict[str, Any]]:
    """§16 rule 3 as first written — the parent only. Kept to show why every level is needed."""
    par = flow_parents(nodes, edges)
    return _else_over(
        nodes,
        edges,
        lambda s: (
            [par[nodes[s]["props"].get("flow")]] if nodes[s]["props"].get("flow") in par else []
        ),
    )


def rule_subflow_needs_done(
    nodes: dict[str, dict[str, Any]], edges: dict[tuple[Any, ...], dict[str, Any]]
) -> list[dict[str, Any]]:
    """§16 rule 4: a sub-flow that can end has done on its parent."""
    out = []
    for fl, p in flow_parents(nodes, edges).items():
        ends = [
            k
            for k in edges
            if k[1] == "TRANSITION"
            and nodes[k[2]]["props"].get("flow") == fl
            and nodes[k[2]]["props"].get("final")
        ]
        if ends and not any(k[0] == p and edges[k].get("event") == "done" for k in edges):
            out.append({"edges": ends})
    return out


def nesting_loop(
    nodes: dict[str, dict[str, Any]], edges: dict[tuple[Any, ...], dict[str, Any]]
) -> list[Any] | None:
    """The flows of a loop in sub-flow nesting, if there is one: flow A opens into B, B into …
    A."""
    into = {}
    for k in edges:
        if k[1] == "DETAILED_IN" and k[0] in nodes and k[2] in nodes:
            into.setdefault(nodes[k[0]]["props"].get("flow"), set()).add(
                nodes[k[2]]["props"].get("flow")
            )
    for start in sorted(into, key=str):
        stack = [(start, [start])]
        while stack:
            f, path = stack.pop()
            for g in sorted(into.get(f, ()), key=str):
                if g == start:
                    return path + [g]
                if g not in path:
                    stack.append((g, path + [g]))
    return None


def rule_subflow_nesting_acyclic(
    nodes: dict[str, dict[str, Any]], edges: dict[tuple[Any, ...], dict[str, Any]]
) -> list[dict[str, Any]]:
    """§16: sub-flows never nest in a loop — no flow opens, at any depth, into itself or a flow
    above it."""
    loop = nesting_loop(nodes, edges)
    if not loop:
        return []
    pairs = set(zip(loop, loop[1:]))
    return [
        {
            "edges": sorted(
                (
                    k
                    for k in edges
                    if k[1] == "DETAILED_IN"
                    and k[0] in nodes
                    and k[2] in nodes
                    and (nodes[k[0]]["props"].get("flow"), nodes[k[2]]["props"].get("flow"))
                    in pairs
                ),
                key=str,
            )
        }
    ]


RULES = {
    "subflow-nesting-acyclic": rule_subflow_nesting_acyclic,
    "repaid-after-drawn": rule_repaid_after_drawn,
    "one-start": rule_one_start,
    "final-is-final": rule_final_is_final,
    "else-over-ancestor": rule_else_over_ancestor,
    "else-over-parent": rule_else_over_parent,
    "subflow-needs-done": rule_subflow_needs_done,
}


def _missing(thing: str, *facts: Any) -> set[str]:
    """The thing, when a fact the figure reads of it is not there (req:21.incomplete-missing)."""
    return {thing} if any(f is None for f in facts) else set()


def _plain_loan_balance(g: Graph, loan: str) -> dict[str, Any]:
    """fig_loan_balance on the reader's plain graph (req:21.loan-balance-reads-plain)."""
    repayments = [s for s, _, _, _ in g.inc(loan, "REPAYS") if g.has(s, "Repayment")]

    def contested(about, props):
        return {
            c
            for c, _, _, _ in g.inc(about, "ABOUT")
            if g.has(c, "Claim")
            and g.p(c).get("status") == "contested"
            and g.p(c).get("claimed_property") in props
        }

    p = g.p(loan)
    blocked = sorted(
        contested(loan, ("currency", "principal_cents"))
        | {c for r in repayments for c in contested(r, ("amount_cents",))}
        | _missing(loan, p.get("principal_cents"), p.get("currency"))
        | {r for r in repayments if g.p(r).get("amount_cents") is None}
    )
    if blocked:
        return {"result": "incomplete", "depends_on": blocked}
    return {
        "result": "ok",
        "value": p.get("principal_cents") - sum(g.p(r).get("amount_cents") for r in repayments),
        "currency": p.get("currency"),
    }


def fig_loan_balance(db: Graph | GrafeoDB, loan: str) -> dict[str, Any]:
    """Principal less repayments — or 'incomplete', naming the contested claims it would depend on
    (§21) and each thing lacking a fact it reads (req:21.incomplete-missing) — from the reader's
    plain graph, or from a Grafeo database a host asks for."""
    if isinstance(db, Graph):
        return _plain_loan_balance(db, loan)
    loan_row = Q(
        db, f"MATCH (l:Loan {{id: '{loan}'}}) RETURN l.principal_cents AS p, l.currency AS c"
    )[0]
    paid = Q(
        db,
        f"MATCH (r:Repayment)-[:REPAYS]->(:Loan {{id: '{loan}'}}) RETURN r.id AS r, r.amount_cents AS a",  # noqa: E501  # one literal: embedded_queries reads it whole
    )
    blocked = sorted(
        _missing(loan, loan_row["p"], loan_row["c"])
        | {r["r"] for r in paid if r["a"] is None}
        | {
            r["c"]
            for r in Q(
                db,
                f"MATCH (c:Claim {{status: 'contested'}})-[:ABOUT]->(:Loan {{id: '{loan}'}}) RETURN c.id AS c, c.claimed_property AS p",  # noqa: E501  # one literal: embedded_queries reads it whole
            )
            if r["p"] in ("currency", "principal_cents")
        }
        | {
            r["c"]
            for r in Q(
                db,
                f"MATCH (c:Claim {{status: 'contested'}})-[:ABOUT]->(:Repayment)-[:REPAYS]->(:Loan {{id: '{loan}'}}) RETURN c.id AS c, c.claimed_property AS p",  # noqa: E501  # one literal: embedded_queries reads it whole
            )
            if r["p"] == "amount_cents"
        }
    )
    if blocked:
        return {"result": "incomplete", "depends_on": blocked}
    return {
        "result": "ok",
        "value": loan_row["p"] - sum(r["a"] for r in paid),
        "currency": loan_row["c"],
    }


FIGURES = {"loan-balance": fig_loan_balance}
