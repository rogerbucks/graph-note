"""to_gql: a data block written as standard GQL (§3), every line and comment kept.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests/test_to_gql.py

Reported by the vault on 10 Oct 2026: a requirements block that writes id: on every node, given
one new node without it (a §25 Deferred, written as the spec writes them), lost its comments and
its layout, so the data shortcut's round-trip check failed. A new node with no id: is given its
name as its id where it is written, and a name for an existing node adds one MATCH line; nothing
else in the block moves.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# the library's modules are flat files in src/, importable only once it is on sys.path
import gql_profile as gp  # noqa: E402
import graph_spec as gs  # noqa: E402
from graphspec.engine.optional_imports import grafeo  # noqa: E402
from graphspec.reader import to_gql as to_gql_module  # noqa: E402
from engine_support import needs_engine  # noqa: E402


def lines(*rows):
    return "\n".join(rows)


# (what the case is, the block, the block as to_gql must write it)
CASES = [
    (
        "a Deferred with no id: among nodes that have one",
        lines(
            "// graph: requirements",
            "// ── Requirements ──",
            "(a:Requirement {id: 'a', rule: 'x'}),",
            "// ── Parked ──",
            "(d1:Deferred {what: 'y', why: 'z', revisit_by: DATE '2026-12-01'}),",
            "(d1)-[:DEFERS]->(a)",
        ),
        lines(
            "// graph: requirements",
            "// ── Requirements ──",
            "INSERT",
            "(a:Requirement {id: 'a', rule: 'x'}),",
            "// ── Parked ──",
            "(d1:Deferred {id: 'd1', what: 'y', why: 'z', revisit_by: DATE '2026-12-01'}),",
            "(d1)-[:DEFERS]->(a)",
        ),
    ),
    (
        "any kind, with no properties, or with empty braces, inside a path",
        lines(
            "// graph: g",
            "(a:Thing {id: 'a'}),",
            "  // kept, as is the indent below",
            "  (b:Thing)-[:NEXT]->(c:Other:Thing {}),",
            "(c)-[:NEXT {w: 1}]->(a)",
        ),
        lines(
            "// graph: g",
            "INSERT",
            "(a:Thing {id: 'a'}),",
            "  // kept, as is the indent below",
            "  (b:Thing {id: 'b'})-[:NEXT]->(c:Other:Thing {id: 'c'}),",
            "(c)-[:NEXT {w: 1}]->(a)",
        ),
    ),
    (
        "a name in a comment or a string is not taken for the node",
        lines(
            "// graph: g",
            "// (d:Deferred {what: 'a comment'})",
            "(n:Note {id: 'n', text: '(d:Deferred {x: 1})'}),",
            "(d:Deferred {what: 'w'})",
        ),
        lines(
            "// graph: g",
            "// (d:Deferred {what: 'a comment'})",
            "INSERT",
            "(n:Note {id: 'n', text: '(d:Deferred {x: 1})'}),",
            "(d:Deferred {id: 'd', what: 'w'})",
        ),
    ),
    (
        "a node whose pattern runs over several lines",
        lines(
            "// graph: g",
            "(c:T {",
            "  x: 1",
            "}),",
            "(e:T",
            "  )",
        ),
        lines(
            "// graph: g",
            "INSERT",
            "(c:T {id: 'c',",
            "  x: 1",
            "}),",
            "(e:T {id: 'e'}",
            "  )",
        ),
    ),
]

# a block written before the ones below, whose nodes they name
EARLIER = lines("// graph: g", "(a:Thing {id: 'a'}),", "(b:Thing {id: 'b'})")

# (what the case is, a block naming nodes of EARLIER, the block as to_gql must write it)
NAMING = [
    (
        "a later block parking a node written earlier",
        lines(
            "// graph: g",
            "// parked, with its reason",
            "(d1:Deferred {what: 'y'}),",
            "  // the requirement it parks",
            "  (d1)-[:DEFERS]->(a)",
        ),
        lines(
            "// graph: g",
            "// parked, with its reason",
            "MATCH (a {id: 'a'})",
            "INSERT",
            "(d1:Deferred {id: 'd1', what: 'y'}),",
            "  // the requirement it parks",
            "  (d1)-[:DEFERS]->(a)",
        ),
    ),
    (
        "a block with a MATCH of its own",
        lines(
            "// graph: g",
            "MATCH (b:Thing {id: 'b'})",
            "// kept",
            "INSERT (b)-[:NEXT]->(a)",
        ),
        lines(
            "// graph: g",
            "MATCH (a {id: 'a'})",
            "MATCH (b:Thing {id: 'b'})",
            "// kept",
            "INSERT (b)-[:NEXT]->(a)",
        ),
    ),
    (
        "several names for existing nodes at once, in text order",
        lines(
            "// graph: g",
            "(c:Thing)-[:NEXT]->(b),",
            "(b)-[:NEXT]->(a)",
        ),
        lines(
            "// graph: g",
            "MATCH (b {id: 'b'}), (a {id: 'a'})",
            "INSERT",
            "(c:Thing {id: 'c'})-[:NEXT]->(b),",
            "(b)-[:NEXT]->(a)",
        ),
    ),
    (
        "a name in a path together with a name in a SET",
        lines(
            "// graph: g",
            "(c:Thing)-[:NEXT]->(a)",
            "SET b.status = 'open'",
        ),
        lines(
            "// graph: g",
            "MATCH (a {id: 'a'}), (b {id: 'b'})",
            "INSERT",
            "(c:Thing {id: 'c'})-[:NEXT]->(a)",
            "SET b.status = 'open'",
        ),
    ),
    (
        "a SET alone",
        lines(
            "// graph: g",
            "SET a.status = 'done',",
            "// and the other",
            "b.status = 'open'",
        ),
        lines(
            "// graph: g",
            "MATCH (a {id: 'a'}), (b {id: 'b'})",
            "SET a.status = 'done',",
            "// and the other",
            "b.status = 'open'",
        ),
    ),
]


class ToGqlKeepsTheBlock(unittest.TestCase):
    def test_a_node_given_its_id_keeps_every_line_and_comment(self):
        for what, block, want in CASES:
            self.assertEqual(gp.to_gql(block), want, what)
            # and what is written reads as the same graph
            short, full = gp.Store(), gp.Store()
            short.apply(block)
            full.apply(gp.to_gql(block))
            self.assertEqual(full.graphs, short.graphs, what)

    @needs_engine
    def test_a_name_for_an_existing_node_adds_one_match_line_and_keeps_the_rest(self):
        for what, block, want in NAMING:
            self.assertEqual(gp.to_gql(block), want, what)
            # and Grafeo, given it after EARLIER, builds the graph the reader does: a second MATCH
            # line reads as one MATCH
            st = gp.Store()
            st.apply(EARLIER)
            st.apply(block)
            db = grafeo.GrafeoDB()
            db.execute("CREATE GRAPH g")
            db.set_graph("g")
            db.execute(gs.strip(EARLIER))
            db.execute(gs.strip(block))
            self.assertEqual(gs.canon_graph(db, "g"), gp.canon(st, "g"), what)


class ToGqlRefusesWhatTheReaderRefuses(unittest.TestCase):
    """A block the reader rejects is never given to an engine with an id written twice: to_gql
    raises the ProfileError the reader raises, as it does for a bare relationship type."""

    def refused(self, block, message, what):
        with self.assertRaises(gp.ProfileError, msg=what) as got:
            gp.to_gql(block)
        self.assertIn(message, str(got.exception), what)
        # the reader rejects the same block for the same reason
        with self.assertRaises(gp.ProfileError, msg=what) as read:
            gp.Store().apply(block)
        self.assertIn(message, str(read.exception), what)

    def test_a_variable_written_for_two_nodes_is_refused(self):
        for what, block in [
            ("two nodes on two lines", lines("// graph: g", "(x:T {n:1}),", "(x:T {m:2})")),
            ("two nodes in one path", lines("// graph: g", "(x:T {n:1})-[:R]->(x:T {n:2})")),
        ]:
            self.refused(block, "x is written twice", what)

    def test_an_id_given_to_two_nodes_is_refused(self):
        """req:3.id-once (§3, id used once): to_gql raises the reader's ProfileError and never
        writes the duplicate id."""
        for what, block in [
            (
                "a given id, then a name",
                lines("// graph: g", "(x:T {id:'y'}),", "(y:T {n:1})"),
            ),
            (
                "a name, then a given id",
                lines("// graph: g", "(y:T {n:1}),", "(x:T {id:'y'})"),
            ),
            (
                "the same id given twice",
                lines("// graph: g", "(x:T {id:'y'}),", "(z:T {id:'y'})"),
            ),
        ]:
            self.refused(block, "id 'y' is already a node", what)

    def test_a_node_written_where_it_cannot_be_found_is_said_not_hidden(self):
        # the parser read a node the text search cannot find: a fault here, never in the block
        with self.assertRaises(gp.ProfileError) as got:
            to_gql_module._with_ids(lines("// graph: g", "(y)"), [{"var": "x", "line": 2}])
        self.assertIn("cannot find where x is written", str(got.exception))


if __name__ == "__main__":
    unittest.main()
