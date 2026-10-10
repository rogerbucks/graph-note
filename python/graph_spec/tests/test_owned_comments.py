"""The comments an element owns (graph spec §26 notes, §27 tagged comments): /// note lines and
//@ key: value lines, owned by the element on the line directly below them. The cases are
packages/graph-spec/test/owned-comment-cases.json, which the JavaScript library answers the same
(packages/graph-spec/test/owned-comments.test.mjs), so both readers read the same //@ lines and
notes from the same text (§26 and §27, "Two readers, one answer").

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests/test_owned_comments.py
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import gql_profile as gp  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "owned-comment-cases.json"),
    encoding="utf-8",
) as f:
    CASES = json.load(f)["cases"]

NONE = {"owned": [], "unowned": [], "malformed": []}


class OwnedComments(unittest.TestCase):
    def test_every_case_in_the_shared_table_reads_as_the_table_says(self):
        for c in CASES:
            with self.subTest(c["name"]):
                self.assertEqual(
                    gp.owned_comments(c["block"]),
                    {"owned": c["owned"], "unowned": c["unowned"], "malformed": c["malformed"]},
                )

    def test_a_query_block_or_an_excerpt_owns_nothing_and_is_not_refused(self):
        q = "// graph: g · QUERY\n//@ colour: orange\nMATCH (a) RETURN a"
        self.assertEqual(gp.owned_comments(q), NONE)
        self.assertEqual(gp.owned_comments("// excerpt\n//@ colour: orange\n(a:T)"), NONE)


if __name__ == "__main__":
    unittest.main()
