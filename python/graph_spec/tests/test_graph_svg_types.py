"""graph_svg draws each diagram type the way the plugin's core does, byte for byte, and judges
which types fit, and why not, in the same words.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

type_both_renderers (editor spec §15): every diagram type drawn by Graphviz must have the same
layout source in the core as in graph_svg.py. Each case of tests/type_cases.json is a note and the
view it is drawn in; the core reads it, by Node, and gives the problems of each style, whether each
type fits each graph and why not, the type each graph is drawn as (and, when the chosen type has
stopped fitting, why and the nearest that fits), and for each graph the Graphviz source of each
direction laid out. The Python library must give the same, from gql_profile.read_for_drawing and
read_style, graphspec.style.diagram_types and graph_svg's sources.
"""

import contextlib
import io
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
from graphspec.style.arrows import arrowless  # noqa: E402
from graphspec.style.diagram_types import (  # noqa: E402
    diagram_for,
    directions,
    shape_of,
    type_fits,
    typed_source,
)
from graphspec.style.drawn import graph_parts, without_hidden  # noqa: E402
from graphspec.style.inline import inline_rows  # noqa: E402
from graphspec.style.words import DIAGRAM_TYPES  # noqa: E402

with open(os.path.join(HERE, "type_cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)["cases"]

# The core's answer for each note, as the plugin draws a graph (packages/obsidian/src/block.ts and
# view-block.ts). It holds:
# - the style read for it, and the type it is drawn as (types.ts, diagramFor).
# - the drawing styled for the view it is drawn in (style-source.ts, styledDrawing).
# - laid out in each direction (render.ts, directions).
# - whether each type fits it (typeFits).
CORE_SCRIPT = """
const [src, cases] = [process.argv[1], JSON.parse(process.argv[2])];
const { readNote } = await import(`${src}/drawing.ts`);
const { readStyle } = await import(`${src}/style.ts`);
const { styleOf } = await import(`${src}/blocks.ts`);
const { directions } = await import(`${src}/render.ts`);
const { styledDrawing } = await import(`${src}/style-source.ts`);
const { diagramFor, shapeOf, typeFits } = await import(`${src}/types.ts`);
const row = (p) => [p.block, p.line, p.severity, p.message, p.fix];
process.stdout.write(JSON.stringify(cases.map(([texts, view]) => {
  const reading = readNote(texts), styles = {}, drawn = {}, choice = {}, fits = {};
  for (const t of texts) {
    const g = styleOf(t);
    if (g !== null && !(g in styles)) styles[g] = readStyle(texts, g, reading).problems.map(row);
  }
  for (const [graph, drawing] of reading.graphs) {
    const { style } = readStyle(texts, graph, reading), g = reading.world[graph];
    const styled = styledDrawing(drawing, style, g, view ?? undefined);
    drawn[graph] = Object.fromEntries(directions(styled).map((d) => [d.rankdir, d.dot]));
    choice[graph] = diagramFor(drawing, style, g, view ?? undefined);
    fits[graph] = typeFits(shapeOf(drawing, g, style.nudges));
  }
  return { styles, drawn, choice, fits };
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


def python_answer(texts, view):
    """The Python library's answer for a note drawn in `view`, in the shape of the core's."""
    store, problems = gp.read_for_drawing(texts)
    world = gr.World.from_store(store)
    styles, drawn, choice, fits = {}, {}, {}, {}
    for t in texts:
        g = gp.style_of(t)
        if g is not None and g not in styles:
            styles[g] = [row(p) for p in gp.read_style(texts, g, world)[1]]
    for name in (n for n in world.graphs if not n.startswith("schema ")):
        whole = graph_parts(world, name, problems)
        style = gp.read_style(texts, name, world)[0]
        fits[name] = type_fits(shape_of(whole, style["nudges"]))
        choice[name] = diagram_for(whole, style["diagrams"], view, style["nudges"])
        plan = choice[name].get("plan")
        # a timeline leaves out the things it hides (timeline_show)
        parts = without_hidden(whole, plan)
        nodes, edges, suggested = parts["nodes"], parts["edges"], parts["suggested"]
        keys = [key for key, _, _ in nodes]
        hidden = arrowless([t for t, _ in parts["links"]], style["arrows"], view)
        shown = inline_rows(parts["boxes"], parts["links"], style["shows"], view)
        drawn[name] = {
            rd: graph_svg.nudged_source(
                graph_svg.inline_source(
                    graph_svg.arrowless_source(
                        typed_source(graph_svg.dot_source(nodes, edges, rd, suggested)[0], plan),
                        hidden,
                    ),
                    shown,
                ),
                style["nudges"],
                keys,
                plan,
            )
            for rd in directions(style["direction"], plan)
        }
    return {"styles": styles, "drawn": drawn, "choice": choice, "fits": fits}


class Types(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = core_answers()
        cls.python = [python_answer(texts_of(case), case.get("view")) for case in CASES]

    def test_each_type_is_laid_out_from_the_cores_source(self):
        # type_both_renderers: the same source in each direction, byte for byte. A plain loop,
        # never subTest. The tests-first replay counts a test by its own result.
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["drawn"], theirs["drawn"], case["name"])

    def test_each_graph_is_drawn_as_the_type_the_core_draws(self):
        # type_stops_fitting: the same type drawn, and when the chosen one has stopped fitting,
        # the same why and the same nearest type
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["choice"], theirs["choice"], case["name"])

    def test_each_type_fits_or_not_as_the_core_says_in_its_words(self):
        # type_only_when_fits, tree_fits, timeline_fits: the same answer for every type
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["fits"], theirs["fits"], case["name"])

    def test_each_style_gives_the_cores_problems(self):
        # type_remembered: a Diagram's words checked as the core checks them
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["styles"], theirs["styles"], case["name"])

    def test_the_cases_draw_every_type_graphviz_draws(self):
        # The table proves what it says:
        # - each type is drawn (the table, by the plugin's host, with no plan).
        # - one stops fitting and is drawn as a network, and a Diagram's words are checked.
        drawn = {c["drawn"]: c.get("plan") for a in self.core for c in a["choice"].values()}
        self.assertEqual(set(drawn), set(DIAGRAM_TYPES))
        self.assertIsNone(drawn["table"])
        self.assertTrue(any("stopped" in c for a in self.core for c in a["choice"].values()))
        # and the groups: drawn inside lanes, refused by lanes when of two kinds, and by radial
        plans = [c.get("plan") or {} for a in self.core for c in a["choice"].values()]
        self.assertTrue(any(p.get("groups") for p in plans))
        whys = [f.get("why", "") for a in self.core for fs in a["fits"].values() for f in fs]
        self.assertTrue(any("holds things of two kinds" in w for w in whys))
        self.assertTrue(any("cannot draw the box of group" in w for w in whys))
        self.assertTrue(any(p for a in self.core for ps in a["styles"].values() for p in ps))

    def test_render_lays_out_the_typed_source_in_the_types_direction(self):
        # what graph_svg.render hands Graphviz for a tree: the typed source, down only
        nodes = [("a", "Place", "A"), ("b", "Place", "B")]
        edges = [("a", "near", "b")]
        plan = {"type": "tree", "tree": [0]}
        given = []

        def run(_args, input, **_kw):
            given.append(input)
            return mock.Mock(returncode=0, stdout=fake_dot.answer(_args))

        with (
            mock.patch.object(graph_svg, "DOT", "dot"),
            mock.patch.object(graph_svg.subprocess, "run", run),
        ):
            graph_svg.render(nodes, edges, diagram=plan)
        self.assertEqual(given, [typed_source(graph_svg.dot_source(nodes, edges, "TB")[0], plan)])
        self.assertEqual(graph_svg.directions(None, plan), ["TB"])
        self.assertEqual(graph_svg.directions("LR", plan), ["LR"])

    def test_a_table_chosen_is_drawn_as_a_network_and_said_on_stderr(self):
        # the table is the plugin's own: graph_svg draws a network in its place, and says so,
        # never quietly
        data = "// graph: trip\n(a:Place {name: 'A'}),\n(b:Place {name: 'B'}),\n(a)-[:NEAR]->(b)"
        chosen = "// graph: trip_style · STYLE trip\n(d1:Diagram {type: '%s'})"
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            args = graph_svg.render_args([data, chosen % "table"], "trip")
        self.assertIsNone(args["diagram"])
        self.assertEqual(
            err.getvalue(),
            "graph_svg: graph trip is chosen to be drawn as a table, which only the plugin "
            "draws; it is drawn here as a network\n",
        )
        quiet = io.StringIO()
        with contextlib.redirect_stderr(quiet):
            graph_svg.render_args([data, chosen % "flow"], "trip")
            graph_svg.render_args([data], "trip")
        self.assertEqual(quiet.getvalue(), "")

    def test_with_no_type_the_source_is_the_layout_source(self):
        # suggest_type: nothing is drawn as a type unless chosen
        dot = graph_svg.dot_source([("a", "Place", "A")], [("a", "near", "a")], "LR")[0]
        self.assertIs(typed_source(dot, None), dot)
        self.assertEqual(directions(None, None), list(graph_svg.STYLE["directions"]))


if __name__ == "__main__":
    unittest.main()
