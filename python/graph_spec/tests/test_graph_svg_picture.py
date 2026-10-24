"""graph_svg keeps room for a picture on a box the same way the plugin's core does, byte for byte.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

animated_image_shown (editor spec §18): where a graph's style graph asks, with a Picture, a
thing's image is drawn on its box, and every renderer keeps the same room for it (§12). Each case
of tests/picture_cases.json is a note and the view it is drawn in; the core reads it, by Node, and
gives the problems of each style, the boxes drawn with a picture, and for each graph drawn the
Graphviz source of each direction laid out. The Python library must give the same, from
gql_profile.read_style and graph_svg.render(**render_args(…)), the source it hands Graphviz.
"""

import json
import os
import subprocess
import sys
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CORE = os.path.join(ROOT, "packages", "core", "src")
sys.path.insert(0, os.path.join(HERE, "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
import graph_svg  # noqa: E402
import fake_dot  # noqa: E402
from graphspec.style.picture import PICTURE_MARK, PICTURE_SIZE, picture_source  # noqa: E402

with open(os.path.join(HERE, "picture_cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)["cases"]

# The core's answer for each note, as the plugin draws a graph (packages/obsidian/src/block.ts and
# view-block.ts). It holds:
# - the style read for it.
# - the drawing styled for the view it is drawn in (style-source.ts, styledDrawing).
# - laid out in each direction (render.ts, directions).
CORE_SCRIPT = """
const [src, cases] = [process.argv[1], JSON.parse(process.argv[2])];
const { readNote } = await import(`${src}/drawing.ts`);
const { readStyle } = await import(`${src}/style.ts`);
const { styleOf } = await import(`${src}/blocks.ts`);
const { directions } = await import(`${src}/render.ts`);
const { styledDrawing } = await import(`${src}/style-source.ts`);
const row = (p) => [p.block, p.line, p.severity, p.message, p.fix];
process.stdout.write(JSON.stringify(cases.map(([texts, view]) => {
  const reading = readNote(texts), styles = {}, drawn = {}, pictures = {};
  for (const t of texts) {
    const g = styleOf(t);
    if (g !== null && !(g in styles)) styles[g] = readStyle(texts, g, reading).problems.map(row);
  }
  for (const [graph, drawing] of reading.graphs) {
    const { style } = readStyle(texts, graph, reading);
    const styled = styledDrawing(drawing, style, reading.world[graph], view ?? undefined);
    drawn[graph] = Object.fromEntries(directions(styled).map((d) => [d.rankdir, d.dot]));
    pictures[graph] = (styled.pictures ?? []).map((p) => [p.index, p.key, p.property, p.value]);
  }
  return { styles, drawn, pictures };
})));
"""


def texts_of(case):
    """A case's blocks as the note's texts."""
    return ["\n".join(lines) for lines in case["blocks"]]


def core_answers():
    """The core's answer for every case, by Node."""
    cases = json.dumps([[texts_of(case), case.get("view")] for case in CASES])
    out = subprocess.run(
        ["node", "--input-type=module", "-e", CORE_SCRIPT, CORE, cases],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


def row(p):
    return [p["block"], p["line"], p["severity"], p["message"], p["fix"]]


def rendered(args):
    """The sources graph_svg.render hands Graphviz for `args`, by the direction each is laid out
    in."""
    given = []

    def run(_args, input, **_kw):
        given.append(input)
        return mock.Mock(returncode=0, stdout=fake_dot.answer(_args))

    with (
        mock.patch.object(graph_svg, "DOT", "dot"),
        mock.patch.object(graph_svg.subprocess, "run", run),
    ):
        graph_svg.render(**args)
    rankdirs = graph_svg.directions(args["direction"], args["diagram"])
    return dict(zip(rankdirs, given, strict=True))


def python_answer(texts, view):
    """The Python library's answer for a note drawn in `view`, in the shape of the core's."""
    store, _ = gp.read_for_drawing(texts)
    world = gr.World.from_store(store)
    styles, drawn, pictures = {}, {}, {}
    for t in texts:
        g = gp.style_of(t)
        if g is not None and g not in styles:
            styles[g] = [row(p) for p in gp.read_style(texts, g, world)[1]]
    for name in (n for n in world.graphs if not n.startswith("schema ")):
        args = graph_svg.render_args(texts, name, view)
        drawn[name] = rendered(args)
        pictures[name] = [
            [p["index"], p["key"], p["property"], p["value"]] for p in args["pictures"]
        ]
    return {"styles": styles, "drawn": drawn, "pictures": pictures}


class Picture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = core_answers()
        cls.python = [python_answer(texts_of(case), case.get("view")) for case in CASES]

    def test_the_same_boxes_have_a_picture(self):
        # animated_image_shown: the same boxes drawn with a picture, from the same property.
        # A plain loop, never subTest. The tests-first replay counts a test by its own result.
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["pictures"], theirs["pictures"], case["name"])

    def test_the_room_kept_is_the_cores_byte_for_byte(self):
        # the same marked square at the top of each such box, in each direction laid out
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["drawn"], theirs["drawn"], case["name"])

    def test_each_style_gives_the_cores_problems(self):
        # The same problems for a Picture as the core's, at the same block and line. They have
        # the same words and fix. What cannot be used is left out by both.
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["styles"], theirs["styles"], case["name"])

    def test_the_cases_draw_what_they_say(self):
        # the table proves what it says: room kept, a view's own picture, and Pictures at fault
        sources = [s for answer in self.core for d in answer["drawn"].values() for s in d.values()]
        square = f'width="{PICTURE_SIZE}" height="{PICTURE_SIZE}" bgcolor="{PICTURE_MARK}"'
        self.assertTrue(all(square in s for s in sources))
        self.assertEqual(self.core[1]["pictures"], {"pets": [[1, "rex", "photo", "[[rex.gif]]"]]})
        self.assertEqual(len(self.core[4]["styles"]["pets"]), 7, self.core[4]["styles"])

    def test_a_picture_in_lanes_is_kept_in_its_box(self):
        # laid out as lanes, each cat's box keeps its square and the dog's has none, in each
        # direction laid out
        lanes = self.core[3]["drawn"]["pets"].values()
        self.assertTrue(all("cluster" in s for s in lanes))
        for s in lanes:
            boxes = [line for line in s.split("\n") if "[label=<<table " in line]
            pictured = [line.split('"')[1] for line in boxes if PICTURE_MARK in line]
            self.assertEqual(pictured, ["tom", "kit"], s)

    def test_with_no_picture_the_source_is_unchanged(self):
        # animated_image_shown: nothing on a box unless a Picture asks
        dot = graph_svg.dot_source([("a", "Cat", "A")], [("a", "near", "a")], "LR")[0]
        self.assertIs(picture_source(dot, []), dot)
        texts = ["// graph: g\n(a:Cat {name: 'A', photo: '[[a.gif]]'})"]
        self.assertEqual(graph_svg.render_args(texts, "g")["pictures"], [])


if __name__ == "__main__":
    unittest.main()
