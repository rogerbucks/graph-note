"""A type is declared only when the graph's GraphMeta DECLARES it (graph spec model §5).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

The same cases as packages/graph-spec/test/graph-spec-check-declares.test.mjs: the portable rules
answer as the JavaScript library does.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402

DATA = "\n".join(
    ["// graph: g", "(a:Book {title: 'A'}),", "(p:Person {name: 'P'}),", "(p)-[:WROTE]->(a)"]
)


def schema(declares, extra=""):
    return (
        "\n".join(
            [
                "// graph: g",
                "(g_schema:GraphMeta {graph: 'g', schema: 'g@1'}),",
                "(kind_book:Meta:ElementType {name: 'Book', kind: 'node', origin: 'source'}),",
                "(kind_person:Meta:ElementType {name: 'Person', kind: 'node', origin: 'source'}),",
                "(link_wrote:Meta:ElementType {name: 'WROTE', kind: 'edge', origin: 'source',"
                " reading: 'wrote', reverse_name: 'was written by'})",
                *[f", (g_schema)-[:DECLARES]->({d})" for d in declares],
            ]
        )
        + extra
    )


def world(*blocks):
    st = gp.Store()
    for b in blocks:
        st.apply(b)
    return gr.World.from_store(st)


def section5(*blocks):
    return next(ok for label, ok, _ in gr.check(world(*blocks), "g") if label.startswith("§5"))


class Declares(unittest.TestCase):
    def test_declared_by_the_graphmeta_passes(self):
        self.assertTrue(section5(DATA, schema(["kind_book", "kind_person", "link_wrote"])))

    def test_no_declares_declares_nothing(self):
        self.assertFalse(section5(DATA, schema([])))
        self.assertEqual(
            list(gr.untyped(world(DATA, schema([]))["g"])[:2]), [["Book", "Person"], ["WROTE"]]
        )

    def test_only_the_undeclared_type_is_undeclared(self):
        blocks = (DATA, schema(["kind_book", "link_wrote"]))
        self.assertFalse(section5(*blocks))
        self.assertEqual(list(gr.untyped(world(*blocks)["g"])[:2]), [["Person"], []])

    def test_declares_from_anything_but_a_graphmeta_declares_nothing(self):
        stray = schema(["kind_book", "link_wrote"], ",\n(p)-[:DECLARES]->(kind_person)")
        self.assertEqual(list(gr.untyped(world(DATA, stray)["g"])[:2]), [["Person"], []])


if __name__ == "__main__":
    unittest.main()
