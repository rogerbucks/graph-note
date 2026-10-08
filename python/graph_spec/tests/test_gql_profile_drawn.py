"""A block that cannot be read is drawn in part, by every reader.

Decided with Roger, 8 Oct 2026 (his choice B): every reader draws what it can of a block that
cannot be read, byte for byte the same, and Python matches the plugin's core. Drawing only:
checking and loading stay all-or-nothing, so such a block still fails its checks and no engine is
given it.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

As packages/core/src/drawing.ts reads a note's blocks for drawing: each block in turn into a fresh
store; when one fails, the item at the failing line is blanked (every other line keeps its number)
and the whole read starts again. The results below are what the core draws for the same blocks;
packages/core/test/layout-parity.test.js holds the two readers to the same layout.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import gql_profile as gp  # noqa: E402

# a block opening with a MATCH for a thing not in the graph, then new things and links
MISSING_MATCH = [
    "// graph: trip\n(home:Place {name: 'Home'})",
    "\n".join(
        [
            "// graph: trip",
            "MATCH (gone:Place {id: 'station'})",
            "INSERT (walk:Leg {name: 'Walk'}),",
            "(bus:Leg {name: 'Bus'}),",
            "(walk)-[:STARTS_AT]->(home),",
            "(walk)-[:ENDS_AT]->(gone),",
            "(bus)-[:FOLLOWS]->(walk)",
        ]
    ),
]
# a second block that writes again an id the graph already has, then new things and links
REPEATED_ID = [
    "// graph: trip\n(home:Place {name: 'Home'}),\n(walk:Leg {name: 'Walk'})",
    "\n".join(
        [
            "// graph: trip",
            "(walk:Leg {name: 'Walk again'}),",
            "(bus:Leg {name: 'Bus'}),",
            "(train:Leg {name: 'Train'}),",
            "(bus)-[:FOLLOWS]->(walk),",
            "(train)-[:FOLLOWS]->(bus),",
            "(train)-[:ENDS_AT]->(home)",
        ]
    ),
]


def drawn(store, g):
    """A graph's things by id, in the order they were written, and its links by id."""
    stored = store.graph(g)
    ids = {k: n["props"]["id"] for k, n in stored["nodes"].items()}
    names = [(ids[k], n["props"].get("name")) for k, n in stored["nodes"].items()]
    return names, [(ids[a], t, ids[b]) for a, t, b, _ in stored["edges"]]


class DrawnInPart(unittest.TestCase):
    def test_a_match_for_a_missing_thing_leaves_out_the_match_and_what_uses_it(self):
        store, problems = gp.read_for_drawing(MISSING_MATCH)
        self.assertEqual(
            drawn(store, "trip"),
            (
                [("home", "Home"), ("walk", "Walk"), ("bus", "Bus")],
                [("walk", "STARTS_AT", "home"), ("bus", "FOLLOWS", "walk")],
            ),
        )
        self.assertEqual(
            [(p["block"], p["line"], p["message"], p["dropped"]) for p in problems],
            [
                (
                    1,
                    2,
                    "MATCH finds no Place with id 'station' in graph trip",
                    "MATCH (gone:Place {id: 'station'})",
                ),
                (1, 6, "no thing called gone in graph trip", "(walk)-[:ENDS_AT]->(gone)"),
            ],
        )

    def test_an_id_written_again_leaves_out_that_thing_and_draws_the_rest(self):
        store, problems = gp.read_for_drawing(REPEATED_ID)
        self.assertEqual(
            drawn(store, "trip"),
            (
                [("home", "Home"), ("walk", "Walk"), ("bus", "Bus"), ("train", "Train")],
                [
                    ("bus", "FOLLOWS", "walk"),
                    ("train", "FOLLOWS", "bus"),
                    ("train", "ENDS_AT", "home"),
                ],
            ),
        )
        self.assertEqual(
            [(p["block"], p["line"], p["message"], p["dropped"]) for p in problems],
            [
                (
                    1,
                    2,
                    "id 'walk' is already a node in graph trip",
                    "(walk:Leg {name: 'Walk again'})",
                )
            ],
        )

    def test_queries_excerpts_and_blocks_with_no_graph_line_are_not_drawn(self):
        store, problems = gp.read_for_drawing(
            [
                "// graph: trip · QUERY\nMATCH (n) RETURN n",
                "// excerpt\n(x:Thing)",
                "plain code",
                "// graph: trip\n(home:Place {name: 'Home'})",
            ]
        )
        self.assertEqual(sorted(store.graphs), ["trip"])
        self.assertEqual(problems, [])

    def test_a_graph_line_that_cannot_be_read_is_a_problem_and_its_block_is_left_out(self):
        store, problems = gp.read_for_drawing(["// graph: reader-choice\n(x:Thing)"])
        self.assertEqual(store.graphs, {})
        self.assertEqual([(p["block"], p["line"]) for p in problems], [(0, 1)])


class ADanglingComma(unittest.TestCase):
    """A comma with nothing after it, at a block's end: the commonest state while typing, so drawn
    whole, with one quiet warning whose fix removes it (Roger's try-out, 8 Oct 2026)."""

    BLOCK = "// graph: g\n(a:T {name: 'A'}),\n(b:T {name: 'B'}),\n(a)-[:R]->(b)"

    def test_everything_before_it_is_drawn_with_one_warning_on_its_line(self):
        # a plain loop, not subTest: the record of tests seen failing reads each test by name
        for tail in (",", ",\n", ",\n\n// the next pattern goes here\n"):
            store, problems = gp.read_for_drawing([self.BLOCK + tail])
            self.assertEqual(
                drawn(store, "g"), ([("a", "A"), ("b", "B")], [("a", "R", "b")]), repr(tail)
            )
            self.assertEqual(
                [(p["block"], p["line"], p["severity"]) for p in problems],
                [(0, 4, "warning")],
                repr(tail),
            )
            self.assertIn("comma with nothing after it", problems[0]["message"])

    def test_checking_and_loading_may_still_refuse_it(self):
        with self.assertRaises(gp.ProfileError):
            gp.Store().apply(self.BLOCK + ",")


class CheckingStaysWhole(unittest.TestCase):
    """Drawing in part never reaches checking or loading: a block that cannot be read is
    refused."""

    def test_apply_still_refuses_both_shapes(self):
        for blocks in (MISSING_MATCH, REPEATED_ID):
            store = gp.Store()
            store.apply(blocks[0])
            with self.assertRaises(gp.ProfileError):
                store.apply(blocks[1])

    def test_a_refused_block_leaves_the_store_as_it_was_even_when_it_fails_late(self):
        store = gp.Store()
        store.apply("// graph: trip\n(home:Place {name: 'Home'})")
        before = gp.canon(store, "trip")
        late = "// graph: trip\n(walk:Leg {name: 'Walk'}),\n(walk)-[:GOES]->(nowhere)"
        with self.assertRaises(gp.ProfileError):
            store.apply(late)
        self.assertEqual(gp.canon(store, "trip"), before)
        self.assertEqual(len(store.graph("trip")["nodes"]), 1)


if __name__ == "__main__":
    unittest.main()
