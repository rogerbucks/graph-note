"""Editor spec §42, problem_codes: every problem the Python drawing reader finds in a note or its
style graph carries a stable code, the same as the core's. The graph spec reader's own problems
keep its codes (packages/graph-spec/src/reader/problem-codes.json). What the drawing reader
finds beyond them takes a code from packages/core/src/drawing-problem-codes.json, which the
library never reads: each problem passes its code as a literal. The sources are scanned, so
every code passed is in a table, and every code the table gives Python is passed. The notes of
packages/core/test/drawing-problem-cases.json, which the core reads too
(packages/core/test/note-reading-codes.test.js), give their codes in order.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_drawing_problem_codes
"""

import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
sys.path.insert(0, SRC)

import graph_rules as gr  # noqa: E402
from graphspec.reader.drawing import read_for_drawing  # noqa: E402
from graphspec.style.reading import read_style  # noqa: E402

PACKAGES = os.path.join(HERE, "..", "..", "..", "packages")


def _json(*parts):
    with open(os.path.join(PACKAGES, *parts), encoding="utf-8") as f:
        return json.load(f)


TABLE = _json("core", "src", "drawing-problem-codes.json")
READER = _json("graph-spec", "src", "reader", "problem-codes.json")
CASES = _json("core", "test", "drawing-problem-cases.json")
BY_CODE = {c["code"]: c for c in TABLE["codes"]}
READER_CODES = {c["code"] for c in READER["codes"]}
CODE = re.compile(r"\"(GN[78]\d\d)\"")


def passed():
    """Every drawing reader code the library's sources pass as a literal, with where."""
    out = []
    for root, _, files in os.walk(SRC):
        for name in sorted(f for f in files if f.endswith(".py")):
            path = os.path.join(root, name)
            with open(path, encoding="utf-8") as f:
                text = f.read()
            for m in CODE.finditer(text):
                line = text[: m.start()].count("\n") + 1
                out.append((f"{os.path.relpath(path, SRC)}:{line}", m.group(1)))
    return out


class DrawingProblemCodes(unittest.TestCase):
    # a plain loop, never subTest: the tests-first replay counts a test by its own result

    def test_every_code_passed_is_one_the_table_gives_python(self):
        bad = [
            f"{where} {code}"
            for where, code in passed()
            if "py" not in BY_CODE.get(code, {}).get("libraries", [])
        ]
        self.assertEqual(bad, [])

    def test_every_code_the_table_gives_python_is_passed(self):
        used = {code for _, code in passed()}
        ours = [c["code"] for c in TABLE["codes"] if "py" in c["libraries"]]
        self.assertEqual([code for code in ours if code not in used], [])

    def test_every_case_gives_its_codes_in_order_as_the_core_does(self):
        ours = [c for c in CASES["cases"] if "py" in c["readers"]]
        self.assertGreaterEqual(len(ours), 5)
        wrong = []
        for c in ours:
            for code in c["codes"]:
                self.assertTrue(code in BY_CODE or code in READER_CODES, f"{c['name']}: {code}")
            store, problems = read_for_drawing(c["blocks"])
            if c.get("style"):
                problems = read_style(c["blocks"], c["style"], gr.World.from_store(store))[1]
            got = [p.get("code") for p in problems]
            if got != c["codes"]:
                wrong.append(f"{c['name']}: {got}")
        self.assertEqual(wrong, [])


if __name__ == "__main__":
    unittest.main()
