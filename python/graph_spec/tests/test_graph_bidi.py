"""Editor spec §42, bidi_labels: in a drawing, a label with a right-to-left letter, such as Arabic
or Hebrew, is set apart and read from its first strong letter. graph_bidi wraps it in Unicode's
first strong isolate, as the core does. Both read packages/core/test/bidi-label-cases.json, so they
agree. A label with no right-to-left letter stays byte for byte.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_graph_bidi
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import graph_bidi  # noqa: E402
import graph_svg  # noqa: E402

CASES_FILE = os.path.join(
    HERE, "..", "..", "..", "packages", "core", "test", "bidi-label-cases.json"
)
with open(CASES_FILE, encoding="utf-8") as f:
    CASES = json.load(f)["cases"]


class BidiLabels(unittest.TestCase):
    def test_each_case_is_set_apart_as_the_core_sets_it(self):
        for c in CASES:
            with self.subTest(c["name"]):
                self.assertEqual(graph_bidi.isolate_labels(c["svg"]), c["isolated"])

    def test_the_themed_drawing_sets_apart_a_right_to_left_label(self):
        svg = '<svg width="10pt" height="10pt">'
        svg += '<text fill="#0000fd">مرحبا</text><text>Ann</text></svg>'
        out = graph_svg._themed(svg, [])
        self.assertIn(">&#x2068;مرحبا&#x2069;</text>", out)
        self.assertIn(">Ann</text>", out)


if __name__ == "__main__":
    unittest.main()
