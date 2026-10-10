"""req:14.no-engine-install — "A plain install of a library must read, check, join and fill hashes
with no engine installed". The engine, Grafeo, is an optional extra for database work only —
queries, path search, storing a graph to query later — and a call that needs it, made without it,
says so and names the extra, never a bare missing-module error.

Each test runs a fresh interpreter in which Grafeo cannot be imported, as a plain install has it.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_optional_imports
"""

import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")

DOCUMENT = (
    "```gql\n// graph: g · document doc:a · schema s1 · as of 2026-10-01\n"
    "(a:T {name: 'A', note: 'C:\\\\data'}),\n(b:T {name: 'B'}),\n(a)-[:KNOWS]->(b)\n```\n"
)


def without_grafeo(code, *args):
    """Runs code in a fresh interpreter in which importing Grafeo fails, as in a plain install."""
    prelude = f"import sys\nsys.modules['grafeo'] = None\nsys.path.insert(0, {SRC!r})\n"
    return subprocess.run(
        [sys.executable, "-c", prelude + code, *args], capture_output=True, text=True
    )


class NoEngineInstalled(unittest.TestCase):
    def test_a_plain_install_reads_checks_joins_and_draws(self):
        code = """
import graph_spec as gs, graph_rules as gr, gql_profile as gp, graph_svg as svg
doc = gs.parse(sys.argv[1])                                     # read
st = gp.Store(); st.apply(gs.gql_block(sys.argv[1]))
w = gr.World.from_store(st)
verdicts = [ok for _, ok, _ in gr.check(w, 'g', {})]            # check
cfg = gs.config_from({})
joined = gs.join([gs.normalise(doc, [], cfg)], cfg, [])          # join
G = w['g']
drawn = svg.dot_source(                                          # draw
    [(i, sorted(ls)[0], p.get('name', i)) for i, (ls, p) in G.nodes.items()],
    [(s, t, d) for s, t, d, _ in G.edges],
    'LR',
)[0]
print(sorted(doc['nodes']), len(verdicts) > 1, sorted(joined['nodes']), 'KNOWS' in drawn)
"""
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "note.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write(DOCUMENT)
            r = without_grafeo(code, path)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip(), "['a', 'b'] True ['a', 'b'] True")

    def test_a_call_that_needs_the_engine_says_so_and_names_the_extra(self):
        code = """
import graph_spec as gs
try:
    gs.load("// graph: joined\\n(a:T {name: 'A'})")
except ImportError as e:
    print(type(e).__name__, '|', e)
"""
        r = without_grafeo(code)
        self.assertEqual(r.returncode, 0, r.stderr)
        kind, _, said = r.stdout.strip().partition(" | ")
        self.assertEqual(kind, "ModuleNotFoundError")
        self.assertIn("needs the engine, Grafeo", said)
        self.assertIn("graph-spec[grafeo]", said)


if __name__ == "__main__":
    unittest.main()
