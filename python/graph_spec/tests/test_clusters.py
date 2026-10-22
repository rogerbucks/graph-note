"""The clusters of a graph match the JavaScript library's on every shared case.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_clusters

The cases are packages/graph-spec/test/cluster-cases.json (wiki/Clusters-design.md, step 3).
Each membership says whether a person wrote it or Louvain found it (editor spec §31), and a
thing in N clusters counts 1/N in each.
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.clusters.clusters import clusters_of  # noqa: E402
from graphspec.rules.plain_graph import Graph  # noqa: E402

CASES = os.path.join(ROOT, "packages", "graph-spec", "test", "cluster-cases.json")

with open(CASES, encoding="utf-8") as f:
    SHARED = json.load(f)["cases"]


def graph_of(case):
    """The plain graph of a shared case."""
    nodes = {i: (frozenset(labels), {"id": i}) for i, labels in case["nodes"]}
    return Graph(nodes, [(s, t, d, {}) for s, t, d in case["edges"]])


def by_name(name):
    """The plain graph of the shared case with this name."""
    return graph_of(next(c for c in SHARED if c["name"] == name))


class SharedCases(unittest.TestCase):
    def test_every_case_gives_its_recorded_clusters(self):
        for case in SHARED:
            with self.subTest(case["name"]):
                g = graph_of(case)
                self.assertEqual(clusters_of(g), case["expected"]["all"])
                self.assertEqual(clusters_of(g, "asserted"), case["expected"]["asserted"])
                self.assertEqual(clusters_of(g, "found"), case["expected"]["found"])


class Kinds(unittest.TestCase):
    def test_a_filter_by_kind_shows_only_that_kind(self):
        g = by_name("written and found together")
        kinds = {m["kind"] for m in clusters_of(g)["memberships"]}
        self.assertEqual(kinds, {"asserted", "found"})
        for kind in ("asserted", "found"):
            shown = clusters_of(g, kind)
            self.assertTrue(shown["clusters"])
            self.assertTrue(all(c["kind"] == kind for c in shown["clusters"]))
            self.assertTrue(all(m["kind"] == kind for m in shown["memberships"]))
        with self.assertRaisesRegex(ValueError, "one of asserted, found"):
            clusters_of(g, "guessed")


class Weights(unittest.TestCase):
    def test_a_thing_in_four_clusters_counts_a_quarter_in_each(self):
        memberships = clusters_of(by_name("a thing in four clusters"))["memberships"]
        x = [(m["cluster"], m["weight"]) for m in memberships if m["thing"] == "x"]
        self.assertEqual(x, [("a", 0.25), ("b", 0.25), ("c", 0.25), ("d", 0.25)])


if __name__ == "__main__":
    unittest.main()
