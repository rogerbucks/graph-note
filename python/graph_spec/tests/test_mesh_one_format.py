"""One graph format for data, queries and structure (editor spec §27, mesh_one_format). A block
holding a graph's schema and its inserts is read once. One query engine, the lens rules, answers
about its things and its schema alike. The cases are
packages/graph-spec/test/mesh-one-format-cases.json, which the JavaScript library answers too
(packages/graph-spec/test/mesh-one-format.test.mjs).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_mesh_one_format
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
from graphspec.rules.lens import lens_buckets  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "mesh-one-format-cases.json"),
    encoding="utf-8",
) as f:
    T = json.load(f)


class MeshOneFormat(unittest.TestCase):
    def setUp(self):
        st = gp.Store()
        self.read = st.apply("\n".join(T["block"]))
        self.graph = gr.World.from_store(st)[T["graph"]]

    def test_the_block_is_read_once_into_one_graph(self):
        self.assertEqual(self.read, T["graph"])
        self.assertEqual(len(self.graph.labelled("ElementType")), 3)
        self.assertEqual(self.graph.labelled("Product"), ["widget", "gadget"])

    def test_each_case(self):
        for c in T["cases"]:
            with self.subTest(c["name"]):
                self.assertEqual(lens_buckets(self.graph, c["lens"]), c["buckets"])


if __name__ == "__main__":
    unittest.main()
