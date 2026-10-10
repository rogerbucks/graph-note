"""req:3.engine-gets-commas — "No route may give an engine a block that still lacks such a
comma" — on each route to Grafeo. The reader reads a missing comma between two patterns on
separate lines as if it were there (§3), never a failure of the block; so the corrected text an
engine is given (Store.corrected) writes each such comma in, and Grafeo accepts the block and
gives the graph the profile parser gives. And req:3.engine-text-keeps-lines: the comma is written
at the end of the code on its line, after the last character of the element's code there, and no
line is added.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_engine_gets_commas
"""

import contextlib
import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import gql_profile as gp  # noqa: E402
import graph_spec as gs  # noqa: E402
from graphspec.engine import settings  # noqa: E402
from graphspec.engine.documents.fill import compute, fill, fill_check  # noqa: E402
from engine_support import module_needs_engine  # noqa: E402


# These tests are of the route into the engine, which a host asks for: the reader is the default
# parser (req:3.reader-default), so every test here runs under Grafeo's, and needs it installed.
def setUpModule():  # noqa: N802
    module_needs_engine()
    global _DEFAULT
    _DEFAULT, settings.PARSER = settings.PARSER, "grafeo"


def tearDownModule():  # noqa: N802
    settings.PARSER = _DEFAULT


HEAD = "// graph: g · document doc:one · schema s1 · as of 2026-10-01"

# a comma missing after the first thing; every node has its id, so the engine's text adds only
# INSERT
WITH_COMMAS = (
    "(r:Reason {id: 'r', title: 'Sun'}),\n"
    "(o:Option {id: 'o', name: 'Coast'}),\n"
    "(r)-[:FAVOURS]->(o)"
)
MISSING = WITH_COMMAS.replace("'Sun'}),", "'Sun'})")

# two commas missing, one of them at the end of a line that holds a link type without its colon
CORRECTED_BOTH = (
    "(r:Reason {id: 'r', title: 'Sun'}),\n"
    "(o:Option {id: 'o', name: 'Coast'}),\n"
    "(r)-[:FAVOURS]->(o),\n"
    "(q:Reason {id: 'q', title: 'Quiet'}),\n"
    "(q)-[:FAVOURS]->(o),\n"
    "(p:Reason {id: 'p', title: 'Hills'})"
)
BOTH = CORRECTED_BOTH.replace("'Sun'}),", "'Sun'})").replace(
    "(q)-[:FAVOURS]->(o),", "(q)-[favours]->(o)"
)

BLOCKS = {"a missing comma": (MISSING, WITH_COMMAS), "and a bare type": (BOTH, CORRECTED_BOTH)}


def parse_text(body):
    """parse() on a Markdown document holding one gql block."""
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "doc.md")
        with open(p, "w", encoding="utf-8") as f:
            f.write(f"```gql\n{HEAD}\n{body}\n```\n")
        return gs.parse(p)


@contextlib.contextmanager
def parser(name):
    old = settings.PARSER
    settings.PARSER = name
    try:
        yield
    finally:
        settings.PARSER = old


def corrected(block):
    """The block as the reader corrected it, read in a fresh store."""
    st = gp.Store()
    st.apply(block)
    return st.corrected(block)


def canon_loaded(body):
    return gs.canon_graph(gs.load("// graph: joined\n" + body), "joined")


def one_block_doc(body):
    return f"## A\n```gql\n// graph: g\n{body}\n```\n"


def filled_doc(body):
    return one_block_doc(body) + (
        "```yaml\n# fill\nSTATE: {load: ['#A'], state_of: g}\n```\nmade against {{STATE}}\n"
    )


def changeset_parts(base_body, change_body):
    """A base text, and a change set against that base as it stands, by an author it holds."""
    base = [("g", f"// graph: g\n{base_body}")]
    against = canon_loaded(corrected(f"// graph: g\n{base_body}").split("\n", 1)[1])[0][:16]
    return base, f"// graph: g · CHANGE SET cs1 · against {against} · by a\n{change_body}"


class Recording:
    """A Grafeo database that keeps each text it is asked to execute."""

    def __init__(self, db, log):
        self._db, self._log = db, log

    def execute(self, text):
        self._log.append(text)
        return self._db.execute(text)

    def __getattr__(self, name):
        return getattr(self._db, name)


class SpyOnGrafeo:
    """Stands for the grafeo module in queries.py: its databases record."""

    def __init__(self, log):
        self.log = log

    def GrafeoDB(self, *args, **kwargs):  # noqa: N802 — stands for the class grafeo.GrafeoDB
        return Recording(gs.grafeo.GrafeoDB(*args, **kwargs), self.log)


class ParseAgreesWithTheReader(unittest.TestCase):
    """parse() under Grafeo gives the graph the profile parser gives."""

    def check(self, block):
        with parser("grafeo"):
            ours = parse_text(block)
        with parser("profile"):
            theirs = parse_text(block)
        self.assertEqual(ours["nodes"], theirs["nodes"])
        self.assertEqual(
            sorted(map(repr, ours["raw_edges"])), sorted(map(repr, theirs["raw_edges"]))
        )
        self.assertIn("o", ours["nodes"])

    def test_parse_under_grafeo_accepts_a_missing_comma_as_the_profile_parser_does(self):
        self.check(MISSING)

    def test_parse_under_grafeo_accepts_a_missing_comma_and_a_bare_type_as_the_profile_does(self):
        self.check(BOTH)


class LoadAgreesWithTheReader(unittest.TestCase):
    def test_load_accepts_a_missing_comma_as_the_text_written_with_it(self):
        self.assertEqual(canon_loaded(MISSING), canon_loaded(WITH_COMMAS))

    def test_load_accepts_a_missing_comma_and_a_bare_type_as_the_text_written_with_both(self):
        self.assertEqual(canon_loaded(BOTH), canon_loaded(CORRECTED_BOTH))


class FillAgreesWithTheReader(unittest.TestCase):
    def check(self, block, fixed):
        recipe = {"load": ["#A"], "state_of": "g"}
        self.assertEqual(
            compute(recipe, one_block_doc(block), ".", "."),
            compute(recipe, one_block_doc(fixed), ".", "."),
        )
        filled, values = fill(filled_doc(block), ".", ".")
        self.assertEqual(values, fill(filled_doc(fixed), ".", ".")[1])
        self.assertEqual(fill_check(filled, ".", "."), [])

    def test_compute_and_fill_accept_a_missing_comma_as_the_text_written_with_it(self):
        self.check(MISSING, WITH_COMMAS)

    def test_compute_and_fill_accept_a_missing_comma_and_a_bare_type_as_the_corrected_text(self):
        self.check(BOTH, CORRECTED_BOTH)


AUTHOR = "(a:Person {id: 'a', name: 'A'})\n"
CHANGE = "(n:Option {id: 'n', name: 'Hills'})\n(n)-[:CONSIDERED]->(o)"


class ChangeSetAgreesWithTheReader(unittest.TestCase):
    def loads(self, results):
        self.assertTrue(all(ok for label, ok, _ in results[0] if label == "it loads"), results)
        self.assertIsNotNone(results[2])

    def test_check_changeset_accepts_a_missing_comma_in_its_base(self):
        for name, (block, fixed) in BLOCKS.items():
            base, change = changeset_parts(AUTHOR + block, CHANGE.replace("\n", ",\n"))
            fixed_base, _ = changeset_parts(AUTHOR.replace(")\n", "),\n") + fixed, CHANGE)
            results = gs.check_changeset(base, change)
            self.assertEqual(results, gs.check_changeset(fixed_base, change), name)
            self.loads(results)

    def test_check_changeset_accepts_a_missing_comma_in_the_change_set_itself(self):
        base, change = changeset_parts(AUTHOR.replace(")\n", "),\n") + WITH_COMMAS, CHANGE)
        results = gs.check_changeset(base, change)
        self.assertEqual(results, gs.check_changeset(base, change.replace("})\n", "}),\n")))
        self.loads(results)


class CorrectedTextWritesTheComma(unittest.TestCase):
    """req:3.engine-text-keeps-lines: the comma at the end of the code on its line, and no line
    added."""

    def assertCorrected(self, body, want):  # noqa: N802 — named as unittest names its asserts
        got = corrected("// graph: g\n" + body).split("\n")
        self.assertEqual(len(got), len(want) + 1, "no line is added")
        self.assertEqual(got, ["// graph: g"] + want)

    def test_the_comma_is_written_after_the_last_character_of_the_code_on_its_line(self):
        self.assertCorrected(MISSING, WITH_COMMAS.split("\n"))

    def test_the_comma_goes_before_the_spaces_that_end_its_line(self):
        self.assertCorrected(
            "(r:Reason {id: 'r'})   \n(o:Option {id: 'o'})\t \n(r)-[:FAVOURS]->(o)  ",
            ["(r:Reason {id: 'r'}),   ", "(o:Option {id: 'o'}),\t ", "(r)-[:FAVOURS]->(o)  "],
        )

    def test_the_comma_goes_on_the_line_a_multi_line_property_map_ends(self):
        self.assertCorrected(
            "(r:Reason {id: 'r',\n  title: 'Sun'})\n(o:Option {\n  id: 'o'\n})\n(r)-[:F]->(o)",
            ["(r:Reason {id: 'r',", "  title: 'Sun'}),", "(o:Option {", "  id: 'o'", "}),"]
            + ["(r)-[:F]->(o)"],
        )

    def test_the_comma_goes_on_the_code_line_before_a_comment_or_a_blank_line(self):
        self.assertCorrected(
            "(a:T {id: 'a'})\n\n// the second, (b)\n(b:T {id: 'b'})",
            ["(a:T {id: 'a'}),", "", "// the second, (b)", "(b:T {id: 'b'})"],
        )

    def test_a_comma_and_a_colon_on_one_line_are_both_written(self):
        self.assertCorrected(BOTH, CORRECTED_BOTH.split("\n"))

    def test_load_gives_grafeo_the_blocks_lines_with_only_the_commas_written(self):
        log = []
        with mock.patch("graphspec.engine.queries.grafeo", SpyOnGrafeo(log)):
            gs.load("// graph: joined\n" + BOTH)
        # the header given as a /* */ comment on its own line (req:3.engine-keeps-comments)
        want = ["/* graph: joined */", "INSERT"] + CORRECTED_BOTH.split("\n")
        self.assertEqual(log[-1].split("\n"), want)


if __name__ == "__main__":
    unittest.main()
