"""graph_svg moves links the same way the plugin's core does, byte for byte.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

links_show_flow, flow_in_style_graph and motion_not_alone (editor spec §7): a style graph's Flow
moves links — dashes running along them, or a dot travelling along them — and every renderer
draws alike (§12). Each case of tests/flow_cases.json is a note and the view it is drawn in; the
core reads it, by Node, and gives the problems of each style, the links that move with how and
what it means, and for each graph drawn the Graphviz source of each direction laid out. The
Python library must give the same, from gql_profile.read_style and graph_svg.render(**
render_args(…)), the source it hands Graphviz.
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
from graphspec.style.flow import FLOW_ICONS, flow_source  # noqa: E402

with open(os.path.join(HERE, "flow_cases.json"), encoding="utf-8") as f:
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
  const reading = readNote(texts), styles = {}, drawn = {}, flow = {};
  for (const t of texts) {
    const g = styleOf(t);
    if (g !== null && !(g in styles)) styles[g] = readStyle(texts, g, reading).problems.map(row);
  }
  for (const [graph, drawing] of reading.graphs) {
    const { style } = readStyle(texts, graph, reading);
    const styled = styledDrawing(drawing, style, reading.world[graph], view ?? undefined);
    drawn[graph] = Object.fromEntries(directions(styled).map((d) => [d.rankdir, d.dot]));
    flow[graph] = (styled.flow ?? []).map((f) => [f.index, f.motion, f.means]);
  }
  return { styles, drawn, flow };
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
        return mock.Mock(returncode=0, stdout='<svg width="300pt" height="100pt"></svg>')

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
    styles, drawn, flow = {}, {}, {}
    for t in texts:
        g = gp.style_of(t)
        if g is not None and g not in styles:
            styles[g] = [row(p) for p in gp.read_style(texts, g, world)[1]]
    for name in (n for n in world.graphs if not n.startswith("schema ")):
        args = graph_svg.render_args(texts, name, view)
        drawn[name] = rendered(args)
        flow[name] = [[f["index"], f["motion"], f["means"]] for f in args["flow"]]
    return {"styles": styles, "drawn": drawn, "flow": flow}


class Flow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = core_answers()
        cls.python = [python_answer(texts_of(case), case.get("view")) for case in CASES]

    def test_links_move_as_the_core_moves_them(self):
        # links_show_flow, flow_in_style_graph: the same links moving, the same way, meaning the
        # same (a plain loop, never subTest: the tests-first replay counts a test by its own
        # result)
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["flow"], theirs["flow"], case["name"])

    def test_the_source_is_the_cores_byte_for_byte(self):
        # motion_not_alone: each moving link's icon, classes and dashes written into the same
        # source in each direction laid out
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["drawn"], theirs["drawn"], case["name"])

    def test_each_style_gives_the_cores_problems(self):
        # the same problems for a Flow as the core's, at the same block and line, with the same
        # words and fix: what cannot be used is left out by both
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["styles"], theirs["styles"], case["name"])

    def test_the_cases_move_what_they_say(self):
        # the table proves what it says: dashes and dots move, a backwards line moves
        # backwards, a view keeps links still, and Flows at fault are each a problem
        sources = [s for answer in self.core for d in answer["drawn"].values() for s in d.values()]
        self.assertTrue(any("thoughtknot-flow-dashes" in s for s in sources))
        self.assertTrue(any("thoughtknot-flow-dot" in s for s in sources))
        self.assertTrue(any("thoughtknot-flow-back" in s for s in sources))
        self.assertTrue(any(f'label="{FLOW_ICONS["dashes"]} ' in s for s in sources))
        self.assertTrue(any(f"<td>{FLOW_ICONS['dot']} near</td>" in s for s in sources))
        quiet = [a for case, a in zip(CASES, self.core, strict=True) if case.get("view")]
        self.assertEqual([a["flow"] for a in quiet], [{"trip": []}])
        faults = self.core[4]["styles"]["trip"]
        self.assertEqual(len(faults), 8, faults)

    def test_with_nothing_moving_the_source_is_unchanged(self):
        # flow_in_style_graph: off by default, so nothing changes unless a Flow asks
        dot = graph_svg.dot_source([("a", "Place", "A")], [("a", "near", "a")], "LR")[0]
        self.assertIs(flow_source(dot, []), dot)
        self.assertEqual(
            graph_svg.render_args(["// graph: g\n(a:Place {name: 'A'})"], "g")["flow"], []
        )


if __name__ == "__main__":
    unittest.main()
