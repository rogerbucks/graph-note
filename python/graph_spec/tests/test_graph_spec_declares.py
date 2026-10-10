"""The Grafeo checks: a type is declared only when the graph's GraphMeta DECLARES it (§5).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

As tests/test_graph_rules_declares.py, run through the engine: typed() and untyped() on a loaded
graph.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# the library's modules are flat files in src/, importable only once it is on sys.path
import graph_spec as gs  # noqa: E402
from engine_support import needs_engine  # noqa: E402

DATA = "(a:Book {title: 'A'}),\n(p:Person {name: 'P'}),\n(p)-[:WROTE]->(a),\n"
SCHEMA = (
    "(g_schema:GraphMeta {graph: 'g', schema: 'g@1'}),\n"
    "(kind_book:Meta:ElementType {name: 'Book', kind: 'node', origin: 'source'}),\n"
    "(kind_person:Meta:ElementType {name: 'Person', kind: 'node', origin: 'source'}),\n"
    "(link_wrote:Meta:ElementType {name: 'WROTE', kind: 'edge', origin: 'source',"
    " reading: 'wrote', reverse_name: 'was written by'})"
)


def loaded(declares, extra=""):
    links = "".join(f",\n(g_schema)-[:DECLARES]->({d})" for d in declares)
    return gs.load("// graph: g\n" + DATA + SCHEMA + links + extra)


@needs_engine  # the declares rule as the engine checks it; graph_rules' twin needs none
class Declares(unittest.TestCase):
    def test_declared_by_the_graphmeta_passes(self):
        self.assertTrue(gs.typed(loaded(["kind_book", "kind_person", "link_wrote"])))

    def test_no_declares_declares_nothing(self):
        db = loaded([])
        self.assertFalse(gs.typed(db))
        self.assertEqual(list(gs.untyped(db)[:2]), [["Book", "Person"], ["WROTE"]])

    def test_only_the_undeclared_type_is_undeclared(self):
        db = loaded(["kind_book", "link_wrote"])
        self.assertFalse(gs.typed(db))
        self.assertEqual(list(gs.untyped(db)[:2]), [["Person"], []])

    def test_declares_from_anything_but_a_graphmeta_declares_nothing(self):
        db = loaded(["kind_book", "link_wrote"], ",\n(p)-[:DECLARES]->(kind_person)")
        self.assertEqual(list(gs.untyped(db)[:2]), [["Person"], []])


if __name__ == "__main__":
    unittest.main()
