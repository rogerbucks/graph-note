"""The centroids of a graph's clusters match the JavaScript library's on every shared case.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_centroids

The cases are packages/graph-spec/test/centroid-cases.json (wiki/Clusters-design.md, step 4).
Centroids nest, keep their ids after a rebuild, are worked out again only when their members
change, and are never returned as settled while they still move (editor spec §31).
"""

import json
import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.clusters.centroids import centroid_id, centroids_of  # noqa: E402
from graphspec.rules.plain_graph import Graph  # noqa: E402

CASES = os.path.join(ROOT, "packages", "graph-spec", "test", "centroid-cases.json")

with open(CASES, encoding="utf-8") as f:
    SHARED = json.load(f)["cases"]


def graph_of(step):
    """The plain graph of one step of a shared case."""
    nodes = {i: (frozenset(labels), {"id": i, **props}) for i, labels, props in step["nodes"]}
    return Graph(nodes, [(a, t, b, {}) for a, t, b in step["edges"]])


def run(case, **options):
    """The answer to each step of a shared case, each step given the answer before."""
    options = options or case.get("options", {})
    previous, out = None, []
    for step in case["steps"]:
        previous = centroids_of(graph_of(step), previous=previous, **options)
        out.append(previous)
    return out


def named(name):
    """The shared case with this name."""
    return next(c for c in SHARED if c["name"] == name)


def of(answer, cluster):
    """The centroid of this cluster in an answer."""
    return next(c for c in answer["centroids"] if c["cluster"] == cluster)


class SharedCases(unittest.TestCase):
    def test_every_case_gives_its_recorded_centroids(self):
        for case in SHARED:
            with self.subTest(case["name"]):
                self.assertEqual(json.loads(json.dumps(run(case))), case["expected"])


class Centroids(unittest.TestCase):
    def test_centroids_nest(self):
        (answer,) = run(named("atoms sum up into a molecule, and the molecule into a cell"))
        self.assertEqual([b[0] for b in of(answer, "molecule")["basis"]], ["atoms"])
        self.assertEqual(of(answer, "cell")["kinds"], {"Centroid": 1, "Part": 1})

    def test_ids_come_from_the_cluster(self):
        (answer,) = run(named("atoms sum up into a molecule, and the molecule into a cell"))
        self.assertEqual(of(answer, "atoms")["id"], centroid_id("atoms"))
        self.assertRegex(centroid_id("atoms"), r"^sha-256:[0-9a-f]{64}$")

    def test_only_what_changed_is_worked_out_again(self):
        unrelated = run(named("an unrelated edit works out no centroid again"))
        self.assertEqual(unrelated[-1]["recomputed"], [])
        leaving = run(named("a member leaving works out every cluster it was in again"))
        self.assertEqual(leaving[-1]["recomputed"], ["a", "b", "c"])

    def test_swapping_centroids_are_unsettled_at_the_most_passes(self):
        last = run(named("two centroids that swap stop at the most passes, unsettled"))[-1]
        self.assertEqual(last["passes"], 50)
        self.assertFalse(last["settled"])
        self.assertEqual([c["settled"] for c in last["centroids"]], [False, False])

    def test_running_out_of_time_is_never_settled(self):
        now = [0]

        def clock():
            now[0] += 10
            return now[0]

        case = named("a cycle of two clusters settles")
        (answer,) = run(case, budget=5, clock=clock)
        self.assertEqual(answer["passes"], 1)
        self.assertFalse(answer["settled"])
        self.assertTrue(all(not c["settled"] for c in answer["centroids"]))
        (full,) = run(case, budget=math.inf, clock=clock)
        self.assertTrue(full["settled"])


if __name__ == "__main__":
    unittest.main()
