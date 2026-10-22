"""Clusters inside each other in a cycle match the JavaScript library's on every shared case.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_cycles

The cases are packages/graph-spec/test/cycle-cases.json (wiki/Clusters-design.md, step 5). A
cycle is written with no refusal, at any depth. It is flagged, and a view hides or highlights it
(editor spec §31).
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import graph_rules as gr  # noqa: E402
from graphspec.engine.clusters.cycles import cluster_cycles, cycle_view  # noqa: E402
from graphspec.reader.store import Store  # noqa: E402
from graphspec.rules.plain_graph import Graph  # noqa: E402

CASES = os.path.join(ROOT, "packages", "graph-spec", "test", "cycle-cases.json")

with open(CASES, encoding="utf-8") as f:
    SHARED = json.load(f)["cases"]


def graph_of(case):
    """The plain graph of a shared case."""
    nodes = {i: (frozenset(labels), {"id": i}) for i, labels in case["nodes"]}
    return Graph(nodes, [(a, t, b, {}) for a, t, b in case["edges"]])


class SharedCases(unittest.TestCase):
    def test_every_case_gives_its_recorded_cycles(self):
        for case in SHARED:
            with self.subTest(case["name"]):
                g = graph_of(case)
                self.assertEqual(cluster_cycles(g), case["expected"]["cycles"])
                self.assertEqual(cycle_view(g, "hide"), case["expected"]["hide"])
                self.assertEqual(cycle_view(g, "highlight"), case["expected"]["highlight"])


class Written(unittest.TestCase):
    def test_a_block_that_writes_a_cycle_is_read_and_flagged(self):
        block = "\n".join(
            [
                "// graph: g",
                "(a:Cluster {name: 'A'}),",
                "(b:Cluster {name: 'B'}),",
                "(x:Thing {name: 'X'}),",
                "(a)-[:MEMBER_OF]->(b),",
                "(b)-[:MEMBER_OF]->(a),",
                "(x)-[:MEMBER_OF]->(a)",
            ]
        )
        store = Store()
        store.apply(block)
        g = gr.World.from_store(store)["g"]
        self.assertEqual(cluster_cycles(g), [["a", "b"]])
        self.assertEqual(cycle_view(g, "hide")["shown"], ["x"])
        self.assertEqual(cycle_view(g, "highlight")["highlighted"], ["a", "b"])

    def test_a_view_shows_cycles_only_by_hiding_or_highlighting(self):
        with self.assertRaisesRegex(ValueError, "hide, highlight"):
            cycle_view(graph_of(SHARED[0]), "refuse")


if __name__ == "__main__":
    unittest.main()
