"""Every hash names its algorithm, and a record sealed by its hash cannot change unseen (editor
spec §51, spec_hashes_named; requirements/hashes.md).

The cases are packages/graph-spec/test/hash-cases.json, the table the JavaScript library's
hashes.test.mjs runs too. Grafeo gives the same verdict, and a change set made against a bare
state is refused by both.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_hashes_named
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
import graph_spec as gs  # noqa: E402
from engine_support import needs_engine  # noqa: E402
from graphspec.engine import settings  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "hash-cases.json"), encoding="utf-8"
) as f:
    TABLE = json.load(f)

NOTE = os.path.join(HERE, "agreement", "classification.md")
NAMED_STATE = (
    "the state it was made against names its algorithm: against sha-256-64:<digits> "
    "(editor spec §51)"
)
LIBRARY = """// graph: library
(t_book:ElementType {id: 'type:Book', name: 'Book', kind: 'node'}),
(meta:GraphMeta {id: 'meta:library', graph: 'library', schema: 'library@1'}),
(meta)-[:DECLARES]->(t_book),
(notes:Book {title: 'Notes on the engine'})"""


def blocks_of(case):
    return ["\n".join(TABLE["data"]), "\n".join(case["body"])]


def verdicts(rows, case):
    """{rule: [ok, ...]} for each rule the case names, from rows of (label, ok, detail)."""
    return {
        rule: [ok for label, ok, _ in rows if label == TABLE["rules"][rule]]
        for rule in case["holds"]
    }


def expected(case):
    return {rule: [holds] for rule, holds in case["holds"].items()}


class HashesNamed(unittest.TestCase):
    def test_every_case_is_checked_as_the_table_says(self):
        for c in TABLE["cases"]:
            with self.subTest(case=c["name"]):
                st = gp.Store()
                for b in blocks_of(c):
                    st.apply(b)
                rows = gr.check(gr.World.from_store(st), "jud", {})
                self.assertEqual(verdicts(rows, c), expected(c))

    @needs_engine
    def test_grafeo_gives_the_same_verdict(self):
        old = settings.CLASSIFICATION_NOTE
        settings.CLASSIFICATION_NOTE = NOTE  # the serving rules read the destination matrix
        self.addCleanup(setattr, settings, "CLASSIFICATION_NOTE", old)
        for c in TABLE["cases"]:
            with self.subTest(case=c["name"]):
                db = gs.grafeo.GrafeoDB()
                st = gp.Store()
                for b in blocks_of(c):
                    g = b.split("\n")[0].split(": ")[1]
                    db.execute(f"CREATE GRAPH {g}")
                    st.apply(b)
                    db.set_graph(g)
                    db.execute(gs.strip(st.corrected(b)))
                db.set_graph("jud")
                rows = gs.judgements_rules(db, "jud", ["loans", "jud"]) + gs.served_rules(
                    db, "jud"
                )
                self.assertEqual(verdicts(rows, c), expected(c))


class StateNamed(unittest.TestCase):
    """A change set's header names the algorithm of the state it was made against."""

    def outcomes(self, named):
        st = gp.Store()
        st.apply(LIBRARY)
        now = gp.canon(st, "library")[0][:16]
        state = f"sha-256-64:{now}" if named else now
        head = f"// graph: library · CHANGE SET cs · against {state} · by ada"
        block = head + "\n(more:Book {title: 'More'})"
        old = settings.PARSER
        try:
            for parser in ("profile", "grafeo"):
                settings.PARSER = parser
                res, h, _ = gs.check_changeset([("library", LIBRARY)], block)
                yield parser, [ok for label, ok, _ in res if label == NAMED_STATE], h, now
        finally:
            settings.PARSER = old

    @needs_engine
    def test_a_named_state_holds_and_is_read_as_its_digits(self):
        for parser, oks, h, now in self.outcomes(True):
            self.assertEqual(oks, [True], parser)
            self.assertEqual(h["against"], now, parser)

    @needs_engine
    def test_a_bare_state_is_refused(self):
        for parser, oks, _, _ in self.outcomes(False):
            self.assertEqual(oks, [False], parser)


if __name__ == "__main__":
    unittest.main()
