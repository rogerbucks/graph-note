"""The format a block is written in (graph spec §3; editor spec §27, format_version_named; risk
ARCH-4). A block may name its format on its graph line. The reader reads its own major format,
an older one, or none named. It refuses a newer major plainly, with GN106. The cases are shared
with the JavaScript reader (packages/graph-spec/test/format-version.test.mjs).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_format_version
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.reader.lexer import ProfileError  # noqa: E402
from graphspec.reader.store import Store  # noqa: E402

CASES_FILE = os.path.join(
    HERE, "..", "..", "..", "packages", "graph-spec", "test", "format-version-cases.json"
)
with open(CASES_FILE, encoding="utf-8") as f:
    CASES = json.load(f)


class FormatVersionNamed(unittest.TestCase):
    def test_each_shared_case(self):
        for c in CASES["cases"]:
            with self.subTest(c["name"]):
                store = Store()
                if "code" in c:
                    with self.assertRaises(ProfileError) as caught:
                        store.apply(c["block"])
                    self.assertEqual(caught.exception.code, c["code"])
                    self.assertIn("newer than this reader", str(caught.exception))
                    continue
                store.apply(c["block"])
                self.assertEqual(len(store.graph("g")["nodes"]), c["things"])

    def test_the_refusal_names_both_formats(self):
        with self.assertRaises(ProfileError) as caught:
            Store().apply("// graph: g · format 2.5\n(a:T)")
        self.assertIn("format 2.5", str(caught.exception))
        self.assertIn(f"format {CASES['reads']}", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
