"""The altitude and topic index matches the JavaScript library's on every shared case.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_altitude_index

The cases are packages/graph-spec/test/altitude-index-cases.json (editor spec §32,
altitude_topic_index): exact and similarity search ranked by the derived certainty key, contested
things marked, and an index rebuilt alike.
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.altitude.altitude_index import altitude_index, search_index  # noqa: E402
from graphspec.rules.plain_graph import Graph  # noqa: E402

CASES = os.path.join(ROOT, "packages", "graph-spec", "test", "altitude-index-cases.json")

with open(CASES, encoding="utf-8") as f:
    SHARED = json.load(f)["cases"]


def graph_of(s):
    """The plain graph of a shared case."""
    nodes = {i: (frozenset(labels), {"id": i, **props}) for i, labels, props in s["nodes"]}
    return Graph(nodes, [(e[0], e[1], e[2], e[3] if len(e) > 3 else {}) for e in s["edges"]])


class SharedCases(unittest.TestCase):
    def test_every_case_gives_its_recorded_answer(self):
        for case in SHARED:
            with self.subTest(case["name"]):
                index = altitude_index(graph_of(case["graph"]))
                out = index if case["query"] is None else search_index(index, case["query"])
                self.assertEqual(json.loads(json.dumps(out)), case["expected"])


class AltitudeIndex(unittest.TestCase):
    def test_a_rebuilt_index_is_the_same(self):
        g = SHARED[0]["graph"]
        self.assertEqual(altitude_index(graph_of(g)), altitude_index(graph_of(g)))


if __name__ == "__main__":
    unittest.main()
