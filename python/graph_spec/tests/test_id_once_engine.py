"""req:3.id-once — "every node has an id, used once in its graph" — on the library's paths that
hand GQL to Grafeo without the portable reader (graphspec/reader/store.py Store.apply) first.

Begun as an investigation: each test marked expectedFailure demonstrated a gap, named in its
comment, so the suite stayed green while the gap stood. req:3.engine-reads-first closed the gaps
on the four routes to Grafeo (parse, load, compute and the engine's check_changeset), and their
decorators came off in the commits that closed them; the one left marks validate. The other
tests record what Grafeo does with a repeat, that the reader refuses one, and that a join treats
one id in two documents as one thing (§21) — the intended case, kept apart from the repeats.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_id_once_engine
"""

import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import gql_profile as gp  # noqa: E402
import graph_spec as gs  # noqa: E402
from graphspec.engine import settings  # noqa: E402
from graphspec.engine.documents.fill import compute  # noqa: E402
from engine_support import module_needs_engine  # noqa: E402


# These tests are of the route into the engine, which a host asks for. The reader is the default
# parser (req:3.reader-default). So every test here runs under Grafeo's, and needs it installed.
def setUpModule():  # noqa: N802
    module_needs_engine()
    global _DEFAULT
    _DEFAULT, settings.PARSER = settings.PARSER, "grafeo"


def tearDownModule():  # noqa: N802
    settings.PARSER = _DEFAULT


HEAD = "// graph: g · document {doc} · schema s1 · as of 2026-10-01"

# one id, 'x', given to two nodes in one block the reader reads
ID_TWICE = "(a:Person {id: 'x', name: 'A'}),\n(b:Person {id: 'x', name: 'B'})"
# one variable, a, written for two nodes in one block
VAR_TWICE = "(a:Person {name: 'A'}),\n(a:Person {name: 'B'})"
# One id given to two nodes in two INSERT statements. The reader cannot read this block (a data
# block ends after its INSERT and SET). So to_gql hands it to Grafeo unchanged, PR #36 or not.
TWO_INSERTS = "INSERT (a:Person {id: 'x', name: 'A'})\nINSERT (b:Person {id: 'x', name: 'B'})"


def fresh(graph="g"):
    """A Grafeo database as reading.py makes one: one graph, created and set."""
    db = gs.grafeo.GrafeoDB()
    db.execute(f"CREATE GRAPH {graph}")
    db.set_graph(graph)
    return db


def nodes(db, graph="g"):
    """Graph g's node rows, as the engine reads them (queries.read)."""
    return gs.read(db, graph)[0]


def parse_block(body, doc="doc:one"):
    """parse() on a Markdown document holding one gql block: the header line, then body."""
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "doc.md")
        with open(p, "w", encoding="utf-8") as f:
            f.write(f"```gql\n{HEAD.format(doc=doc)}\n{body}\n```\n")
        return gs.parse(p)


def state_hash(base):
    """The state hash a change set is made against: the base loaded into Grafeo, as
    check_changeset loads it."""
    db = fresh()
    for _, text in base:
        db.execute(gs.strip(text))
    return gs.canon_graph(db, "g")[0][:16]


def names_the_id(results, ident):
    """Whether a failing result says the id is repeated, as the reader's refusal does."""
    return any(not ok and f"id '{ident}'" in fix for _, ok, fix in results)


class GrafeoTakesARepeat(unittest.TestCase):
    """Question 3: what Grafeo 0.5.43 does when it is given one id twice."""

    def test_grafeo_stores_two_nodes_for_one_id_in_one_insert(self):
        db = fresh()
        db.execute("INSERT (a:Person {id: 'x', name: 'A'}), (b:Org {id: 'x', name: 'B'})")
        rows = nodes(db)
        self.assertEqual(len(rows), 2)
        self.assertEqual([r["p"]["id"] for r in rows], ["x", "x"])
        self.assertEqual(sorted(r["p"]["name"] for r in rows), ["A", "B"])

    def test_grafeo_stores_two_nodes_for_one_id_across_two_texts_of_one_graph(self):
        db = fresh()
        db.execute(gs.strip("// graph: g\n(a:Person {name: 'A'})"))
        db.execute(gs.strip("// graph: g\n(b:Person {id: 'a', name: 'B'})"))
        self.assertEqual([r["p"]["id"] for r in nodes(db)], ["a", "a"])

    def test_grafeo_stores_two_nodes_for_two_insert_statements_in_one_text(self):
        db = fresh()
        db.execute(TWO_INSERTS)
        self.assertEqual([r["p"]["id"] for r in nodes(db)], ["x", "x"])

    def test_grafeo_makes_a_second_node_for_a_variable_written_twice(self):
        db = fresh()
        db.execute("INSERT (a:Person {id: 'a', name: 'A'}), (a:Person {name: 'B'})")
        rows = nodes(db)
        self.assertEqual(len(rows), 2)
        self.assertEqual([r["p"].get("id") for r in rows], ["a", None])


class TheReaderRefusesARepeat(unittest.TestCase):
    """Store.apply refuses a repeat within one block and across the blocks of one graph."""

    def test_the_reader_refuses_an_id_repeated_across_two_blocks_of_one_graph(self):
        st = gp.Store()
        st.apply("// graph: g\n(a:Person {name: 'A'})")
        with self.assertRaisesRegex(gp.ProfileError, "id 'a' is already a node in graph g"):
            st.apply("// graph: g\n(b:Person {id: 'a', name: 'B'})")

    def test_parse_under_the_profile_setting_refuses_an_id_repeated_in_one_block(self):
        old = settings.PARSER
        settings.PARSER = "profile"
        try:
            with self.assertRaisesRegex(gp.ProfileError, "id 'x' is already a node"):
                parse_block(ID_TWICE)
        finally:
            settings.PARSER = old


class EnginePathsSkipTheReader(unittest.TestCase):
    """Questions 1 and 2: the paths that handed a block to Grafeo with no reader first, and now
    read it with the reader first (req:3.engine-reads-first). The class keeps its name, so the
    tests-first record knows its tests."""

    # (test_the_default_parser_is_grafeo went with req:3.reader-default. The reader is the default
    # now, held by test_settings_reader_default.py. These tests ask for Grafeo in setUpModule.)

    # Was a GAP. parse() under the default PARSER ('grafeo', reading.py:95-101) ran no reader. On
    # main, to_gql did not refuse an id given twice, and Grafeo stored two nodes. parse keyed its
    # nodes by id (reading.py:107), so one was silently dropped. PR #36's to_gql refuses this case.
    # So on its base this test passes and its expectedFailure decorator is off.
    def test_parse_by_default_refuses_an_id_repeated_in_one_block(self):
        with self.assertRaisesRegex(gp.ProfileError, "id 'x' is already a node"):
            parse_block(ID_TWICE)

    # Was a GAP. The same path with a variable written twice. On main, to_gql wrote id: twice into
    # the first node and none into the second. Grafeo made a second node with no id. parse
    # failed with KeyError 'id' (reading.py:101) — a crash, not the reader's refusal. PR #36
    # refuses it. So on its base this test passes and its expectedFailure decorator is off.
    def test_parse_by_default_refuses_a_variable_written_twice(self):
        with self.assertRaisesRegex(gp.ProfileError, "a is written twice"):
            parse_block(VAR_TWICE)

    # Was a GAP, open after PR #36 too. A block the reader cannot read was handed to Grafeo
    # unchanged (to_gql.py:94-97). So parse() kept one node of two with one id, and reported
    # nothing. parse now reads the block with the reader first (req:3.engine-reads-first).
    def test_parse_by_default_refuses_a_block_the_reader_cannot_read(self):
        with self.assertRaisesRegex(gp.ProfileError, "^line 3: unexpected 'INSERT' — "):
            parse_block(TWO_INSERTS)

    # Was a GAP: load() (queries.py:79-85) ran no reader; Grafeo was given one id twice and kept
    # both. load now reads the text with the reader first (req:3.engine-reads-first).
    def test_load_refuses_an_id_repeated_in_one_text(self):
        with self.assertRaisesRegex(gp.ProfileError, "^line 3: unexpected 'INSERT' — "):
            gs.load("// graph: joined\n" + TWO_INSERTS)

    # Was a GAP, open after PR #36 too. compute() loaded each block of a recipe into its graph
    # (fill.py:58-65) with no reader. So an id written in two blocks of one graph gave a state
    # hash for a graph of two nodes with one id. Nothing was refused. compute now reads the
    # recipe's blocks together with the reader first, in their graphs (req:3.engine-reads-first).
    def test_compute_refuses_an_id_repeated_across_two_blocks_of_one_graph(self):
        text = (
            "## A\n```gql\n// graph: g\n(a:Person {name: 'A'})\n```\n"
            "## B\n```gql\n// graph: g\n(b:Person {id: 'a', name: 'B'})\n```\n"
        )
        with self.assertRaisesRegex(
            gp.ProfileError, "^line 2: id 'a' is already a node in graph g — "
        ):
            compute({"load": ["#A", "#B"], "state_of": "g"}, text, ".", ".")

    def test_fill_check_reports_the_reader_s_refusal_as_it_reports_a_refused_recipe(self):
        text = (
            "## A\n```gql\n// graph: g\n(a:Person {name: 'A'})\n```\n"
            "## B\n```gql\n// graph: g\n(b:Person {id: 'a', name: 'B'})\n```\n"
            "```yaml\n# fill\nSTATE: {load: ['#A', '#B'], state_of: g, value: 0123456789abcdef}\n"
            "```\nmade against 0123456789abcdef\n"
        )
        problems = gs.fill_check(text, ".", ".")
        self.assertTrue(
            any(n == "*" and "id 'a' is already a node in graph g" in p for n, p in problems),
            problems,
        )

    # Was a GAP, open after PR #36 too. graph_spec.check_changeset is the engine's
    # (changesets.py:141), and loaded each base text with no reader (:173). An id in two base
    # blocks of one graph was never named; only §18's rebuild failed, with "see the rule in the
    # graph spec model". The base is now read with the reader first (req:3.engine-reads-first).
    def test_check_changeset_refuses_an_id_repeated_across_two_base_blocks(self):
        base = [
            ("g", "// graph: g\n(a:Person {name: 'A'})"),
            ("g", "// graph: g\n(b:Person {id: 'a', name: 'B'})"),
        ]
        block = f"// graph: g · CHANGE SET cs1 · against {state_hash(base)} · by a\n(c:Person)"
        self.assertTrue(names_the_id(gs.check_changeset(base, block)[0], "a"))

    # Was a GAP, open after PR #36 too. Take a change set that writes a new node with an id the
    # base already holds (changesets.py:213). It passed "it only adds", since _state keys nodes by
    # id (:74-80). graph_rules.check_changeset runs the reader, and refuses it as "id 'a' is
    # already a node". The engine's now reads the change set with the reader too, on its base.
    def test_check_changeset_refuses_a_change_set_reusing_a_base_id(self):
        base = [("g", "// graph: g\n(a:Person {name: 'A'})")]
        block = (
            f"// graph: g · CHANGE SET cs1 · against {state_hash(base)} · by a\n"
            "(b:Person {id: 'a', name: 'A'})"
        )
        self.assertTrue(names_the_id(gs.check_changeset(base, block)[0], "a"))

    # Review of #37. The reader reads a base text in the graph its own first line names. Grafeo
    # reads it in the graph its tuple gives. So a base text naming h, given as g, was read in a
    # graph Grafeo never loaded it into. The reused id was not refused, and failed later as
    # "changed ['a']".
    def test_check_changeset_refuses_a_base_text_whose_first_line_names_another_graph(self):
        base = [("g", "// graph: h\n(a:Person {name: 'A'})")]
        block = (
            f"// graph: g · CHANGE SET cs1 · against {state_hash(base)} · by a\n"
            "(b:Person {id: 'a'})"
        )
        results = gs.check_changeset(base, block)[0]
        said = "line 1: the block names graph h, but the base gives it as graph g"
        self.assertTrue(any(not ok and said in fix for _, ok, fix in results), results)

    def test_the_reader_based_check_changeset_refuses_a_change_set_reusing_a_base_id(self):
        import graph_rules as gr

        base = [("g", "// graph: g\n(a:Person {name: 'A'})")]
        block = (
            f"// graph: g · CHANGE SET cs1 · against {state_hash(base)} · by a\n"
            "(b:Person {id: 'a', name: 'A'})"
        )
        self.assertTrue(names_the_id(gr.check_changeset(base, block)[0], "a"))


class ValidateComesAfterGrafeo(unittest.TestCase):
    """Question 4: parse, then normalise, then validate — validate is given a document whose
    nodes are already keyed by id."""

    # GAP. By the time validate() runs (breaches.py:108), parse has keyed nodes by id
    # (reading.py:107). The second node is gone. validate logs nothing, so the repeat is
    # silently wrong data, not a reported problem. Since req:3.engine-reads-first, parse refuses
    # this block with the reader before validate is reached. So it still fails here, by that
    # refusal. validate itself is unchanged.
    @unittest.expectedFailure
    def test_validate_reports_an_id_repeated_in_one_document(self):
        log = []
        config = gs.config_from(None)
        doc = gs.normalise(parse_block(TWO_INSERTS), log, config)
        gs.validate(doc, log, config)
        self.assertTrue(any("x" in str(row) for row in log))


class OneIdInTwoDocumentsOfAJoin(unittest.TestCase):
    """Question 5, kept apart from the repeats: one id in different documents of a join is meant
    to be one thing (§21), joined by union (union.py:20-136)."""

    def joined(self, first, second):
        log = []
        config = gs.config_from(None)
        docs = []
        for doc, body in (("doc:one", first), ("doc:two", second)):
            d = gs.normalise(parse_block(body, doc), log, config)
            gs.validate(d, log, config)
            docs.append(d)
        return gs.join(docs, config)

    def test_one_id_in_two_documents_joins_as_one_thing_stated_in_both(self):
        j = self.joined("(x:Person {name: 'A'})", "(x:Person {name: 'A'})")
        self.assertEqual(list(j["nodes"]), ["x"])
        self.assertEqual(j["nodes"]["x"]["stated_in"], ["doc:one", "doc:two"])
        self.assertEqual(j["nodes"]["x"]["props"]["name"], "A")

    def test_one_id_with_two_values_in_two_documents_is_contested_not_dropped(self):
        j = self.joined("(x:Person {name: 'A'})", "(x:Person {name: 'B'})")
        self.assertEqual(list(j["nodes"]), ["x"])
        self.assertIn("VALUE CONFLICT — contested", [r[4] for r in j["report"]])


if __name__ == "__main__":
    unittest.main()
