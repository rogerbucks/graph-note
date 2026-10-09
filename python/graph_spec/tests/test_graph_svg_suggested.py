"""A box drawn under a suggested name is dashed and labelled as suggested, as the core draws it.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

unnamed_drawn_suggested (editor spec §4, Roger, 10 Oct 2026): a thing written without a name is
drawn under its suggested name, dashed and labelled as suggested — by a sign and in words, never
by colour alone — by every reader alike. The marking is in the layout source, so the core's and
graph_svg's stay byte-identical (packages/graph-spec/test/layout.test.mjs holds them to it).
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import graph_svg  # noqa: E402

NODES = [
    ("q", "Question", "Which?"),
    ("large_reader", "Option", "Large reader"),
    ("eyes", "", "Easy on the eyes"),
]
EDGES = [("large_reader", "answers", "q"), ("eyes", "favours", "large_reader")]


def box(source, key):
    """The line of the layout source that draws a box."""
    return next(line for line in source.split("\n") if line.startswith(f'  "{key}" [label='))


class SuggestedBoxes(unittest.TestCase):
    def test_a_box_under_a_suggested_name_is_dashed_and_says_so(self):
        source = graph_svg.dot_source(NODES, EDGES, "LR", suggested={"large_reader", "eyes"})[0]
        for key in ("large_reader", "eyes"):
            self.assertTrue(box(source, key).endswith(', style="rounded,filled,dashed"];'), key)
            self.assertIn(
                '<font point-size="9" color="#0000fe">✎ SUGGESTED NAME</font></td></tr></table>>',
                box(source, key),
            )
        self.assertNotIn("dashed", box(source, "q"))
        self.assertNotIn("SUGGESTED", box(source, "q"))

    def test_with_none_suggested_the_source_is_as_before(self):
        self.assertEqual(
            graph_svg.dot_source(NODES, EDGES, "TB", suggested=()),
            graph_svg.dot_source(NODES, EDGES, "TB"),
        )

    def test_the_mark_comes_from_the_style_sidecar(self):
        self.assertEqual(graph_svg.STYLE["suggested_label"], "✎ suggested name")
        self.assertEqual(graph_svg.STYLE["suggested_style"], "rounded,filled,dashed")


if __name__ == "__main__":
    unittest.main()
