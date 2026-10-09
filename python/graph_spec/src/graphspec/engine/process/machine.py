"""§7 and §16: the generic process engine, read from a process graph — flat or with
sub-flows."""

from __future__ import annotations

from graphspec.engine.joining.named_rules import nesting_loop
from graphspec.engine.queries import Q_


class Machine:
    """The generic engine of §14, read from a process graph — flat or with sub-flows."""

    def __init__(self, db, restart_on_self=False, flow=None):
        self.S = {
            r["id"]: r
            for r in Q_(
                db,
                "MATCH (s:State) RETURN s.id AS id, s.flow AS flow, s.initial AS i, s.final AS f",
            )
        }
        self.T = {}
        for r in Q_(
            db,
            "MATCH (a:State)-[t:TRANSITION]->(b:State) RETURN a.id AS a, b.id AS b, t.event AS e, t.guard AS g, t.do AS d",  # noqa: E501  # one literal: embedded_queries reads it whole
        ):
            self.T.setdefault((r["a"], r["e"]), []).append(r)
        self.D = {
            r["p"]: r["c"]
            for r in Q_(
                db, "MATCH (p:State)-[:DETAILED_IN]->(c:State) RETURN p.id AS p, c.id AS c"
            )
        }
        self.restart = restart_on_self
        loop = nesting_loop(
            {s: {"props": {"flow": r["flow"]}} for s, r in self.S.items()},
            {(p, "DETAILED_IN", c, ()): {} for p, c in self.D.items()},
        )
        if loop:
            raise ValueError(f"refused: sub-flows nest in a loop — {' → '.join(loop)} (§16)")
        subflows = {self.S[c]["flow"] for c in self.D.values()}
        tops = sorted(
            s
            for s, r in self.S.items()
            if r["i"] and r["flow"] not in subflows and (flow is None or r["flow"] == flow)
        )
        if not tops:
            raise ValueError(
                "refused: no flow starts outside a sub-flow"
                + (f" named {flow}" if flow else "")
                + " (§7, §16)"
            )
        if len(tops) > 1:
            raise ValueError(
                f"refused: {len(tops)} flows start outside a sub-flow — {', '.join(tops)}; "
                "name the one to run (§7)"
            )
        self.root = tops[0]  # the start of the one flow that is nobody's sub-flow

    def expand(self, s):
        return (s,) + (self.expand(self.D[s]) if s in self.D else ())

    def start(self):
        return self.expand(self.root)

    @staticmethod
    def holds(g, ctx):
        return eval(g.replace(" = ", " == "), {}, dict(ctx))

    def enabled(self, s, e, ctx):
        ts = self.T.get((s, e), [])
        plain = [t for t in ts if t["g"] and t["g"] != "else" and self.holds(t["g"], ctx)] + [
            t for t in ts if not t["g"]
        ]
        if plain:
            return plain
        return [t for t in ts if t["g"] == "else"]

    def step(self, conf, e, ctx):
        """Innermost flow first; a parent handles an event only if its sub-flow does not (as
        SCXML)."""
        for lvl in range(len(conf) - 1, -1, -1):
            en = self.enabled(conf[lvl], e, ctx)
            if not en:
                continue
            assert len(en) == 1, f"not deterministic: {conf[lvl]} on {e} {ctx}"
            t = en[0]
            acts = [t["d"]] if t["d"] else []
            if t["b"] == t["a"] and not self.restart:
                return conf, acts  # a self-transition never restarts a sub-flow
            new = conf[:lvl] + self.expand(t["b"])
            if (
                lvl > 0 and self.S[t["b"]]["f"]
            ):  # a sub-flow reached its end: its parent hears 'done'
                new2, a2 = self.step(new[:lvl], "done", {})
                return new2, acts + a2
            return new, acts
        return conf, []
