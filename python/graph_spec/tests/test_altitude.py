"""Altitude and audience profiles match the JavaScript library's on every shared case.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_altitude

The cases are packages/graph-spec/test/altitude-cases.json (editor spec §32): altitude as a query
parameter, named audience profiles, altitude relative to a lens and two axes kept apart.
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.altitude import altitude  # noqa: E402
from graphspec.rules.plain_graph import Graph  # noqa: E402

CASES = os.path.join(ROOT, "packages", "graph-spec", "test", "altitude-cases.json")

with open(CASES, encoding="utf-8") as f:
    SHARED = json.load(f)["cases"]

# Each JavaScript name a case calls, and its Python twin.
CALLS = {
    "atAltitude": altitude.at_altitude,
    "profilesOf": altitude.profiles_of,
    "audienceProjection": altitude.audience_projection,
    "altitudesIn": altitude.altitudes_in,
    "byAxes": altitude.by_axes,
}


def graph_of(s):
    """The plain graph of a shared case."""
    nodes = {i: (frozenset(labels), {"id": i, **props}) for i, labels, props in s["nodes"]}
    return Graph(nodes, [(e[0], e[1], e[2], e[3] if len(e) > 3 else {}) for e in s["edges"]])


class SharedCases(unittest.TestCase):
    def test_every_case_gives_its_recorded_answer(self):
        for case in SHARED:
            with self.subTest(case["name"]):
                out = CALLS[case["call"]](graph_of(case["graph"]), *case["args"])
                self.assertEqual(json.loads(json.dumps(out)), case["expected"])


class Altitude(unittest.TestCase):
    def test_both_axes_together(self):
        case = next(c for c in SHARED if c["call"] == "byAxes")
        g = graph_of(case["graph"])
        self.assertEqual(
            altitude.by_axes(g, {"composition": "cell", "audience": "board"}), ["loan"]
        )
        self.assertEqual(altitude.by_axes(g, {"composition": "atom", "audience": "board"}), [])


if __name__ == "__main__":
    unittest.main()
