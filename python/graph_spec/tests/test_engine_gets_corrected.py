"""req:3.engine-gets-corrected — "an engine gets the reader's corrected text, or the load is
refused with the fix" — on each route to Grafeo, so the two parsers agree: whatever the reader
accepts and corrects, Grafeo is given corrected and accepts too. And req:3.engine-text-keeps-lines
— the text an engine is given is the block as written, with only INSERT, the missing ids and one
MATCH line added — which the corrected text must keep: it changes only what the reader corrects.

The slip the reader corrects and Store.corrected writes is a link type without its colon, such as
[favours] for [:FAVOURS]. (A missing comma is read in and written too: test_engine_gets_commas.py,
req:3.engine-gets-commas.)

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_engine_gets_corrected
"""

import contextlib
import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import graph_spec as gs  # noqa: E402
from graphspec.engine import settings  # noqa: E402
from graphspec.engine.documents.fill import compute, fill, fill_check  # noqa: E402

HEAD = "// graph: g · document doc:one · schema s1 · as of 2026-10-01"

# the second favours link is written without its colon; the first, above it, gives the type its
# one spelling in the graph. Every node has its id, so the engine's text adds only INSERT.
LINKS = [
    "(r:Reason {id: 'r', title: 'Sun'}),",
    "// the option, with a [favours] in a comment, which is not a type",
    "(o:Option {id: 'o', name: 'Coast'}),",
    "(r)-[:FAVOURS]->(o),",
    "(q:Reason {id: 'q', title: 'Quiet'}),",
    "// quiet favours it",
    "(q)-[favours]->(o)",
]
BARE = "\n".join(LINKS)
COLON = BARE.replace("(q)-[favours]", "(q)-[:FAVOURS]")


def one_graph(body):
    return f"{HEAD}\n{body}"


def parse_text(body):
    """parse() on a Markdown document holding one gql block."""
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "doc.md")
        with open(p, "w", encoding="utf-8") as f:
            f.write(f"```gql\n{one_graph(body)}\n```\n")
        return gs.parse(p)


@contextlib.contextmanager
def parser(name):
    old = settings.PARSER
    settings.PARSER = name
    try:
        yield
    finally:
        settings.PARSER = old


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
    """Stands for the grafeo module in the modules that import it: its databases record."""

    def __init__(self, log):
        self.log = log

    def GrafeoDB(self, *args, **kwargs):  # noqa: N802 — stands for the class grafeo.GrafeoDB
        return Recording(gs.grafeo.GrafeoDB(*args, **kwargs), self.log)


@contextlib.contextmanager
def given_to_grafeo():
    """The texts Grafeo is given, in order, by every route that loads a block."""
    log = []
    spy = SpyOnGrafeo(log)
    with contextlib.ExitStack() as stack:
        for module in (
            "graphspec.engine.queries",
            "graphspec.engine.documents.reading",
            "graphspec.engine.documents.fill",
            "graphspec.engine.changesets",
        ):
            stack.enter_context(mock.patch(module + ".grafeo", spy))
        yield log


def edge_types(db):
    return sorted(r["t"] for r in gs.Q(db, "MATCH ()-[r]->() RETURN type(r) AS t"))


def doc_with(a, b):
    """A document of two blocks of graph g, and a recipe for the state they leave it in."""
    return (
        f"## A\n```gql\n// graph: g\n{a}\n```\n## B\n```gql\n// graph: g\n{b}\n```\n"
        "```yaml\n# fill\nSTATE: {load: ['#A', '#B'], state_of: g}\n```\nmade against {{STATE}}\n"
    )


A_BLOCK = (
    "(r:Reason {id: 'r', title: 'Sun'}),\n(o:Option {id: 'o', name: 'Coast'}),\n"
    "(r)-[:FAVOURS]->(o)"
)
B_BARE = "(q:Reason {id: 'q', title: 'Quiet'}),\n(q)-[favours]->(o)"
B_COLON = B_BARE.replace("[favours]", "[:FAVOURS]")


class ParseAgreesWithTheReader(unittest.TestCase):
    """parse() under the default parser, Grafeo, gives the graph the profile parser gives."""

    def test_parse_by_default_accepts_a_bare_type_and_gives_the_profile_parser_s_graph(self):
        self.assertEqual(settings.PARSER, "grafeo")
        ours = parse_text(BARE)
        with parser("profile"):
            theirs = parse_text(BARE)
        self.assertEqual(sorted(ours["nodes"]), ["o", "q", "r"])
        self.assertEqual(sorted(e[1] for e in ours["raw_edges"]), ["FAVOURS", "FAVOURS"])
        self.assertEqual(ours["nodes"], theirs["nodes"])
        self.assertEqual(
            sorted(map(repr, ours["raw_edges"])), sorted(map(repr, theirs["raw_edges"]))
        )

    def test_parse_by_default_gives_a_bare_type_the_graph_of_the_block_written_with_its_colon(
        self,
    ):
        self.assertEqual(parse_text(BARE), parse_text(COLON))


class LoadAgreesWithTheReader(unittest.TestCase):
    def test_load_accepts_a_bare_type_as_the_type_the_reader_read(self):
        self.assertEqual(edge_types(gs.load("// graph: joined\n" + BARE)), ["FAVOURS", "FAVOURS"])

    def test_load_gives_a_bare_type_the_graph_of_the_text_written_with_its_colon(self):
        bare = gs.canon_graph(gs.load("// graph: joined\n" + BARE), "joined")
        colon = gs.canon_graph(gs.load("// graph: joined\n" + COLON), "joined")
        self.assertEqual(bare, colon)


class FillAgreesWithTheReader(unittest.TestCase):
    def test_compute_accepts_a_bare_type_and_gives_the_state_of_the_text_written_with_its_colon(
        self,
    ):
        recipe = {"load": ["#A", "#B"], "state_of": "g"}
        bare = compute(recipe, doc_with(A_BLOCK, B_BARE), ".", ".")
        colon = compute(recipe, doc_with(A_BLOCK, B_COLON), ".", ".")
        self.assertEqual(bare, colon)

    def test_fill_accepts_a_bare_type_and_fills_the_value_of_the_text_written_with_its_colon(self):
        filled, values = fill(doc_with(A_BLOCK, B_BARE), ".", ".")
        _, colon_values = fill(doc_with(A_BLOCK, B_COLON), ".", ".")
        self.assertEqual(values, colon_values)
        self.assertIn(f"made against {values['STATE']}", filled)

    def test_fill_check_finds_nothing_wrong_with_a_filled_document_holding_a_bare_type(self):
        filled, _ = fill(doc_with(A_BLOCK, B_BARE), ".", ".")
        self.assertEqual(fill_check(filled, ".", "."), [])


def changeset_parts(base_body, change_body):
    """A base text, and a change set against that base as it stands, by an author it holds."""
    base = [("g", f"// graph: g\n{base_body}")]
    with parser("grafeo"):
        db = gs.load("// graph: joined\n" + base_body.replace("[favours]", "[:FAVOURS]"))
    against = gs.canon_graph(db, "joined")[0][:16]
    block = f"// graph: g · CHANGE SET cs1 · against {against} · by a\n{change_body}"
    return base, block


BASE_BARE = (
    "(a:Person {id: 'a', name: 'A'}),\n(r:Reason {id: 'r', title: 'Sun'}),\n"
    "(o:Option {id: 'o', name: 'Coast'}),\n(r)-[:FAVOURS]->(o),\n"
    "(p:Reason {id: 'p', title: 'Hills'}),\n(p)-[favours]->(o)"
)
CHANGE_BARE = "(q:Option {id: 'q', name: 'Hills'}),\n(q)-[:CONSIDERED]->(o)"


class ChangeSetAgreesWithTheReader(unittest.TestCase):
    def test_check_changeset_accepts_a_bare_type_in_its_base_as_it_accepts_the_corrected_base(
        self,
    ):
        base, block = changeset_parts(BASE_BARE, CHANGE_BARE)
        colon_base, _ = changeset_parts(BASE_BARE.replace("[favours]", "[:FAVOURS]"), CHANGE_BARE)
        results = gs.check_changeset(base, block)
        self.assertEqual(results, gs.check_changeset(colon_base, block))
        self.assertTrue(all(ok for label, ok, _ in results[0] if label == "it loads"), results)
        self.assertFalse(any("colon" in fix for _, ok, fix in results[0] if not ok), results)
        self.assertIsNotNone(results[2])

    def test_check_changeset_accepts_a_bare_type_in_the_change_set_itself(self):
        change = "(q:Reason {id: 'q', title: 'Quiet'}),\n(q)-[favours]->(o)"
        base, block = changeset_parts(BASE_BARE.replace("[favours]", "[:FAVOURS]"), change)
        results = gs.check_changeset(base, block)
        colon = gs.check_changeset(base, block.replace("[favours]", "[:FAVOURS]"))
        self.assertEqual(results, colon)
        self.assertFalse(any("colon" in fix for _, ok, fix in results[0] if not ok), results)
        self.assertIsNotNone(results[2])


class CorrectedTextKeepsTheBlocksLines(unittest.TestCase):
    """req:3.engine-text-keeps-lines: the corrected text changes only what the reader corrects."""

    def expected_given(self, header):
        """The lines Grafeo is to be given for a block of BARE under a header line: the header
        and every line that is only a comment given as a /* */ comment on the same line
        (req:3.engine-keeps-comments), so a line number still names the block's own line; INSERT
        put back; the bare type written with its colon; every other line as written."""
        body = [
            "/* " + line.strip()[3:] + " */" if line.strip().startswith("//") else line
            for line in COLON.split("\n")
        ]
        return ["/* " + header[3:] + " */"] + ["INSERT"] + body

    def last_given(self, log):
        self.assertTrue(log, "Grafeo was given nothing")
        return log[-1].split("\n")

    def test_parse_gives_grafeo_the_blocks_lines_and_comments_with_only_the_colon_written(self):
        with given_to_grafeo() as log:
            parse_text(BARE)
        self.assertEqual(self.last_given(log), self.expected_given(HEAD))

    def test_load_gives_grafeo_the_blocks_lines_and_comments_with_only_the_colon_written(self):
        with given_to_grafeo() as log:
            gs.load("// graph: joined\n" + BARE)
        self.assertEqual(self.last_given(log), self.expected_given("// graph: joined"))

    def test_compute_gives_grafeo_the_blocks_lines_and_comments_with_only_the_colon_written(self):
        text = f"## A\n```gql\n// graph: g\n{BARE}\n```\n"
        with given_to_grafeo() as log:
            compute({"load": ["#A"], "state_of": "g"}, text, ".", ".")
        self.assertEqual(self.last_given(log), self.expected_given("// graph: g"))

    def test_check_changeset_gives_grafeo_the_blocks_lines_and_comments_with_the_colon_written(
        self,
    ):
        base, block = changeset_parts(
            "(a:Person {id: 'a', name: 'A'}),\n(o:Option {id: 'o', name: 'Coast'}),\n"
            "(r:Reason {id: 'r', title: 'Sun'}),\n(r)-[:FAVOURS]->(o)",
            "(q:Reason {id: 'q', title: 'Quiet'}),\n// the link\n(q)-[favours]->(o)",
        )
        with given_to_grafeo() as log:
            gs.check_changeset(base, block)
        # o is named, not written, so the one MATCH line is added for it, before INSERT
        want = [
            "/* " + block.split("\n")[0][3:] + " */",
            "MATCH (o {id: 'o'})",
            "INSERT",
            "(q:Reason {id: 'q', title: 'Quiet'}),",
            "/* the link */",
            "(q)-[:FAVOURS]->(o)",
        ]
        self.assertEqual(self.last_given(log), want)


if __name__ == "__main__":
    unittest.main()
