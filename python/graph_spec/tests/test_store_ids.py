"""A node's id in the reader (graph spec §3, decided with Roger, 10 Oct 2026): SET never changes a
node's id (req:3.set-keeps-id), and a node's id is always text (req:3.id-is-text). The JavaScript
reader answers the same: packages/graph-spec/test/store-ids.test.mjs, and tests/test_parity.py
holds the two together live.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_store_ids
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.reader.lexer import ProfileError  # noqa: E402
from graphspec.reader.store import Store  # noqa: E402
from graphspec.reader.syntax_check import check_syntax  # noqa: E402

TWO = "// graph: g\n(a:T {id: 'a'}),\n(b:T {id: 'b'})"
SET_ID = "SET would change b's id, and a node's id never changes (§3)"

# SET b.id to an id another node has, to a fresh id, to the node's own id, and to a number
SETS = ["SET b.id = 'a'", "SET b.id = 'c'", "SET b.id = 'b'", "SET b.id = 1"]

# a non-text id as written, and the quoted id the fix gives
FORMS = [
    ("1", "'1'"),
    ("1.0", "'1.0'"),
    ("-2", "'-2'"),
    ("1e3", "'1e3'"),
    ("TRUE", "'TRUE'"),
    ("false", "'false'"),
    ("DATE '2026-10-01'", "'2026-10-01'"),
    ("DATETIME '2026-10-01T09:00:00+01:00'", "'2026-10-01T09:00:00+01:00'"),
]


def refusal(*blocks):
    """The refusal a store gives the blocks, applied in order, as (line, message, fix); None when
    all are read."""
    store = Store()
    try:
        for b in blocks:
            store.apply(b)
    except ProfileError as e:
        return (e.line, e.message, e.fix)
    return None


def props(store):
    """Each node's properties in graph g, in the order written."""
    return [n["props"] for n in store.graph("g")["nodes"].values()]


class SetKeepsId(unittest.TestCase):
    def test_a_set_of_id_in_the_same_block_is_refused_whatever_the_value(self):
        # req:3.set-keeps-id: refused with the fix, in the reader's usual wording
        for s in SETS:
            self.assertEqual(
                refusal(f"{TWO}\n{s}"),
                (4, SET_ID, "write the right node, then link b to it or supersede it (§12)"),
                s,
            )

    def test_a_set_of_id_in_a_later_block_is_refused_whatever_the_value(self):
        # req:3.set-keeps-id
        for s in SETS:
            r = refusal(TWO, f"// graph: g\n{s}")
            self.assertIsNotNone(r, s)
            self.assertEqual(r[:2], (2, SET_ID), s)

    def test_a_set_of_id_on_a_node_found_by_match_or_after_another_set_is_refused(self):
        # req:3.set-keeps-id: at the line of the SET of id
        self.assertEqual(refusal(TWO, "// graph: g\nMATCH (x:T {id: 'b'})\nSET x.id = 'c'")[0], 3)
        self.assertEqual(
            refusal(TWO, "// graph: g\nSET a.name = 'A',\n  b.id = 'c'")[:2], (3, SET_ID)
        )

    def test_a_refused_set_of_id_leaves_the_store_as_it_was(self):
        # req:3.set-keeps-id
        store = Store()
        store.apply(TWO)
        with self.assertRaises(ProfileError):
            store.apply("// graph: g\nSET a.name = 'A', b.id = 'a'")
        self.assertEqual(props(store), [{"id": "a"}, {"id": "b"}])

    def test_the_syntax_check_refuses_a_set_of_id_as_the_store_does(self):
        # req:3.set-keeps-id
        e = check_syntax("// graph: g\nSET b.id = 'c'")
        self.assertIsInstance(e, ProfileError)
        self.assertEqual((e.line, e.message), (2, SET_ID))

    def test_a_set_of_any_other_key_is_still_read_in_the_same_block_and_a_later_one(self):
        # req:3.set-keeps-id: only id is kept
        store = Store()
        store.apply(f"{TWO}\nSET b.name = 'Bee'")
        store.apply("// graph: g\nSET a.name = 'Ay', b.size = 2")
        self.assertEqual(
            props(store), [{"id": "a", "name": "Ay"}, {"id": "b", "name": "Bee", "size": 2}]
        )


class IdIsText(unittest.TestCase):
    def test_each_non_text_id_written_in_insert_is_refused_with_the_fix_that_quotes_it(self):
        # req:3.id-is-text
        for written, quoted in FORMS:
            self.assertEqual(
                refusal(f"// graph: g\nINSERT (a:T {{name: 'A'}}),\n(b:T {{id: {written}}})"),
                (
                    3,
                    f"id {written} is not text",
                    f"write id: {quoted} — a node's id is always text (§3)",
                ),
                written,
            )

    def test_each_non_text_id_in_the_data_shortcut_or_in_match_is_refused_at_its_line(self):
        # req:3.id-is-text
        for written, quoted in FORMS:
            r = refusal(f"// graph: g\n(b:T {{id: {written}}})")
            self.assertEqual(r[:2], (2, f"id {written} is not text"), written)
            r = refusal(TWO, f"// graph: g\nMATCH (x:T {{id: {written}}})\nINSERT (c:T)")
            self.assertEqual(
                r,
                (
                    2,
                    f"id {written} is not text",
                    f"write id: {quoted} — a node's id is always text (§3)",
                ),
                written,
            )

    def test_the_refusal_names_the_line_the_id_is_on_in_a_map_over_several_lines(self):
        # req:3.id-is-text
        self.assertEqual(refusal("// graph: g\n(b:T {name: 'B',\n  size: 2,\n  id: 7})")[0], 4)

    def test_the_syntax_check_refuses_a_non_text_id_as_the_store_does(self):
        # req:3.id-is-text
        e = check_syntax("// graph: g\n(b:T {id: 1})")
        self.assertIsInstance(e, ProfileError)
        self.assertEqual((e.line, e.message), (2, "id 1 is not text"))

    def test_a_missing_comma_hides_neither_id_refusal(self):
        # req:3.id-is-text and req:3.set-keeps-id: the missing comma's retry keeps the refusal it
        # meets, so neither is given as "unexpected '('" (review of #49)
        fix = "write id: '1' — a node's id is always text (§3)"
        self.assertEqual(
            refusal("// graph: g\n(a:T {id: 'a'})\n(b:T {id: 1})"), (3, "id 1 is not text", fix)
        )
        self.assertEqual(
            refusal("// graph: g\n(a:T {id: 'a'})\n(b:T {name: 'B'})-[:R]->(c:T {id: TRUE})")[:2],
            (3, "id TRUE is not text"),
        )
        e = check_syntax("// graph: g\n(a:T {id: 'a'})\n(b:T {id: 1})")
        self.assertEqual((e.line, e.message, e.fix), (3, "id 1 is not text", fix))
        self.assertEqual(
            refusal("// graph: g\n(a:T {id: 'a'})\n(b:T {id: 'b'})\nSET b.id = 'c'")[:2],
            (4, SET_ID),
        )

    def test_a_text_id_is_read_and_a_number_among_the_other_properties_too(self):
        # req:3.id-is-text
        store = Store()
        store.apply("// graph: g\n(b:T {id: '1', size: 1, done: TRUE})")
        store.apply("// graph: g\nMATCH (x:T {id: '1'})\nINSERT (c:T {id: '2'})")
        self.assertEqual(props(store), [{"id": "1", "size": 1, "done": True}, {"id": "2"}])


if __name__ == "__main__":
    unittest.main()
