"""Which things in different graphs are one (editor spec §27, same_as_across_graphs; risk
ARCH-6). Inside a graph the name is the id. Across graphs, only a written SAME_AS link joins two
things, and the same name with no link stays a guess. The cases are
packages/graph-spec/test/same-as-cases.json, which the JavaScript library answers too
(packages/graph-spec/test/same-as.test.mjs).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_same_as
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
from graphspec.engine.mesh.same_as import same_as  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "same-as-cases.json"), encoding="utf-8"
) as f:
    CASES = json.load(f)["cases"]


def world_of(blocks):
    st = gp.Store()
    for lines in blocks:
        st.apply("\n".join(lines))
    return gr.World.from_store(st)


class SameAsAcrossGraphs(unittest.TestCase):
    def test_each_case(self):
        for c in CASES:
            with self.subTest(c["name"]):
                self.assertEqual(same_as(world_of(c["blocks"])), c["answer"])

    def test_a_link_changes_neither_graph(self):
        w = world_of(CASES[0]["blocks"])
        same_as(w)
        self.assertEqual(list(w.graphs["catalog"].nodes), ["widget_12"])
        self.assertEqual(list(w.graphs["shop"].nodes), ["widget", "catalog_widget"])


if __name__ == "__main__":
    unittest.main()
