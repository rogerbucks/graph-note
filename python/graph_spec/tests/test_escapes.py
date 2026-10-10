"""req:3.gql-escapes (graph spec §3, decided by Roger, 11 Oct 2026): a backslash in quoted text is
read as ISO GQL reads it, and an escape GQL does not name is refused, with the fix that doubles the
backslash. The cases are one table, packages/graph-spec/test/escape-cases.json, which the
JavaScript reader answers too: packages/graph-spec/test/escapes.test.mjs.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_escapes
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.reader import lexer  # noqa: E402
from graphspec.reader.lexer import ProfileError  # noqa: E402
from graphspec.reader.store import Store  # noqa: E402

TABLE = os.path.join(HERE, "..", "..", "..", "packages", "graph-spec", "test", "escape-cases.json")
with open(TABLE, encoding="utf-8") as f:
    CASES = json.load(f)

PREFIX = "(a:T {id: 'a', v: '"


def read(written):
    """The text read for v, or the refusal as [line, message, fix, at]."""
    st = Store()
    try:
        st.apply(f"// graph: g\n{PREFIX}{written}'}})")
    except ProfileError as e:
        return [e.line, e.message, e.fix, e.at]
    return next(iter(st.graph("g")["nodes"].values()))["props"]["v"]


class Escapes(unittest.TestCase):
    # a plain loop, never subTest: the tests-first replay counts a test by its own result

    def test_every_escape_gql_names_is_read_as_gql_reads_it(self):
        for written, text in CASES["read"]:
            self.assertEqual(read(written), text, written)

    def test_an_escape_gql_does_not_name_is_refused_at_its_backslash_with_the_fix(self):
        for written, at, shown in CASES["refused"]:
            self.assertEqual(
                read(written),
                [
                    2,
                    f"'{shown}' is not an escape GQL names",
                    f"double the backslash to write a backslash: \\{shown}",
                    len(PREFIX) + at,
                ],
                written,
            )

    def test_a_writer_quotes_a_text_so_that_it_reads_back_on_one_line_as_itself(self):
        for text, quoted in CASES["quoted"]:
            self.assertEqual(lexer.quote(text), quoted, text)
            self.assertEqual(read(quoted[1:-1]), text, text)


TEXT = "C:\\data, a tab\there, two lines\nand a quote's end"


class EngineWritesEscapes(unittest.TestCase):
    """What the engine writes for Grafeo quotes a text as the reader writes it, so the text reads
    back as itself — through the reader first, then Grafeo."""

    def test_a_joined_graph_keeps_a_texts_backslash_and_line_breaks(self):
        import graph_spec as gs

        join = {
            "nodes": {"n": {"labels": {"Note"}, "props": {"id": "n", "title": TEXT}}},
            "edges": {},
            "claims": {},
            "pairs": [],
            "paradoxes": [],
            "findings": [],
            "esrc": {},
        }
        join["nodes"]["n"]["stated_in"] = []
        db = gs.load(gs.emit(join, [], gs.config()))
        got = gs.Q(db, "MATCH (n:Note) RETURN n.title AS t")
        self.assertEqual([r["t"] for r in got], [TEXT])

    def test_a_rule_reads_a_texts_backslash_and_line_breaks_as_written(self):
        import graph_spec as gs

        db = gs.structs_to_db({"n": {"labels": {"T"}, "props": {"id": "n", "v": TEXT}}}, {})
        self.assertEqual([r["v"] for r in gs.Q(db, "MATCH (n:T) RETURN n.v AS v")], [TEXT])


if __name__ == "__main__":
    unittest.main()
