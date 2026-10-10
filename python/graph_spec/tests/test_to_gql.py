"""to_gql: a data block written as standard GQL (§3), every line and comment kept.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests/test_to_gql.py

Reported by the vault on 10 Oct 2026: a requirements block that writes id: on every node, given
one new node without it (a §25 Deferred, written as the spec writes them), lost its comments and
its layout, so the data shortcut's round-trip check failed. A new node with no id: is given its
name as its id where it is written; nothing else in the block moves.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import gql_profile as gp  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
