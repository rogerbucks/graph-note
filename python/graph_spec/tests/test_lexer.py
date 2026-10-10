"""The lexer reads a block as the JavaScript reader does: its digits and word boundaries are ASCII,
as JavaScript's \\d and \\b are, so a digit in another script is not a number and a letter in
another script ends no keyword (graph spec §3).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests
"""

import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import gql_profile as gp  # noqa: E402
from graphspec.reader.lexer import header  # noqa: E402

BLOCKS = [
    "// graph: g\n(a:T {n: \N{ARABIC-INDIC DIGIT THREE}})",
    "// graph: g\n(a:T {n: 1\N{ARABIC-INDIC DIGIT THREE}})",
]
HEADERS = [
    "// graph: g · QUERY\N{LATIN SMALL LETTER E WITH ACUTE}",
    "// graph: g · excerpt\N{LATIN SMALL LETTER E WITH ACUTE}",
    "// graph: g · CHANGE SET\N{LATIN SMALL LETTER E WITH ACUTE} c1",
]


def javascript(blocks, headers):
    """What the JavaScript reader makes of each block and each header line."""
    script = (
        "const gs = require(process.argv[1]);"
        "const q = JSON.parse(require('fs').readFileSync(0, 'utf8'));"
        "const read = (b) => { try { new gs.Store().apply(b); return null; }"
        " catch (e) { return String(e.message); } };"
        "process.stdout.write(JSON.stringify({blocks: q.blocks.map(read),"
        " headers: q.headers.map((h) => gs.header(h)[1])}));"
    )
    out = subprocess.run(
        ["node", "-e", script, os.path.join(ROOT, "packages", "graph-spec")],
        input=json.dumps({"blocks": blocks, "headers": headers}),
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


def python_read(block):
    try:
        gp.Store().apply(block)
        return None
    except Exception as e:
        return str(e)


class AsciiAsJavaScriptReadsIt(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.js = javascript(BLOCKS, HEADERS)

    def test_a_digit_in_another_script_is_not_a_number(self):
        self.assertEqual([python_read(b) for b in BLOCKS], self.js["blocks"])
        self.assertTrue(all(self.js["blocks"]), "the JavaScript reader refuses each")

    def test_a_letter_in_another_script_ends_no_keyword(self):
        self.assertEqual([header(h)[1] for h in HEADERS], self.js["headers"])


if __name__ == "__main__":
    unittest.main()
