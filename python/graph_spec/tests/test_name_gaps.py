"""A thing written without a name is drawn under its suggested name, as the plugin's core draws it.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

unnamed_drawn_suggested (editor spec §4, Roger, 10 Oct 2026): every reader draws a thing written
without a name under the same suggested name, marked as suggested; nothing is written until its
fix is accepted, and the problem stays listed until then. The names and their places are held to
name_cases.json, the table the core's tests read too; packages/core/test/layout-parity.test.js
holds the drawings to the same layout source.
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import gql_profile as gp  # noqa: E402

with open(os.path.join(HERE, "name_cases.json"), encoding="utf-8") as f:
    TABLE = json.load(f)

HEAD = (
    "// graph: reader\n(question:Question {title: 'Which device?'}),\n"
    "(small_reader:Option {name: 'Small reader'}),\n"
)
UNNAMED = HEAD + "(:Option {name: 'Large reader'}),\n(small_reader)-[:ANSWERS]->(question)"


def drawn(store, g):
    """A graph's things as (id, text), in the order they were written, and its links by id."""
    stored = store.graph(g)
    ids = {k: n["props"]["id"] for k, n in stored["nodes"].items()}
    things = [
        (ids[k], n["props"].get("name") or n["props"].get("title"))
        for k, n in stored["nodes"].items()
    ]
    return things, [(ids[a], t, ids[b]) for a, t, b, _ in stored["edges"]]


class SuggestedNames(unittest.TestCase):
    def test_every_block_in_the_table_names_its_things_at_their_places(self):
        wrong = []
        for case in TABLE["blocks"]:
            got = gp.suggested_names([tuple(b) for b in case["blocks"]])
            places = [[{k: n[k] for k in ("line", "character", "name")} for n in g] for g in got]
            if places != case["named"]:
                wrong.append((case["about"], places))
        self.assertEqual(wrong, [])


class DrawnUnderItsSuggestedName(unittest.TestCase):
    def test_it_is_drawn_under_the_name_with_a_warning_whose_fix_writes_it(self):
        blocks = [UNNAMED]
        store, problems = gp.read_for_drawing(blocks)
        self.assertEqual(
            drawn(store, "reader")[0],
            [
                ("question", "Which device?"),
                ("small_reader", "Small reader"),
                ("large_reader", "Large reader"),
            ],
        )
        self.assertEqual(
            problems,
            [
                {
                    "graph": "reader",
                    "block": 0,
                    "line": 4,
                    "severity": "warning",
                    "message": "this thing has no name; suggested: large_reader",
                    "fix": "add the name large_reader after the (, or write one of your own",
                    "character": 1,
                    "suggested": "large_reader",
                }
            ],
        )
        self.assertEqual(blocks, [UNNAMED], "the note's text is never changed")
        # drawing only: checking and loading still refuse a thing with no name
        with self.assertRaises(gp.ProfileError):
            gp.Store().apply(UNNAMED)

    def test_a_path_with_an_unnamed_end_still_draws_its_other_end_and_the_link(self):
        store, _ = gp.read_for_drawing(
            [HEAD + "(small_reader)-[:ANSWERS]->(:Option {name: 'Large reader'})"]
        )
        self.assertEqual(drawn(store, "reader")[1], [("small_reader", "ANSWERS", "large_reader")])

    def test_a_place_after_an_emoji_counts_it_as_two_as_an_editor_does(self):
        _, problems = gp.read_for_drawing(
            ["// graph: g\n(a:T {name: '\U0001f642'}), (:T {name: 'B'})"]
        )
        self.assertEqual(problems[0]["character"], len("(a:T {name: '") + 2 + len("'}), ("))
        self.assertEqual(problems[0]["suggested"], "b")

    def test_the_problem_stays_listed_until_the_name_is_written(self):
        for _ in range(2):
            _, problems = gp.read_for_drawing([UNNAMED])
            self.assertEqual([p.get("suggested") for p in problems], ["large_reader"])
        written = UNNAMED.replace("(:Option", "(large_reader:Option")
        store, problems = gp.read_for_drawing([written])
        self.assertEqual(problems, [])
        self.assertIn(("large_reader", "Large reader"), drawn(store, "reader")[0])

    def test_a_link_to_the_suggested_name_links_to_the_thing_drawn_under_it(self):
        store, problems = gp.read_for_drawing(
            [
                "// graph: reader\n(:Option {name: 'Large reader'}),\n(q:Q {name: 'Q'}),\n"
                "(large_reader)-[:ANSWERS]->(q)"
            ]
        )
        self.assertEqual(drawn(store, "reader")[1], [("large_reader", "ANSWERS", "q")])
        self.assertEqual([p["severity"] for p in problems], ["warning"])

    def test_a_block_left_out_in_part_still_names_its_things(self):
        store, problems = gp.read_for_drawing(
            [HEAD + "(gone)-[:R]->(question),\n(:Option {name: 'Large reader'})"]
        )
        self.assertIn(("large_reader", "Large reader"), drawn(store, "reader")[0])
        self.assertEqual(
            [p["severity"] for p in problems],
            ["error", "warning"],
        )


if __name__ == "__main__":
    unittest.main()
