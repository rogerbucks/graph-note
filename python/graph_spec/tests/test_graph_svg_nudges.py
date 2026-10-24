"""graph_svg honours a graph's nudges the same way the plugin's core does, byte for byte.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

python_honours_nudges (editor spec §6): a graph's style block nudges its layout — beside, before,
group or direction (four_nudge_words) — and the Python library must draw it as the plugin does.
Each case of tests/nudge_cases.json is a note; the core reads it, by Node, and gives the problems
reading the data, the problems of each style, and for each graph drawn the Graphviz source of each
direction laid out, nudges written in. The Python library must give the same, from
gql_profile.read_for_drawing, gql_profile.read_style and graph_svg's dot_source, nudged_source and
directions. A nudge that names nothing or conflicts is the same problem in both (nudge_problems);
a style block that cannot be read leaves the graph in the locked style (broken_style_block).
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

with open(os.path.join(HERE, "nudge_cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)["cases"]

# The core's answer for each note, as the plugin draws a graph (packages/obsidian/src/block.ts).
# It holds:
# - the style read for it, and its direction set on the drawing.
# - its nudges written into the source of each direction laid out (render.ts, directions).
CORE_SCRIPT = """
const [src, notes] = [process.argv[1], JSON.parse(process.argv[2])];
const { readNote } = await import(`${src}/drawing.ts`);
const { readStyle } = await import(`${src}/style.ts`);
const { styleOf } = await import(`${src}/blocks.ts`);
const { directions } = await import(`${src}/render.ts`);
const { nudgedDrawing, nudgedSource } = await import(`${src}/style-source.ts`);
const { layoutSource } = await import(`${src}/layout.ts`);
const row = (p) => [p.block, p.line, p.severity, p.message, p.fix];
process.stdout.write(JSON.stringify(notes.map((texts) => {
  const reading = readNote(texts), styles = {}, drawn = {}, without = {};
  for (const t of texts) {
    const g = styleOf(t);
    if (g !== null && !(g in styles)) styles[g] = readStyle(texts, g, reading).problems.map(row);
  }
  for (const [graph, drawing] of reading.graphs) {
    const { style } = readStyle(texts, graph, reading);
    const laid = directions({ ...nudgedDrawing(drawing, style), nudges: style.nudges });
    drawn[graph] = Object.fromEntries(laid.map((d) => [d.rankdir, d.dot]));
    // as in a view that leaves a box out: the LR source with each box's key left out in turn
    const keys = drawing.boxes.map((b) => b.key), dot = layoutSource(drawing, 'LR').source;
    without[graph] = keys.map((k) => nudgedSource(dot, style.nudges, keys.filter((x) => x !== k)));
  }
  return { reading: reading.problems.map(row), styles, drawn, without };
})));
"""


def texts_of(case):
    """A case's blocks as the note's texts."""
    return ["\n".join(lines) for lines in case["blocks"]]


def core_answers():
    """The core's answer for every case, by Node."""
    notes = json.dumps([texts_of(case) for case in CASES])
    out = subprocess.run(
        ["node", "--input-type=module", "-e", CORE_SCRIPT, CORE, notes],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


def row(p):
    return [p["block"], p["line"], p["severity"], p["message"], p["fix"]]


def parts(world, name, problems):
    """The boxes and links of a graph, as the vault's graph-spec-draw.py chooses them and the
    core's layout-parity test mirrors it; and the keys drawn under a suggested name."""
    g = world[name]
    ids = [i for i, (labels, _) in g.nodes.items() if not labels & gr.SCHEMA_LABELS]
    words = gr.readings(g, None)

    def text(i):
        p = g.p(i)
        keys = ("name", "title", "text", "label")
        return next((p[k] for k in keys if isinstance(p.get(k), str) and p[k]), i)

    nodes = [
        (i, " · ".join(sorted(x for x in g.nodes[i][0] if x not in gr.SCHEMA_LABELS)), text(i))
        for i in ids
    ]
    edges = [(s, gr._word(words, t), d) for s, t, d, _ in g.edges if s in ids and d in ids]
    suggested = {p["suggested"] for p in problems if p.get("suggested") and p["graph"] == name}
    return nodes, edges, suggested


def python_answer(texts):
    """The Python library's answer for a note, in the shape of the core's."""
    store, problems = gp.read_for_drawing(texts)
    world = gr.World.from_store(store)
    styles, drawn, without = {}, {}, {}
    for t in texts:
        g = gp.style_of(t)
        if g is not None and g not in styles:
            styles[g] = [row(p) for p in gp.read_style(texts, g, world)[1]]
    for name in (n for n in world.graphs if not n.startswith("schema ")):
        nodes, edges, suggested = parts(world, name, problems)
        style = gp.read_style(texts, name, world)[0]
        keys = [key for key, _, _ in nodes]
        drawn[name] = {
            rd: graph_svg.nudged_source(
                graph_svg.dot_source(nodes, edges, rd, suggested)[0], style["nudges"], keys
            )
            for rd in graph_svg.directions(style["direction"])
        }
        dot = graph_svg.dot_source(nodes, edges, "LR", suggested)[0]
        without[name] = [
            graph_svg.nudged_source(dot, style["nudges"], [x for x in keys if x != k])
            for k in keys
        ]
    return {
        "reading": [row(p) for p in problems],
        "styles": styles,
        "drawn": drawn,
        "without": without,
    }


class Nudges(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = core_answers()

    def test_python_nudges(self):
        # python_honours_nudges: every graph drawn, in every direction laid out, byte for byte.
        # A plain loop, never subTest. The tests-first replay counts a test by its own result.
        for case, theirs in zip(CASES, self.core, strict=True):
            self.assertEqual(python_answer(texts_of(case))["drawn"], theirs["drawn"], case["name"])

    def test_a_nudge_naming_a_box_not_drawn_is_left_out_as_the_core_leaves_it_out(self):
        # As in a view that leaves a box out. A nudge naming a key not among those drawn adds
        # nothing, in the core and in graph_svg alike. Each box of each graph is left out in turn.
        dot = graph_svg.dot_source([("a", "Place", "A")], [], "LR")[0]
        lone = [{"word": "beside", "thing": "a", "other": "zz"}]
        self.assertEqual(graph_svg.nudged_source(dot, lone, ["a"]), dot)
        for case, theirs in zip(CASES, self.core, strict=True):
            ours = python_answer(texts_of(case))["without"]
            self.assertEqual(ours, theirs["without"], case["name"])

    def test_a_direction_in_the_wrong_case_is_fixed_to_the_one_it_means(self):
        # nudge_problems: both sides of the comparison lower-cased, as the core compares them
        texts = [
            "// graph: g\n(a:Place {name: 'A'})",
            "// graph: g_style · STYLE g\n(n1:Nudge {word: 'direction', direction: 'tb'}),\n"
            "(n2:Nudge {word: 'direction', direction: 'Lr'})",
        ]
        world = gr.World.from_store(gp.read_for_drawing(texts)[0])
        self.assertEqual(
            [p["fix"] for p in gp.read_style(texts, "g", world)[1]],
            ["change tb to TB", "change Lr to LR"],
        )

    def test_each_nudge_and_each_style_block_gives_the_cores_problems(self):
        # nudge_problems, broken_style_block: the same problems, at the same block and line, with
        # the same words and fix
        for case, theirs in zip(CASES, self.core, strict=True):
            ours = python_answer(texts_of(case))
            self.assertEqual(ours["styles"], theirs["styles"], case["name"])
            self.assertEqual(ours["reading"], theirs["reading"], case["name"])

    def test_the_cases_nudge_with_every_word_and_some_change_nothing(self):
        # The table proves what it says. Each of the four words is written and drawn. A style
        # that cannot be used leaves the source exactly the layout source.
        written = {
            line.split("word: '")[1].split("'")[0]
            for case in CASES
            for block in case["blocks"]
            for line in block
            if "word: '" in line
        }
        self.assertLessEqual({"beside", "before", "group", "direction"}, written)
        sources = [answer["drawn"] for answer in self.core]
        self.assertIn(["TB"], [list(d) for drawn in sources for d in drawn.values()])

        def nudged(drawn):
            marks = ("[style=invis];", "subgraph cluster_", '{rank=same; "')
            return any(m in s for d in drawn.values() for s in d.values() for m in marks)

        # the direction alone, the style that cannot be read, the one that names no graph, and
        # the nudges with keys their kind does not know
        self.assertEqual(sum(not nudged(drawn) for drawn in sources), 4)

    def test_render_lays_out_the_direction_set_from_the_nudged_source(self):
        # what graph_svg.render hands Graphviz: only the direction a direction nudge sets, and the
        # source with the nudges written in
        nodes = [("a", "Place", "A"), ("b", "Place", "B"), ("c", "Cafe", "C")]
        edges = [("a", "near", "b")]
        nudges = [{"word": "beside", "thing": "a", "other": "c"}]
        given = []

        def run(_args, input, **_kw):
            given.append(input)
            return mock.Mock(returncode=0, stdout=fake_dot.answer(_args))

        with (
            mock.patch.object(graph_svg, "DOT", "dot"),
            mock.patch.object(graph_svg.subprocess, "run", run),
        ):
            graph_svg.render(nodes, edges, nudges=nudges, direction="TB")
        dot = graph_svg.dot_source(nodes, edges, "TB")[0]
        self.assertEqual(given, [graph_svg.nudged_source(dot, nudges, ["a", "b", "c"])])
        self.assertIn('  {rank=same; "a"; "c";}\n}', given[0])

    def test_with_no_nudges_the_source_is_the_layout_source(self):
        # no_nudges_layout_places: nothing is added, so the layout source is drawn unchanged
        dot = graph_svg.dot_source([("a", "Place", "A")], [], "LR")[0]
        self.assertIs(graph_svg.nudged_source(dot, [], ["a"]), dot)
        self.assertEqual(graph_svg.directions(None), graph_svg.STYLE["directions"])
        self.assertEqual(graph_svg.directions("sideways"), graph_svg.STYLE["directions"])


if __name__ == "__main__":
    unittest.main()
