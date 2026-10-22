"""Graphviz's layout as drawing marks (editor spec §43, plugin_interface): the one picture format
every diagram type gives back, read here as the core's graphviz-marks.ts reads it. The cases in
marks_cases.json are read by both libraries from one layout and compared there, mark for mark
(packages/core/test/graphviz-marks-parity.test.js). These prove the parts here, on a layout written
out by hand."""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.style.marks import layout_marks  # noqa: E402
from graphspec.style.marks_json import PX, arrowhead, colour_token, known, shape_style  # noqa: E402

# A layout of two things and a link, as Graphviz's JSON gives it: 100 by 50 points, no room round.
LAYOUT = {
    "name": "G",
    "directed": True,
    "bb": "0,0,100,50",
    "bgcolor": "transparent",
    "_subgraph_cnt": 0,
    "objects": [
        {
            "name": "a",
            "pos": "20,25",
            "shape": "box",
            "style": "rounded,filled",
            "_draw_": [
                {"op": "c", "color": "#000200"},
                {"op": "C", "color": "#000100"},
                {"op": "P", "points": [[0, 10], [40, 10], [40, 40], [0, 40]]},
            ],
            "_ldraw_": [
                {"op": "F", "size": 12, "face": "Helvetica"},
                {"op": "c", "color": "#0000fd"},
                {"op": "T", "pt": [20, 22], "align": "c", "width": 10, "text": "A"},
            ],
        },
        {"name": "b", "pos": "80,25", "shape": "ellipse", "_draw_": []},
    ],
    "edges": [
        {
            "tail": 0,
            "head": 1,
            "_gvid": 0,
            "_draw_": [
                {"op": "c", "color": "#0000fc"},
                {"op": "b", "points": [[40, 25], [56, 25]]},
            ],
            "_hdraw_": [
                {"op": "C", "color": "#0000fc"},
                {"op": "P", "points": [[56, 27], [60, 25], [56, 23]]},
            ],
        }
    ],
}


class ColourTokens(unittest.TestCase):
    def test_each_stand_in_is_read_back_as_the_token_it_stands_for(self):
        self.assertEqual(colour_token("#0000FD"), "text")
        self.assertEqual(colour_token("#000102"), "kind.2")
        self.assertEqual(colour_token("#00020a"), "kind.10")
        self.assertEqual(colour_token("#000300"), "reading.0")
        self.assertEqual(colour_token("#000401"), "reading.1.label")
        self.assertEqual(colour_token("transparent"), "none")
        self.assertEqual(colour_token("#12345600"), "none")
        self.assertEqual(colour_token("red"), "line")

    def test_a_shape_style_names_its_fill_and_its_line_only_when_not_the_one_implied(self):
        self.assertEqual(shape_style("#000100", "#000100", False), "kind.0")
        self.assertEqual(shape_style("#0005fe", "#000000", False), "picture.line.line")
        self.assertEqual(shape_style(None, "#0000fe", True), "text.muted.outline.dashed")

    def test_only_stand_ins_black_white_and_none_are_known(self):
        self.assertTrue(known("#000100") and known("#FFFFFF") and known("transparent"))
        self.assertFalse(known("lightgrey") or known(None))


class LayoutMarks(unittest.TestCase):
    def setUp(self):
        self.laid = layout_marks(LAYOUT)
        self.by_id = {m["id"]: m for m in self.laid["marks"]}

    def test_the_space_is_the_drawing_in_css_pixels(self):
        self.assertEqual(self.laid["space"], {"width": 100 * PX, "height": 50 * PX})

    def test_a_thing_is_a_box_from_the_top_with_its_outline_and_its_label(self):
        box = self.by_id["t:a"]
        self.assertEqual(
            (box["kind"], box["shape"], box["role"], box["name"]), ("box", "round", "thing", "A")
        )
        self.assertEqual(box["style"], "kind.0")
        self.assertAlmostEqual(box["y"], 10 * PX)
        label = self.by_id["l:t:a"]
        self.assertEqual(
            (label["text"], label["font"], label["anchor"]), ("A", "Helvetica", "middle")
        )
        self.assertAlmostEqual(label["size"], 12 * PX)

    def test_a_link_names_the_things_it_joins_and_ends_in_its_arrowhead(self):
        link = self.by_id['e:["a","b"]#0']
        self.assertEqual((link["from"], link["to"], link["style"]), ("a", "b", "link"))
        head = self.by_id['head:e:["a","b"]#0']
        self.assertAlmostEqual(head["x"], 60 * PX)
        self.assertEqual(head["angle"], 0)

    def test_parts_are_in_the_order_graphviz_writes_them(self):
        parts = [(p["kind"], p["id"]) for p in self.laid["layout"]["parts"]]
        self.assertEqual(
            parts, [("graph", ""), ("node", "node1"), ("node", "node2"), ("edge", "edge1")]
        )
        self.assertNotIn("lost", self.laid["layout"])

    def test_a_text_the_json_leaves_out_or_a_colour_no_stand_in_says_the_marks_are_lost(self):
        grey = {
            **LAYOUT,
            "objects": [{**LAYOUT["objects"][0], "_draw_": [{"op": "C", "color": "lightgrey"}]}],
        }
        self.assertTrue(layout_marks({**grey, "edges": []})["layout"]["lost"])

    def test_an_arrowhead_points_away_from_its_link(self):
        tip = arrowhead(
            [{"op": "P", "points": [[0, 0], [10, 5], [0, 10]]}], lambda x, y: [x, y], [0, 5]
        )
        self.assertEqual((tip["x"], tip["y"], tip["angle"], tip["size"]), (10, 5, 0, 10))


if __name__ == "__main__":
    unittest.main()
