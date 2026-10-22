"""Editor spec §11, large_drawn_quick: past 300 things a graph is laid out the quick way, in one
direction, with Graphviz's quick settings, as the plugin's core lays it out (render.ts). A graph of
300 things or fewer is laid out each way in full. Also §15, large_way_in: the table is offered past
the same number of things as in the core.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

import graph_svg  # noqa: E402
from graphspec.style import diagram_types  # noqa: E402

CORE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "packages", "core"
)


def chain(n):
    """A graph of `n` things, each linked to the one before, as render's nodes and edges."""
    nodes = [(f"t{i}", "Thing", f"Thing {i}") for i in range(n)]
    edges = [(f"t{i}", "then", f"t{i + 1}") for i in range(n - 1)]
    return nodes, edges


class QuickLayout(unittest.TestCase):
    def test_past_300_one_direction_with_the_quick_settings(self):
        self.assertEqual(graph_svg.directions(None, None, 301), graph_svg.STYLE["directions"][:1])
        nodes, edges = chain(301)
        src = graph_svg.drawn_source(nodes, edges, "LR")[0]
        self.assertEqual(src.split("\n")[1], graph_svg.QUICK_SETTINGS)

    def test_300_or_fewer_each_way_in_full(self):
        self.assertEqual(graph_svg.directions(None, None, 300), graph_svg.STYLE["directions"])
        nodes, edges = chain(300)
        self.assertNotIn("nslimit", graph_svg.drawn_source(nodes, edges, "LR")[0])

    def test_a_routing_chosen_still_wins(self):
        nodes, edges = chain(301)
        lines = graph_svg.drawn_source(nodes, edges, "LR", routing="right-angled")[0].split("\n")
        self.assertLess(
            lines.index(graph_svg.QUICK_SETTINGS), lines.index("  graph [splines=ortho];")
        )


class SameAsTheCore(unittest.TestCase):
    def test_the_numbers_match_the_core(self):
        with open(os.path.join(CORE, "src", "types.ts"), encoding="utf-8") as f:
            types = f.read()
        with open(os.path.join(CORE, "src", "render.ts"), encoding="utf-8") as f:
            render = f.read()
        self.assertIn(f"export const LARGE_GRAPH = {diagram_types.LARGE_GRAPH};", types)
        self.assertIn(f"export const QUICK_LAYOUT = {diagram_types.QUICK_LAYOUT};", render)
        self.assertIn(f"const QUICK_SETTINGS = '{diagram_types.QUICK_SETTINGS}';", render)


if __name__ == "__main__":
    unittest.main()
