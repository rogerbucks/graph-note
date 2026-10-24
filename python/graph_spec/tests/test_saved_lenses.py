"""Lenses as graph data match the JavaScript library's on every shared case.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_saved_lenses

The cases are packages/graph-spec/test/saved-lens-cases.json (editor spec §33,
lens_is_saved_query): a lens answers fresh, holds no data and is flagged when a schema changes.
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.lenses.saved_lenses import lenses_of, run_lens  # noqa: E402
from graphspec.rules.plain_graph import Graph  # noqa: E402

CASES = os.path.join(ROOT, "packages", "graph-spec", "test", "saved-lens-cases.json")

with open(CASES, encoding="utf-8") as f:
    SHARED = json.load(f)["cases"]

CALLS = {"lensesOf": lenses_of, "runLens": run_lens}


def graph_of(s):
    """The plain graph of a shared case."""
    nodes = {i: (frozenset(labels), {"id": i, **props}) for i, labels, props in s["nodes"]}
    return Graph(nodes, [(e[0], e[1], e[2], e[3] if len(e) > 3 else {}) for e in s["edges"]])


def run(case):
    """A shared case's call, its last argument given as options."""
    *args, options = case["args"]
    return CALLS[case["call"]](graph_of(case["graph"]), *args, **options)


class SharedCases(unittest.TestCase):
    def test_every_case_gives_its_recorded_answer(self):
        for case in SHARED:
            with self.subTest(case["name"]):
                self.assertEqual(json.loads(json.dumps(run(case))), case["expected"])


class SavedLenses(unittest.TestCase):
    def test_a_lens_is_refused_for_a_thing_that_is_not_one(self):
        case = SHARED[0]
        with self.assertRaises(ValueError):
            run_lens(graph_of(case["graph"]), "d1")


if __name__ == "__main__":
    unittest.main()
