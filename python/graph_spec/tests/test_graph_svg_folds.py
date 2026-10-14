"""graph_svg folds, merges and routes a graph the way the plugin's core does, byte for byte, and
reads the style graph's Links in the same words.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

untangle_hubs, untangle_groups, untangle_merge, untangle_routing (editor spec §25): a busy hub's
links folded into one stub, a group folded into one box, the links between two groups merged into
a trunk and the links routed straight or at right angles are drawn the same by both renderers.
Each case of tests/fold_cases.json is a note, the view it is drawn in, the switches turned and the
folds opened again; the core reads it, by Node, and gives the problems of each style and, for each
graph, the Graphviz source of each direction laid out, folded by a card's View menu state
(view-switches.ts, ViewState) started from the plugin's default settings (view_switch_defaults).
The Python library must give the same, from graph_svg.render_args and graph_svg.drawn_source.
"""

import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CORE = os.path.join(ROOT, "packages", "core", "src")
sys.path.insert(0, os.path.join(HERE, "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
import graph_svg  # noqa: E402
from graphspec.style.folding import BUSY_HUB  # noqa: E402

with open(os.path.join(HERE, "fold_cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)["cases"]

# The core's answer for each note: as the plugin draws a graph or a view (block.ts, view-block.ts),
# its style read, the drawing styled for its view (styledDrawing), folded by a card's state of the
# View menu started from the default settings and turned as the case says (ViewState), and laid out
# in each direction (render.ts, directions).
CORE_SCRIPT = """
const [src, cases] = [process.argv[1], JSON.parse(process.argv[2])];
const { readNote } = await import(`${src}/drawing.ts`);
const { readStyle } = await import(`${src}/style.ts`);
const { styleOf } = await import(`${src}/blocks.ts`);
const { directions } = await import(`${src}/render.ts`);
const { styledDrawing } = await import(`${src}/style-source.ts`);
const { DEFAULT_SETTINGS } = await import(`${src}/settings.ts`);
const { ViewState, startingSwitches } = await import(`${src}/view-switches.ts`);
const row = (p) => [p.block, p.line, p.severity, p.message, p.fix];
process.stdout.write(JSON.stringify(cases.map(([texts, view, switches, opened]) => {
  const reading = readNote(texts), styles = {}, drawn = {};
  for (const t of texts) {
    const g = styleOf(t);
    if (g !== null && !(g in styles)) styles[g] = readStyle(texts, g, reading).problems.map(row);
  }
  for (const [graph, drawing] of reading.graphs) {
    const { style } = readStyle(texts, graph, reading);
    const styled = styledDrawing(drawing, style, reading.world[graph], view ?? undefined);
    const state = new ViewState(startingSwitches(DEFAULT_SETTINGS, style, view ?? undefined));
    for (const [s, on] of Object.entries(switches ?? {})) state.turn(s, on);
    for (const hub of opened?.hubs ?? []) state.open({ hub });
    for (const group of opened?.groups ?? []) state.open({ group });
    const laid = directions(state.folded(styled));
    drawn[graph] = Object.fromEntries(laid.map((d) => [d.rankdir, d.dot]));
  }
  return { styles, drawn };
})));
"""


def texts_of(case):
    """A case's blocks as the note's texts."""
    return ["\n".join(lines) for lines in case["blocks"]]


def core_answers():
    """The core's answer for every case, by Node."""
    cases = json.dumps(
        [[texts_of(c), c.get("view"), c.get("switches"), c.get("opened")] for c in CASES]
    )
    out = subprocess.run(
        ["node", "--input-type=module", "-e", CORE_SCRIPT, CORE, cases],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


def row(p):
    return [p["block"], p["line"], p["severity"], p["message"], p["fix"]]


def python_answer(texts, view, switches, opened):
    """The Python library's answer for a note drawn in `view`, switched and opened so, in the
    shape of the core's."""
    store, _problems = gp.read_for_drawing(texts)
    world = gr.World.from_store(store)
    styles, drawn = {}, {}
    for t in texts:
        g = gp.style_of(t)
        if g is not None and g not in styles:
            styles[g] = [row(p) for p in gp.read_style(texts, g, world)[1]]
    for name in (n for n in world.graphs if not n.startswith("schema ")):
        args = graph_svg.render_args(texts, name, view, switches, opened)
        drawn[name] = {
            rd: graph_svg.drawn_source(
                args["nodes"],
                args["edges"],
                rd,
                suggested=args["suggested"],
                nudges=args["nudges"],
                arrowless=args["arrowless"],
                inline=args["inline"],
                plan=args["diagram"],
                flow=args["flow"],
                folding=args["folding"],
                routing=args["routing"],
            )[0]
            for rd in graph_svg.directions(args["direction"], args["diagram"])
        }
    return {"styles": styles, "drawn": drawn}


class Folds(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = core_answers()
        cls.python = [
            python_answer(texts_of(c), c.get("view"), c.get("switches"), c.get("opened"))
            for c in CASES
        ]

    def test_each_graph_is_folded_merged_and_routed_from_the_cores_source(self):
        # untangle_hubs, untangle_groups, untangle_merge, untangle_routing: the same source in
        # each direction, byte for byte (a plain loop, never subTest: the tests-first replay
        # counts a test by its own result)
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["drawn"], theirs["drawn"], case["name"])

    def test_each_style_gives_the_cores_problems_for_its_links(self):
        # untangle_routing, untangle_merge: a Links's words checked as the core checks them
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["styles"], theirs["styles"], case["name"])

    def test_the_cases_draw_every_fold_merge_and_routing(self):
        # the table proves what it says: a stub, a box, a trunk with a link drawn from its far end
        # and one with its arrowhead hidden, straight and right-angled links, and Links problems
        sources = [s for a in self.core for d in a["drawn"].values() for s in d.values()]
        for mark in (
            'id="fold_hub_1"',
            'id="fold_group_1"',
            'id="trunk_1"',
            '_tail", color=',
            "dir=back];",
            "splines=line",
            "splines=ortho",
            "xlabel=",
        ):
            self.assertTrue(any(mark in s for s in sources), mark)
        self.assertTrue(any("dir=back" in s and "_tail" in s for s in sources))
        problems = [p for a in self.core for ps in a["styles"].values() for p in ps]
        self.assertTrue(any("is not a routing" in p[3] for p in problems))
        self.assertTrue(any("merging links" in p[3] for p in problems))

    def test_a_busy_hub_has_more_links_than_the_cores_number(self):
        self.assertEqual(BUSY_HUB, 12)

    def test_render_draws_the_folded_routed_source(self):
        # what graph_svg.render hands Graphviz is drawn_source's, for each direction
        texts = texts_of(CASES[0])
        args = graph_svg.render_args(texts, "kit")
        self.assertEqual(args["folding"]["hubs"], [["box", 14]])
        self.assertIsNone(graph_svg.render_args(texts, "kit", None, {"hubs": False})["folding"])
        self.assertIsNone(args["routing"])


if __name__ == "__main__":
    unittest.main()
