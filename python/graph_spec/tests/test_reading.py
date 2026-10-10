"""A document's graph line is read with whitespace as GQL names it (graph spec §3), as the graph
reader reads it: the one set every reader uses, never Python's own isspace() or splitlines().

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.documents.reading import graph_name, require_graph_line  # noqa: E402

MVS = "\N{MONGOLIAN VOWEL SEPARATOR}"
NEL = "\x85"


class GraphLine(unittest.TestCase):
    def test_a_graph_line_spaced_with_u180e_names_its_graph(self):
        block = f"//{MVS}graph:{MVS}g\n(a:T)"
        self.assertEqual(require_graph_line(block, "a note"), block)
        self.assertEqual(graph_name(block), "g")

    def test_the_graph_is_named_as_the_reader_names_it(self):
        self.assertEqual(graph_name("\n  // graph: reader · SOURCE\n(a:T)"), "reader")
        self.assertIsNone(graph_name("(a:T)"))

    def test_u0085_is_not_whitespace_so_a_line_it_opens_names_no_graph(self):
        with self.assertRaises(ValueError):
            require_graph_line(f"{NEL}// graph: g\n(a:T)", "a note")
        self.assertIsNone(graph_name(f"{NEL}// graph: g"))

    def test_a_line_ends_only_at_a_line_feed(self):
        self.assertIsNone(graph_name("// a note\N{LINE SEPARATOR}// graph: g"))


if __name__ == "__main__":
    unittest.main()
