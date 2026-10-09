"""The readings guessed for a relationship type that has none declared.

Vault task "Fix the lock guessing reverse readings for types ending in a preposition" (found
6 Oct 2026); one guess in the libraries, as decided 7 Oct. Forward and reverse, from the type's own
words. The cases are packages/graph-spec/test/reading-cases.json, which the JavaScript library
answers the same: packages/graph-spec/test/graph-spec-check-readings.test.mjs.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests
"""

import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import graph_rules as gr  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "reading-cases.json"), encoding="utf-8"
) as f:
    CASES = json.load(f)["cases"]


class GuessedReadings(unittest.TestCase):
    def test_every_type_in_the_shared_table_reads_as_the_table_says(self):
        for kind, reading, reverse in CASES:
            self.assertEqual(gr.guess_readings(kind), (reading, reverse), kind)

    # the cases found on 6 Oct 2026: the vault's lock wrote "is proved by by", "is part of by" and
    # "is decided in by"; the plugin's wrote "inverse of …" for all three
    def test_proved_by_reads_is_proved_by_and_back_proves(self):
        self.assertEqual(gr.guess_readings("PROVED_BY"), ("is proved by", "proves"))

    def test_part_of_reads_is_part_of_and_back_contains(self):
        self.assertEqual(gr.guess_readings("PART_OF"), ("is part of", "contains"))

    def test_decided_in_reads_was_decided_in_and_back_decides(self):
        self.assertEqual(gr.guess_readings("DECIDED_IN"), ("was decided in", "decides"))

    def test_no_guessed_reverse_ever_ends_in_a_doubled_preposition(self):
        for kind, _, _ in CASES:
            self.assertIsNone(re.search(r"\b(\w+) \1$", gr.guess_readings(kind)[1]), kind)


if __name__ == "__main__":
    unittest.main()
