"""Each setting a host assigns on graph_spec reaches graphspec/engine/settings.py, where the code
reads it when it runs — the settings test_settings.py does not cover: PARSER, NOTICES and
MATRIX_ROWS, and the forwarding itself.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests
"""

import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

# the library's modules are flat files in src/, importable only once it is on sys.path
import graph_spec as gs  # noqa: E402
from graphspec.engine import settings  # noqa: E402
from engine_support import needs_engine  # noqa: E402

NOTE = """| | Unmoderated | Public | Private |
|---|---|---|---|
| **Claude — conversation** | ❌ | ✅ | ⚠️ |
| **Local model** | ❌ | ✅ | ✅ |
"""

DOCUMENT = """# A note

```gql
// graph: notes · document doc:a · schema s1 · as of 2026-10-01
(a:Thing {name: 'one'})
```
"""

A_RULE = {"why": "one start", "gql": "MATCH (n) RETURN n", "reference": "one-start"}


class SettingsForwarded(unittest.TestCase):
    def setUp(self):
        self.kept = {n: getattr(settings, n) for n in settings.NAMES}

    def tearDown(self):
        for n, v in self.kept.items():
            setattr(gs, n, v)

    def test_every_setting_assigned_on_graph_spec_is_the_one_the_code_reads(self):
        for n in settings.NAMES:
            value = object()
            setattr(gs, n, value)
            self.assertIs(getattr(settings, n), value, n)
            self.assertIs(getattr(gs, n), value, n)

    @needs_engine
    def test_the_parser_a_host_names_is_the_one_used(self):
        gs.PARSER = "profile"
        self.assertIs(
            gs.config_from({"constraints": [A_RULE]})["constraints"]["one start"],
            gs.RULES["one-start"],
        )
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "note.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write(DOCUMENT)
            doc = gs.parse(path)
            self.assertEqual((doc["id"], sorted(doc["nodes"])), ("doc:a", ["a"]))
            # a host that asks for the engine has its documents read by Grafeo
            gs.PARSER = "grafeo"
            with mock.patch("graphspec.engine.documents.reading.grafeo") as engine:
                engine.GrafeoDB.side_effect = RuntimeError("Grafeo asked for")
                with self.assertRaisesRegex(RuntimeError, "Grafeo asked for"):
                    gs.parse(path)

    def test_notices_a_host_replaces_are_the_ones_written_to(self):
        fresh = []
        gs.NOTICES = fresh
        self.assertIs(settings.NOTICES, fresh)

    def test_the_matrix_rows_a_host_names_are_the_ones_read(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "classification.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write(NOTE)
            gs.MATRIX_ROWS = {"local": "Local model"}
            self.assertEqual(list(gs.destination_matrix(path)), ["local"])


if __name__ == "__main__":
    unittest.main()
