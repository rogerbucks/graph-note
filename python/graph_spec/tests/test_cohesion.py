"""Each cluster's cohesion and stated certainty match the JavaScript library's on every case.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_cohesion

The cases are packages/graph-spec/test/cohesion-cases.json (editor spec §31). A loose, disputed
cluster states less than a tight, well-supported one (centroid_cohesion). A cluster that opts in
to a floor is never more certain than its least certain member (parent_floor_optional).
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.clusters.cohesion import cluster_certainty  # noqa: E402
from graphspec.rules.plain_graph import Graph  # noqa: E402

CASES = os.path.join(ROOT, "packages", "graph-spec", "test", "cohesion-cases.json")

with open(CASES, encoding="utf-8") as f:
    SHARED = json.load(f)["cases"]


def graph_of(step):
    """The plain graph of a shared case."""
    nodes = {i: (frozenset(labels), {"id": i, **props}) for i, labels, props in step["nodes"]}
    return Graph(nodes, [(a, t, b, {}) for a, t, b in step["edges"]])


def run(name):
    """The answer to the shared case with this name."""
    case = next(c for c in SHARED if c["name"] == name)
    return cluster_certainty(graph_of(case["graph"]), **case.get("options", {}))


def of(answer, cluster):
    """One cluster's entry in an answer."""
    return next(c for c in answer["clusters"] if c["cluster"] == cluster)


class SharedCases(unittest.TestCase):
    def test_every_case_gives_its_recorded_answer(self):
        for case in SHARED:
            with self.subTest(case["name"]):
                answer = cluster_certainty(graph_of(case["graph"]), **case.get("options", {}))
                self.assertEqual(json.loads(json.dumps(answer)), case["expected"])


class Cohesion(unittest.TestCase):
    def test_a_tight_cluster_states_more_than_a_loose_contested_one(self):
        answer = run(
            "a tight, well-supported cluster states more certainty than a loose, contested one"
        )
        tight, loose = of(answer, "tight"), of(answer, "loose")
        self.assertEqual(tight["certainty"], loose["certainty"])
        self.assertGreater(tight["stated"]["low"], loose["stated"]["low"])
        self.assertEqual(loose["cohesion"]["contested"], ["b2"])

    def test_an_opted_in_parent_is_floored_and_others_are_not(self):
        answer = run("an opted-in parent is never more certain than its least certain member")
        self.assertEqual(of(answer, "floored")["stated"], {"low": 20, "high": 45})
        self.assertEqual(of(answer, "floored")["floored_by"], "y")
        self.assertEqual(of(answer, "plain")["stated"], of(answer, "plain")["certainty"])


if __name__ == "__main__":
    unittest.main()
