"""The process core and its runs match the JavaScript library's on every shared case.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_process_core

The cases are packages/graph-spec/test/process-core-cases.json (editor spec §34): eight kinds,
transitions as links or things, guards as data, a run's log as the truth, nested machines and a
running rule overridden on the run alone.
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.process import core, runs  # noqa: E402
from graphspec.rules.plain_graph import Graph  # noqa: E402

CASES = os.path.join(ROOT, "packages", "graph-spec", "test", "process-core-cases.json")

with open(CASES, encoding="utf-8") as f:
    SHARED = json.load(f)["cases"]

# Each JavaScript name a case calls, and its Python twin.
CALLS = {
    "coreOfEight": core.core_of_eight,
    "transitionsOf": core.transitions_of,
    "promoteTransition": core.promote_transition,
    "processPath": core.process_path,
    "guardOf": core.guard_of,
    "runningRuleOf": core.running_rule_of,
    "overrideRunningRule": core.override_running_rule,
    "currentOf": runs.current_of,
    "refreshCurrent": runs.refresh_current,
    "enterState": runs.enter_state,
    "leaveState": runs.leave_state,
    "moveRun": runs.move_run,
}


def graph_of(s):
    """The plain graph of a shared case."""
    nodes = {i: (frozenset(labels), {"id": i, **props}) for i, labels, props in s["nodes"]}
    return Graph(nodes, [(e[0], e[1], e[2], e[3] if len(e) > 3 else {}) for e in s["edges"]])


def plain(v):
    """An answer as the cases write it: a graph as its nodes and edges."""
    if isinstance(v, Graph):
        return {
            "nodes": [[i, sorted(labels), p] for i, (labels, p) in v.nodes.items()],
            "edges": [list(e) for e in v.edges],
        }
    return v


def named(name):
    """The shared case with this name."""
    return next(c for c in SHARED if c["name"] == name)


class SharedCases(unittest.TestCase):
    def test_every_case_gives_its_recorded_answer(self):
        for case in SHARED:
            with self.subTest(case["name"]):
                out = CALLS[case["call"]](graph_of(case["graph"]), *case["args"])
                self.assertEqual(json.loads(json.dumps(plain(out))), case["expected"])


class ProcessCore(unittest.TestCase):
    def test_a_guard_runs_the_version_it_names(self):
        g = graph_of(named("a guard naming a function shows its name and version")["graph"])
        guard = core.guard_of(g, "t3")
        functions = {"credit_check": {"1": lambda ctx: False, "2": lambda ctx: ctx["score"] > 600}}
        self.assertTrue(core.guard_allows(guard, {"score": 700}, functions))
        self.assertEqual(guard["shown"], "credit_check v2")
        with self.assertRaises(ValueError):
            core.guard_allows(guard, {}, {"credit_check": {"1": lambda ctx: True}})

    def test_a_lost_current_link_comes_back_the_same(self):
        whole = graph_of(named("the current states come from the log")["graph"])
        lost = graph_of(named("a lost current link is made again from the log")["graph"])
        again = runs.refresh_current(lost, "r")
        self.assertEqual(
            [e[2] for e in again.out("r", "CURRENT")], [e[2] for e in whole.out("r", "CURRENT")]
        )

    def test_a_loop_of_states_is_refused(self):
        g = graph_of(
            {
                "nodes": [
                    ["a", ["State"], {"initial": True}],
                    ["b", ["State"], {"initial": True}],
                ],
                "edges": [["a", "CONTAINS", "b"], ["b", "CONTAINS", "a"]],
            }
        )
        with self.assertRaises(ValueError):
            runs.enter_state(g, "r", "a")

    def test_an_override_leaves_the_process_default(self):
        g = graph_of(named("a run with no override follows its process default")["graph"])
        after = core.override_running_rule(g, "r", "all-enabled")
        self.assertEqual(core.running_rule_of(after, "r")["from"], "run")
        self.assertEqual(after.p("p")["running_rule"], "first-match")


if __name__ == "__main__":
    unittest.main()
