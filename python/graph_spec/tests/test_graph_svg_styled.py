"""graph_svg hides arrowheads and shows properties inline the same way the plugin's core does,
byte for byte.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

arrows_both_renderers (editor spec §15): the Python drawing script must hide and show arrowheads
the same way; and, as every renderer draws alike (§12), the properties a style graph shows inline
(§14). Each case of tests/style_cases.json is a note and the view it is drawn in; the core reads
it, by Node, and gives the problems of each style, the links drawn without their arrowheads, the
rows shown inline, and for each graph drawn the Graphviz source of each direction laid out. The
Python library must give the same, from gql_profile.read_for_drawing and read_style and
graph_svg's dot_source, arrowless_source, inline_source, nudged_source and directions.
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
from graphspec.style.arrows import arrowless  # noqa: E402
from graphspec.style.inline import inline_rows, value_text  # noqa: E402

with open(os.path.join(HERE, "style_cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)["cases"]

# The core's answer for each note: as the plugin draws a graph (packages/obsidian/src/block.ts and
# view-block.ts), the style read for it and the drawing styled for the view it is drawn in
# (style-source.ts, styledDrawing), laid out in each direction (render.ts, directions).
CORE_SCRIPT = """
const [src, cases] = [process.argv[1], JSON.parse(process.argv[2])];
const { readNote } = await import(`${src}/drawing.ts`);
const { readStyle } = await import(`${src}/style.ts`);
const { styleOf } = await import(`${src}/blocks.ts`);
const { directions } = await import(`${src}/render.ts`);
const { styledDrawing } = await import(`${src}/style-source.ts`);
const row = (p) => [p.block, p.line, p.severity, p.message, p.fix];
process.stdout.write(JSON.stringify(cases.map(([texts, view]) => {
  const reading = readNote(texts), styles = {}, drawn = {}, arrowless = {}, inline = {};
  for (const t of texts) {
    const g = styleOf(t);
    if (g !== null && !(g in styles)) styles[g] = readStyle(texts, g, reading).problems.map(row);
  }
  for (const [graph, drawing] of reading.graphs) {
    const { style } = readStyle(texts, graph, reading);
    const styled = styledDrawing(drawing, style, reading.world[graph], view ?? undefined);
    drawn[graph] = Object.fromEntries(directions(styled).map((d) => [d.rankdir, d.dot]));
    arrowless[graph] = styled.arrowless ?? [];
    inline[graph] = styled.inline ?? { boxes: [], links: [] };
  }
  return { styles, drawn, arrowless, inline };
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


def parts(world, name, problems):
    """The boxes and links of a graph, as the vault's graph-spec-draw.py chooses them and the
    core's layout-parity test mirrors it, each with its properties; and the keys drawn under a
    suggested name."""
    g = world[name]
    ids = [i for i, (labels, _) in g.nodes.items() if not labels & gr.SCHEMA_LABELS]
    words = gr.readings(g, None)

    def text(i):
        p = g.p(i)
        keys = ("name", "title", "text", "label")
        return next((p[k] for k in keys if isinstance(p.get(k), str) and p[k]), i)

    def kind(i):
        return " · ".join(sorted(x for x in g.nodes[i][0] if x not in gr.SCHEMA_LABELS))

    nodes = [(i, kind(i), text(i)) for i in ids]
    links = [(s, t, d, p) for s, t, d, p in g.edges if s in ids and d in ids]
    edges = [(s, gr._word(words, t), d) for s, t, d, _ in links]
    suggested = {p["suggested"] for p in problems if p.get("suggested") and p["graph"] == name}
    boxes = [(i, kind(i), g.p(i)) for i in ids]
    return nodes, edges, suggested, boxes, [(t, p) for _, t, _, p in links]


def python_answer(texts, view):
    """The Python library's answer for a note drawn in `view`, in the shape of the core's."""
    store, problems = gp.read_for_drawing(texts)
    world = gr.World.from_store(store)
    styles, drawn, hidden, shown = {}, {}, {}, {}
    for t in texts:
        g = gp.style_of(t)
        if g is not None and g not in styles:
            styles[g] = [row(p) for p in gp.read_style(texts, g, world)[1]]
    for name in (n for n in world.graphs if not n.startswith("schema ")):
        nodes, edges, suggested, boxes, links = parts(world, name, problems)
        style = gp.read_style(texts, name, world)[0]
        keys = [key for key, _, _ in nodes]
        hidden[name] = arrowless([t for t, _ in links], style["arrows"], view)
        shown[name] = inline_rows(boxes, links, style["shows"], view)
        drawn[name] = {
            rd: graph_svg.nudged_source(
                graph_svg.inline_source(
                    graph_svg.arrowless_source(
                        graph_svg.dot_source(nodes, edges, rd, suggested)[0], hidden[name]
                    ),
                    shown[name],
                ),
                style["nudges"],
                keys,
            )
            for rd in graph_svg.directions(style["direction"])
        }
    return {"styles": styles, "drawn": drawn, "arrowless": hidden, "inline": shown}


class Styled(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = core_answers()
        cls.python = [python_answer(texts_of(case), case.get("view")) for case in CASES]

    def test_arrowheads_are_hidden_and_shown_as_the_core_hides_and_shows_them(self):
        # arrows_both_renderers: the same links drawn without their arrowheads, and the same
        # source, byte for byte (a plain loop, never subTest: the tests-first replay counts a test
        # by its own result)
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["arrowless"], theirs["arrowless"], case["name"])
            self.assertEqual(ours["drawn"], theirs["drawn"], case["name"])

    def test_properties_are_shown_inline_as_the_core_shows_them(self):
        # properties_switch, properties_readable, crowded_properties: the same rows, each value
        # said the same way, written into the same source
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["inline"], theirs["inline"], case["name"])

    def test_each_style_gives_the_cores_problems(self):
        # the same problems for an Arrows and a Show as the core's, at the same block and line,
        # with the same words and fix: what cannot be used is left out by both
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["styles"], theirs["styles"], case["name"])

    def test_the_cases_hide_and_show_what_they_say(self):
        # the table proves what it says: some links are drawn without their arrowheads, some
        # rows are shown, a crowded box says how many are hidden, and a view changes the choice
        sources = [s for answer in self.core for d in answer["drawn"].values() for s in d.values()]
        self.assertTrue(any("dir=none" in s for s in sources))
        self.assertTrue(
            any("<font point-size=" in s and "properties hidden" in s for s in sources)
        )
        self.assertTrue(any("label=<<table" in s for s in sources))
        views = [case for case in CASES if case.get("view")]
        self.assertEqual(len(views), 2)

    def test_render_lays_out_the_styled_source(self):
        # what graph_svg.render hands Graphviz: the source with the arrowheads hidden and the rows
        # shown inline, before the nudges
        nodes = [("a", "Place", "A"), ("b", "Place", "B")]
        edges = [("a", "near", "b")]
        inline = {"boxes": [["a", [["open", "dawn"]]]], "links": [[0, [["miles", "2"]]]]}
        given = []

        def run(_args, input, **_kw):
            given.append(input)
            return mock.Mock(returncode=0, stdout='<svg width="300pt" height="100pt"></svg>')

        with (
            mock.patch.object(graph_svg, "DOT", "dot"),
            mock.patch.object(graph_svg.subprocess, "run", run),
        ):
            graph_svg.render(nodes, edges, direction="LR", arrowless=[0], inline=inline)
        dot = graph_svg.dot_source(nodes, edges, "LR")[0]
        styled = graph_svg.inline_source(graph_svg.arrowless_source(dot, [0]), inline)
        self.assertEqual(given, [styled])
        self.assertIn("dir=none", given[0])
        self.assertIn("open: dawn", given[0])

    def test_with_nothing_hidden_or_shown_the_source_is_the_layout_source(self):
        # arrows_shown_unless_hidden: nothing changes unless the style graph asks
        dot = graph_svg.dot_source([("a", "Place", "A")], [("a", "near", "a")], "LR")[0]
        self.assertIs(graph_svg.arrowless_source(dot, []), dot)
        self.assertIs(graph_svg.inline_source(dot, {"boxes": [], "links": []}), dot)
        self.assertIs(graph_svg.inline_source(dot, None), dot)

    def test_a_value_is_said_as_javascript_says_it(self):
        # numbers as JavaScript writes them, since the core reads every number as one
        # pairs, never a dict: 1, 1.0 and True are one key to Python
        cases = [
            (1.5, "1.5"),
            (4, "4"),
            (1.0, "1"),
            (True, "true"),
            (False, "false"),
            (1e21, "1e+21"),
            (1e-7, "1e-7"),
            (0.000001, "0.000001"),
            (12345678901234567890, "12345678901234567000"),
            (120000000000000000000000, "1.2e+23"),
            (-0.0, "0"),
            (-2.5, "-2.5"),
            (float("inf"), "Infinity"),
            ("text", "text"),
        ]
        self.assertEqual([(v, value_text(v)) for v, _ in cases], cases)


if __name__ == "__main__":
    unittest.main()
