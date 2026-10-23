"""Editor spec §29, two_kinds_of_time: a graph as at a date on its two kinds of time. Recorded time
and real-world time are both kept, and a lens run as at a past date on either gives the answer true
then. The cases are packages/graph-spec/test/two-times-cases.json, which the JavaScript library is
held to as well.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_as_at
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
from graphspec.engine.mesh.as_at import as_at, lens_as_at  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "two-times-cases.json"), encoding="utf-8"
) as f:
    T = json.load(f)


def graph():
    st = gp.Store()
    st.apply("\n".join(T["block"]))
    return gr.World.from_store(st)["staff"]


class TwoKindsOfTime(unittest.TestCase):
    def test_each_case(self):
        g = graph()
        for c in T["cases"]:
            with self.subTest(c["name"]):
                self.assertEqual(lens_as_at(g, T["lens"], c["axis"], c["date"]), c["buckets"])

    def test_a_link_holds_only_while_both_its_ends_do(self):
        g = graph()
        self.assertEqual(as_at(g, "recorded", "2024-06-01").out("ann2"), [])
        self.assertNotIn("ann", as_at(g, "recorded", "2024-10-01").nodes)

    def test_an_axis_that_is_neither_recorded_nor_real_is_refused(self):
        with self.assertRaisesRegex(ValueError, "recorded or real"):
            as_at(graph(), "valid", "2024-01-01")


if __name__ == "__main__":
    unittest.main()
