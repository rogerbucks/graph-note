"""req:3.reader-default — "A library must read a document with the portable reader unless its host
asks for an engine, and a GQL constraint with a named twin must run as that twin, whatever the
parser" (Roger, 11 Oct 2026: Grafeo is the reference engine, kept out of the plugin's chain).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_settings_reader_default
"""

import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
sys.path.insert(0, SRC)

import graph_spec as gs  # noqa: E402
from graphspec.engine import settings  # noqa: E402

DOCUMENT = (
    "```gql\n// graph: g · document doc:a · schema s1 · as of 2026-10-01\n"
    "(a:T {name: 'A'}),\n(b:T {name: 'B'}),\n(a)-[:KNOWS]->(b)\n```\n"
)
WITH_TWIN = {"why": "one start", "gql": "MATCH (s) RETURN s", "reference": "one-start"}
NO_TWIN = {"why": "any state", "gql": "MATCH (s) RETURN s"}

# parse() in a fresh interpreter in which Grafeo cannot be imported, with no parser set
WITHOUT_GRAFEO = """
import sys
sys.modules["grafeo"] = None  # importing it raises ImportError
sys.path.insert(0, sys.argv[1])
import graph_spec as gs
doc = gs.parse(sys.argv[2])
print(doc["id"], sorted(doc["nodes"]), [e[1] for e in doc["raw_edges"]])
"""


class ReaderDefault(unittest.TestCase):
    def test_the_default_parser_is_the_reader(self):
        code = (
            f"import sys; sys.path.insert(0, {SRC!r}); "
            "from graphspec.engine import settings; print(settings.PARSER)"
        )
        out = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(out.stdout.strip(), "profile")

    def test_a_document_is_read_with_grafeo_not_installed(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "note.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write(DOCUMENT)
            r = subprocess.run(
                [sys.executable, "-c", WITHOUT_GRAFEO, SRC, path], capture_output=True, text=True
            )
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip(), "doc:a ['a', 'b'] ['KNOWS']")

    def test_a_gql_constraint_with_a_named_twin_runs_as_its_twin_whatever_the_parser(self):
        old = settings.PARSER
        try:
            for name in ("profile", "grafeo"):
                settings.PARSER = name
                got = gs.config_from({"constraints": [WITH_TWIN]})["constraints"]["one start"]
                self.assertIs(got, gs.RULES["one-start"], name)
        finally:
            settings.PARSER = old

    def test_a_gql_constraint_with_no_twin_is_still_run_as_gql(self):
        # database work: a constraint with no named twin needs the engine
        got = gs.config_from({"constraints": [NO_TWIN]})["constraints"]["any state"]
        self.assertNotIn(got, gs.RULES.values())


if __name__ == "__main__":
    unittest.main()
