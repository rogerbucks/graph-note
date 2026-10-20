"""graph_spec checks with the reader (req:3.reader-default, req:14.no-engine-install): a change
set's dry run, and the rules on a graph, run on the reader's reading unless the host asks for the
engine — held to the engine's outcome, and run with Grafeo not installed.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_changesets
"""

import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
sys.path.insert(0, SRC)
sys.path.insert(0, HERE)

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
import graph_spec as gs  # noqa: E402
from engine_support import needs_engine  # noqa: E402
from graphspec.engine import settings  # noqa: E402

BASE = """// graph: library
(t_book:ElementType {id: 'type:Book', name: 'Book', kind: 'node'}),
(t_person:ElementType {id: 'type:Person', name: 'Person', kind: 'node'}),
(t_wrote:ElementType {id: 'type:WROTE', name: 'WROTE', kind: 'edge', reading: 'wrote',
  reverse_name: 'written by'}),
(meta:GraphMeta {id: 'meta:library', graph: 'library', schema: 'library@1'}),
(meta)-[:DECLARES]->(t_book), (meta)-[:DECLARES]->(t_person), (meta)-[:DECLARES]->(t_wrote),
(ada:Person {name: 'Ada'}),
(notes:Book {title: 'Notes on the engine'}),
(ada)-[:WROTE]->(notes)"""


def state():
    st = gp.Store()
    st.apply(BASE)
    return gp.canon(st, "library")[0][:16]


def sets():
    """A change set made against the base's state, one against an old state, and one adding a
    kind the schema does not declare."""
    head = "// graph: library · CHANGE SET {} · against sha-256-64:{} · by ada\n"
    return [
        head.format("cs1", state())
        + "(more:Book {title: 'A second book'}),\n(ada)-[:WROTE]->(more)",
        head.format("cs2", "0000000000000000") + "(late:Book {title: 'Too late'})",
        head.format("cs3", state()) + "(map:Atlas {title: 'Undeclared'})",
    ]


def outcome(results):
    res, h, after = results
    return sorted(label for label, ok, _ in res if not ok), (h or {}).get("id"), after


class ChecksReadPlain(unittest.TestCase):
    def test_a_change_set_and_a_graph_are_checked_with_grafeo_not_installed(self):
        code = (
            "import sys\nsys.modules['grafeo'] = None\n"
            f"sys.path.insert(0, {SRC!r}); sys.path.insert(0, {HERE!r})\n"
            "import graph_spec as gs, test_changesets as t\n"
            "for s in t.sets():\n"
            "    failed, cs, after = t.outcome(gs.check_changeset([('library', t.BASE)], s))\n"
            "    print(cs, failed, after is not None)\n"
            "import gql_profile as gp, graph_rules as gr\n"
            "st = gp.Store(); st.apply(t.BASE)\n"
            "print(all(ok for _, ok, _ in gs.graph_rules(gr.World.from_store(st), 'library',"
            " ['library'])))\n"
        )
        r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        lines = r.stdout.splitlines()
        self.assertEqual(lines[0], "cs1 [] True")
        self.assertTrue(lines[1].startswith("cs2 ['") and lines[1].endswith("True"), lines[1])
        self.assertTrue(lines[2].startswith("cs3 ['after it, §5"), lines[2])
        self.assertEqual(lines[3], "True")

    @needs_engine
    def test_the_reader_s_dry_run_reaches_the_engine_s_outcome(self):
        old = settings.PARSER
        try:
            got = {}
            for parser in ("profile", "grafeo"):
                settings.PARSER = parser
                got[parser] = [outcome(gs.check_changeset([("library", BASE)], s)) for s in sets()]
        finally:
            settings.PARSER = old
        self.assertEqual(got["profile"], got["grafeo"])

    @needs_engine
    def test_the_rules_on_the_reader_s_reading_are_the_engine_s(self):
        st = gp.Store()
        st.apply(BASE)
        db = gs.load(BASE.replace("// graph: library", "// graph: joined"))
        ours = gs.graph_rules(gr.World.from_store(st), "library", ["library"])
        theirs = gs.graph_rules(db, "joined", ["joined"])
        self.assertEqual([(a, b) for a, b, _ in ours], [(a, b) for a, b, _ in theirs])


SESSION = (
    "its author is the session that sent it, not a name written in its header (editor spec §51)"
)
WITH_MODEL = BASE.replace(
    "(ada:Person {name: 'Ada'}),",
    "(t_model:ElementType {id: 'type:Model', name: 'Model', kind: 'node'}),\n"
    "(meta)-[:DECLARES]->(t_model),\n(ada:Person {name: 'Ada'}),\n(bot:Model {name: 'Drafter'}),",
)


def signed(by):
    """A change set adding one book, its header naming by."""
    st = gp.Store()
    st.apply(WITH_MODEL)
    now = gp.canon(st, "library")[0][:16]
    head = f"// graph: library · CHANGE SET cs · against sha-256-64:{now} · by {by}"
    return head + "\n(more:Book {title: 'More'})"


class AuthorFromSession(unittest.TestCase):
    """editor spec §51, spec_author_from_session (GS4): who wrote a change set is the session that
    sent it, as packages/graph-spec/test/changesets.test.mjs holds the JavaScript checker to."""

    def outcomes(self, by, session):
        old = settings.PARSER
        try:
            for parser in ("profile", "grafeo"):
                settings.PARSER = parser
                yield (
                    parser,
                    gs.check_changeset([("library", WITH_MODEL)], signed(by), session=session),
                )
        finally:
            settings.PARSER = old

    @needs_engine
    def test_a_model_s_set_naming_a_person_is_recorded_as_the_model_s(self):
        for parser, (res, h, _) in self.outcomes("ada", "bot"):
            self.assertEqual((h["by"], h["claimed"]), ("bot", "ada"), parser)
            self.assertIn(SESSION, [label for label, ok, _ in res if not ok], parser)

    @needs_engine
    def test_a_header_naming_the_session_passes(self):
        for parser, (res, h, _) in self.outcomes("bot", "bot"):
            self.assertEqual([label for label, ok, _ in res if not ok], [], parser)
            self.assertIn((SESSION, True), [(label, ok) for label, ok, _ in res], parser)
            self.assertNotIn("claimed", h, parser)


if __name__ == "__main__":
    unittest.main()
