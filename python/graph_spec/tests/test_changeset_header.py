"""changeset_header — the first line of a change set (§24) — is read as the reader reads a block's
first line (§3): lines end at LF only, and whitespace is GQL's set (reader/whitespace.py), neither
U+0085 nor U+180E taken for what the language takes them for. Both copies are held to it:
the engine's (graph_spec.changeset_header) and the rules' (graph_rules.changeset_header).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_changeset_header
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import graph_rules as gr  # noqa: E402
import graph_spec as gs  # noqa: E402

HEADER = "// graph: g · CHANGE SET cs1 · against 0123456789abcdef · by a"
READ = {"graph": "g", "id": "cs1", "against": "0123456789abcdef", "by": "a"}

# built with chr(), so no editor or tool can read the source's own text as a line end
NEXT_LINE = chr(0x85)  # not whitespace to GQL
LINE_SEPARATOR = chr(0x2028)  # whitespace to GQL, though str.splitlines() ends a line at it
NO_BREAK_SPACE = chr(0xA0)
MONGOLIAN_VOWEL_SEPARATOR = chr(0x180E)  # whitespace to GQL, though str.isspace() says not


class ReadsTheFirstLineAsTheReaderDoes:
    """The tests; each copy's class names the function it holds to them."""

    def read(self, block):
        raise NotImplementedError

    def test_a_plain_header_is_read(self):
        self.assertEqual(self.read(HEADER + "\n(a:Person {id: 'a'})"), READ)

    def test_a_first_line_holding_only_u0085_is_the_header_line_so_there_is_no_header(self):
        # U+0085 is not whitespace to GQL, so that line is not blank: it is the first line
        self.assertIsNone(self.read(NEXT_LINE + "\n" + HEADER))

    def test_u0085_before_the_slashes_is_not_whitespace_so_there_is_no_header(self):
        self.assertIsNone(self.read(NEXT_LINE + HEADER))

    def test_u2028_before_the_header_is_whitespace_and_the_header_is_read(self):
        self.assertEqual(self.read(LINE_SEPARATOR + HEADER), READ)

    def test_a_no_break_space_before_the_header_is_whitespace_and_the_header_is_read(self):
        self.assertEqual(self.read(NO_BREAK_SPACE + HEADER), READ)

    def test_a_first_line_holding_only_u2028_is_blank_and_the_next_line_is_the_header(self):
        self.assertEqual(self.read(LINE_SEPARATOR + "\n" + HEADER), READ)

    def test_u180e_before_the_header_is_whitespace_to_gql_and_the_header_is_read(self):
        self.assertEqual(self.read(MONGOLIAN_VOWEL_SEPARATOR + HEADER), READ)


class EngineChangesetHeader(ReadsTheFirstLineAsTheReaderDoes, unittest.TestCase):
    def read(self, block):
        return gs.changeset_header(block)


class RulesChangesetHeader(ReadsTheFirstLineAsTheReaderDoes, unittest.TestCase):
    def read(self, block):
        return gr.changeset_header(block)


if __name__ == "__main__":
    unittest.main()
