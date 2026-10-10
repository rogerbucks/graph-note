"""req:3.set-keeps-id and req:3.id-is-text on the routes to the engine: each reads the block with
the reader first (req:3.engine-reads-first), so a SET of a node's id, or a node id that is not
text, is refused before Grafeo is given it — by parse, load, compute and the engine's
check_changeset.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_ids_engine
"""

import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import gql_profile as gp  # noqa: E402
import graph_spec as gs  # noqa: E402
from graphspec.engine import settings  # noqa: E402
from graphspec.engine.documents.fill import compute  # noqa: E402


# These tests are of the route into the engine, which a host asks for: the reader is the default
# parser (req:3.reader-default), so every test here runs under Grafeo's.
def setUpModule():  # noqa: N802
    global _DEFAULT
    _DEFAULT, settings.PARSER = settings.PARSER, "grafeo"


def tearDownModule():  # noqa: N802
    settings.PARSER = _DEFAULT


HEAD = "// graph: g · document doc:one · schema s1 · as of 2026-10-01"
TWO = "(a:T {id: 'a'}),\n(b:T {id: 'b'})"
SET_ID = r"^line 4: SET would change b's id, and a node's id never changes \(§3\) — "
NOT_TEXT = "^line {line}: id {written} is not text — write id: {quoted} — "


def parse_block(body):
    """parse() on a Markdown document holding one gql block: the header line, then body."""
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "doc.md")
        with open(p, "w", encoding="utf-8") as f:
            f.write(f"```gql\n{HEAD}\n{body}\n```\n")
        return gs.parse(p)


def state_hash(base):
    """The state hash a change set is made against: the base loaded into Grafeo, as
    check_changeset loads it."""
    db = gs.grafeo.GrafeoDB()
    db.execute("CREATE GRAPH g")
    db.set_graph("g")
    for _, text in base:
        db.execute(gs.strip(text))
    return gs.canon_graph(db, "g")[0][:16]


def refused(results, said):
    """Whether a check's results hold a failure saying the given words."""
    return any(not ok and said in fix for _, ok, fix in results)


class RoutesRefuseASetOfId(unittest.TestCase):
    def test_parse_by_default_refuses_a_set_of_id_whatever_the_value(self):
        # req:3.set-keeps-id, under Grafeo's parser, as setUpModule asks
        self.assertEqual(settings.PARSER, "grafeo")
        for value in ("'a'", "'c'", "'b'"):
            with self.assertRaisesRegex(gp.ProfileError, SET_ID, msg=value):
                parse_block(f"{TWO}\nSET b.id = {value}")

    def test_load_refuses_a_set_of_id(self):
        # req:3.set-keeps-id
        with self.assertRaisesRegex(gp.ProfileError, SET_ID):
            gs.load(f"// graph: g\n{TWO}\nSET b.id = 'c'")

    def test_compute_refuses_a_set_of_id_in_a_later_block(self):
        # req:3.set-keeps-id: the recipe's blocks are read together, in their graph
        text = (
            f"## A\n```gql\n// graph: g\n{TWO}\n```\n"
            "## B\n```gql\n// graph: g\nSET b.id = 'a'\n```\n"
        )
        with self.assertRaisesRegex(gp.ProfileError, "^line 2: SET would change b's id"):
            compute({"load": ["#A", "#B"], "state_of": "g"}, text, ".", ".")

    def test_check_changeset_refuses_a_change_set_that_sets_an_id(self):
        # req:3.set-keeps-id: the engine's check_changeset reads the change set on its base
        base = [("g", f"// graph: g\n{TWO}")]
        block = f"// graph: g · CHANGE SET cs1 · against {state_hash(base)} · by a\nSET b.id = 'c'"
        results = gs.check_changeset(base, block)[0]
        self.assertTrue(refused(results, "a node's id never changes (§3)"), results)


class RoutesRefuseANonTextId(unittest.TestCase):
    FORMS = [
        ("1", "'1'"),
        ("1.0", "'1.0'"),
        ("TRUE", "'TRUE'"),
        ("DATE '2026-10-01'", "'2026-10-01'"),
    ]

    def test_parse_by_default_refuses_each_non_text_id(self):
        # req:3.id-is-text, under Grafeo's parser, as setUpModule asks
        self.assertEqual(settings.PARSER, "grafeo")
        for written, quoted in self.FORMS:
            said = NOT_TEXT.format(line=2, written=written, quoted=quoted)
            with self.assertRaisesRegex(gp.ProfileError, said, msg=written):
                parse_block(f"(b:T {{id: {written}}})")

    def test_load_refuses_a_non_text_id_in_insert_and_in_match(self):
        # req:3.id-is-text
        said = NOT_TEXT.format(line=2, written="1", quoted="'1'")
        with self.assertRaisesRegex(gp.ProfileError, said):
            gs.load("// graph: g\n(b:T {id: 1})")
        with self.assertRaisesRegex(gp.ProfileError, said):
            gs.load("// graph: g\nMATCH (x:T {id: 1})\nINSERT (c:T)")

    def test_compute_refuses_a_non_text_id(self):
        # req:3.id-is-text
        text = "## A\n```gql\n// graph: g\n(b:T {id: TRUE})\n```\n"
        with self.assertRaisesRegex(gp.ProfileError, "^line 2: id TRUE is not text"):
            compute({"load": ["#A"], "state_of": "g"}, text, ".", ".")

    def test_check_changeset_refuses_a_change_set_with_a_non_text_id(self):
        # req:3.id-is-text
        base = [("g", f"// graph: g\n{TWO}")]
        block = (
            f"// graph: g · CHANGE SET cs1 · against {state_hash(base)} · by a\n(c:T {{id: 3}})"
        )
        results = gs.check_changeset(base, block)[0]
        self.assertTrue(refused(results, "id 3 is not text"), results)


if __name__ == "__main__":
    unittest.main()
