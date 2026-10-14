"""The Python library reads the legend's choices a view was saved with as the plugin's core does.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

untangle_legend (editor spec §25): the legend's choices — the kinds and relationship types brought
forward or hidden — are written to the style graph as a Shown's `legend` when the user saves a view
as shown, and both libraries read them alike (§12); only the plugin applies them. Each case of
tests/legend_cases.json is a note and the view whose Shown is read; the core reads it, by Node, and
gives the problems of each style, and for each graph drawn the choices read for the view and what
they bring forward and hide in the drawing. The Python library must give the same, from
gql_profile.read_style and graphspec.style.legend.legend_layers over the parts graph_svg draws.
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
from graphspec.style.drawn import graph_parts  # noqa: E402
from graphspec.style.legend import legend_layers, legend_text  # noqa: E402

with open(os.path.join(HERE, "legend_cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)["cases"]

# The core's answer for each note: as the plugin reads a view saved as shown (view-block.ts), the
# style read for each graph, the view's legend restored into the core's LegendFilter, and what it
# brings forward and hides in the drawing (untangle.ts, apply).
CORE_SCRIPT = """
const [src, cases] = [process.argv[1], JSON.parse(process.argv[2])];
const { readNote } = await import(`${src}/drawing.ts`);
const { readStyle } = await import(`${src}/style.ts`);
const { styleOf } = await import(`${src}/blocks.ts`);
const { edgesOf } = await import(`${src}/focus.ts`);
const { LegendFilter } = await import(`${src}/untangle.ts`);
const row = (p) => [p.block, p.line, p.severity, p.message, p.fix];
const kept = (k) => ({ things: [...k.things].sort(), edges: [...k.edges].sort((a, b) => a - b) });
process.stdout.write(JSON.stringify(cases.map(([texts, view]) => {
  const reading = readNote(texts), styles = {}, legend = {};
  for (const t of texts) {
    const g = styleOf(t);
    if (g !== null && !(g in styles)) styles[g] = readStyle(texts, g, reading).problems.map(row);
  }
  for (const [graph, drawing] of reading.graphs) {
    const choices = readStyle(texts, graph, reading).style.shown.get(view)?.legend ?? null;
    const filter = new LegendFilter();
    filter.restore(choices ?? []);
    const { forward, hidden } = filter.apply(drawing, edgesOf(drawing));
    const layers = { forward: forward && kept(forward), hidden: kept(hidden) };
    legend[graph] = { choices, layers };
  }
  return { styles, legend };
})));
"""


def texts_of(case):
    """A case's blocks as the note's texts."""
    return ["\n".join(lines) for lines in case["blocks"]]


def core_answers():
    """The core's answer for every case, by Node."""
    cases = json.dumps([[texts_of(case), case["view"]] for case in CASES])
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
    """The Python library's answer for a note and the view whose Shown is read, in the shape of
    the core's."""
    store, problems = gp.read_for_drawing(texts)
    world = gr.World.from_store(store)
    styles, legend = {}, {}
    for t in texts:
        g = gp.style_of(t)
        if g is not None and g not in styles:
            styles[g] = [row(p) for p in gp.read_style(texts, g, world)[1]]
    for name in (n for n in world.graphs if not n.startswith("schema ")):
        shown = gp.read_style(texts, name, world)[0]["shown"].get(view) or {}
        choices = shown.get("legend")
        parts = graph_parts(world, name, problems)
        links = [
            (s, t, d) for (s, _, d), (t, _) in zip(parts["edges"], parts["links"], strict=True)
        ]
        layers = legend_layers(parts["nodes"], links, choices or [])
        legend[name] = {"choices": choices, "layers": layers}
    return {"styles": styles, "legend": legend}


class Legend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = core_answers()
        cls.python = [python_answer(texts_of(case), case["view"]) for case in CASES]

    def test_each_style_gives_the_cores_problems(self):
        # untangle_legend: the same problems for a Shown's legend as the core's, at the same block
        # and line, with the same words and fix (a plain loop, never subTest: the tests-first
        # replay counts a test by its own result)
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            self.assertEqual(ours["styles"], theirs["styles"], case["name"])

    def test_the_view_reads_the_same_choices(self):
        # the choices kept, in the order written, and none where no legend is written
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            mine = {g: v["choices"] for g, v in ours["legend"].items()}
            core = {g: v["choices"] for g, v in theirs["legend"].items()}
            self.assertEqual(mine, core, case["name"])

    def test_the_choices_bring_forward_and_hide_the_same(self):
        # what is brought forward, the rest faded, and what is hidden: the same things and links
        for case, ours, theirs in zip(CASES, self.python, self.core, strict=True):
            mine = {g: v["layers"] for g, v in ours["legend"].items()}
            core = {g: v["layers"] for g, v in theirs["legend"].items()}
            self.assertEqual(mine, core, case["name"])

    def test_the_text_saved_reads_back_as_the_choices(self):
        # the text the core's styleEdit writes, 'kind:Person forward, type:NEAR hidden', read back
        choices = [
            {"id": "kind:Place", "state": "hidden"},
            {"id": "type:NEAR", "state": "forward"},
        ]
        texts = [
            "// graph: g\n(a:Place {name: 'A'}),\n(b:Place {name: 'B'}),\n(a)-[:NEAR]->(b)",
            "// graph: g_style · STYLE g\n"
            f"(s1:Shown {{view: 'v', legend: '{legend_text(choices)}'}})",
        ]
        store, _ = gp.read_for_drawing(texts)
        style, problems = gp.read_style(texts, "g", gr.World.from_store(store))
        self.assertEqual(problems, [])
        self.assertEqual(style["shown"]["v"]["legend"], choices)


if __name__ == "__main__":
    unittest.main()
