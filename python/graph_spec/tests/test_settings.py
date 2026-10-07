"""What a host sets after importing the library — the settings that once named one installation's
files and machines.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

The library names no machine, person or place: a joined graph is stamped with neutral defaults
until the host sets its own, the classification note is read only from a path the host gives, and
projected instants are written at a fixed UTC+10, as the JavaScript library writes them.
"""

import datetime as dt
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import graph_rules as gr  # noqa: E402
import graph_spec as gs  # noqa: E402

NOTE = """# Information classification

| | Unmoderated | Public | Private |
|---|---|---|---|
| **Claude — conversation** | ❌ | ✅ | ⚠️ |
| **Local model** | ❌ | ✅ | ✅ |

| 1 | **Private** | |
| 2 | **Public** | |
"""


def empty_join():
    return {
        "nodes": {},
        "edges": {},
        "claims": {},
        "pairs": [],
        "paradoxes": [],
        "findings": [],
        "esrc": {},
    }


class Settings(unittest.TestCase):
    def tearDown(self):
        gs.CLASSIFICATION_NOTE, gs.OWNER_ENGINE, gs.WRITTEN_BY = None, "engine:local", "graph-spec"

    def test_a_joined_graph_is_stamped_with_neutral_defaults(self):
        text = gs.emit(empty_join(), [], gs.config())
        self.assertIn("owner_engine: 'engine:local', written_by: 'graph-spec'", text)

    def test_a_host_stamps_its_own_engine_and_author(self):
        gs.OWNER_ENGINE, gs.WRITTEN_BY = "engine:host", "someone@host"
        self.assertIn(
            "owner_engine: 'engine:host', written_by: 'someone@host'",
            gs.emit(empty_join(), [], gs.config()),
        )

    def test_no_classification_note_is_read_until_a_host_names_one(self):
        self.assertIsNone(gs.CLASSIFICATION_NOTE)
        with self.assertRaisesRegex(ValueError, "CLASSIFICATION_NOTE"):
            gs.destination_matrix()
        with self.assertRaisesRegex(ValueError, "CLASSIFICATION_NOTE"):
            gs.class_order()

    def test_the_classification_note_a_host_names_is_read(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "classification.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write(NOTE)
            gs.CLASSIFICATION_NOTE = path
            self.assertEqual(
                gs.destination_matrix(),
                {
                    "cloud": {"Unmoderated": "no", "Public": "yes", "Private": "conditional"},
                    "local": {"Unmoderated": "no", "Public": "yes", "Private": "yes"},
                },
            )
            self.assertEqual(gs.class_order(), ["Private", "Public"])
            self.assertTrue(gs.may_serve("local", "Private"))
            self.assertFalse(gs.may_serve("cloud", "Private"))

    def test_instants_are_projected_at_utc_plus_ten(self):
        instant = dt.datetime(2026, 10, 7, 8, 30)  # UTC, as the reader keeps it
        self.assertEqual(gr._iso(instant), "2026-10-07T18:30:00+10:00")
        self.assertEqual(gs.iso(instant), "2026-10-07T18:30:00+10:00")

    def test_old_instants_too_with_no_summer_time(self):
        instant = dt.datetime(
            1990, 1, 15, 0, 0
        )  # a summer when one zone at UTC+10 kept daylight saving
        self.assertEqual(gr._iso(instant), "1990-01-15T10:00:00+10:00")
        self.assertEqual(gs.iso(instant), "1990-01-15T10:00:00+10:00")


if __name__ == "__main__":
    unittest.main()
