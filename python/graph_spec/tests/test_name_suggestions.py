"""A name suggested for a thing written without one is the core's, word for word.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

unnamed_drawn_suggested (editor spec §4, Roger, 10 Oct 2026): every reader draws a thing written
without a name under the same suggested name, so the library suggests what the plugin's core
suggests (packages/core/src/name-suggestions.ts) — the same words, casing, length, numbering and
reserved words. Both are held to one table, name_cases.json, which the core's tests read too.
"""

import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import gql_profile as gp  # noqa: E402

with open(os.path.join(HERE, "name_cases.json"), encoding="utf-8") as f:
    TABLE = json.load(f)


class NameFromText(unittest.TestCase):
    def test_every_name_in_the_table(self):
        wrong = [
            (c["text"], c["names"], c["kind"], got, c["name"])
            for c in TABLE["from_text"]
            if (got := gp.name_from_text(c["text"], c["names"], c["kind"])) != c["name"]
        ]
        self.assertEqual(wrong, [])

    def test_every_style_in_the_table(self):
        wrong = [
            (c["names"], got)
            for c in TABLE["styles"]
            if (got := gp.name_style_of(c["names"])) != c["style"]
        ]
        self.assertEqual(wrong, [])

    def test_every_text_gives_the_words_in_the_table(self):
        wrong = [(t, got) for t, words in TABLE["words"] if (got := gp.name_words(t)) != words]
        self.assertEqual(wrong, [])

    def test_names_taken_may_be_any_iterable_or_a_mapping_of_name_to_kind(self):
        self.assertEqual(gp.name_from_text("Eyes", {"eyes"}), "eyes_2")
        self.assertEqual(gp.name_from_text("Eyes", iter(["eyes"])), "eyes_2")
        self.assertEqual(gp.name_from_text("Eyes", {"eyes": "Reason"}), "eyes_2")

    def test_whatever_the_text_the_name_is_one_the_reader_can_read(self):
        texts = ["Ünïcödé ½ thing", "  ", "日本語", "it's 100% (really)", "Set", "😀 smile", "42"]
        names = [gp.name_from_text(t, []) for t in texts]
        unreadable = [
            n
            for n in names
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", n) or n.upper() in gp.KEYWORDS
        ]
        self.assertEqual(unreadable, [])


if __name__ == "__main__":
    unittest.main()
