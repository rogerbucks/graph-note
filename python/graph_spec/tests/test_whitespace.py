"""Whitespace is what GQL names (graph spec §3), in every reader: inside strings it is kept as
written, and between items and before keywords it parts them, as a space does. Each row is read
by the Python library and by the JavaScript library, live, and both must give the same graph.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

Plain loops, not subTest: the tests-first replay counts a test, never a sub-test.
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
import graph_rules as gr  # noqa: E402
from graphspec.reader.whitespace import SPACE  # noqa: E402

NBSP = "\N{NO-BREAK SPACE}"
LS = "\N{LINE SEPARATOR}"
PS = "\N{PARAGRAPH SEPARATOR}"
MVS = "\N{MONGOLIAN VOWEL SEPARATOR}"
BOM = "\N{ZERO WIDTH NO-BREAK SPACE}"
NEL = "\x85"
FS = "\x1c"
HEAD = "// graph: ws\n"

STRINGS = [NBSP, LS, PS, MVS, BOM, NEL, FS]
BEFORE_KEYWORDS = [NBSP, LS, PS, MVS]


def canon_py(blocks):
    st = gp.Store()
    for b in blocks:
        st.apply(b)
    return gr.canon(gr.World.from_store(st)["ws"])


def canon_js(rows):
    """The JavaScript library's canonical hash of graph ws, for each list of blocks."""
    script = (
        "const C = require(process.argv[1]);"
        "const rows = JSON.parse(require('fs').readFileSync(0, 'utf8'));"
        "process.stdout.write(JSON.stringify(rows.map((b) =>"
        " C.canon(C.worldFromStore(C.read(b)).ws))));"
    )
    out = subprocess.run(
        [
            "node",
            "-e",
            script,
            os.path.join(ROOT, "packages", "graph-spec", "src", "graph-spec-check.js"),
        ],
        input=json.dumps(rows),
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


def same_in_both(test, rows, plain):
    """Each row reads, in Python and in JavaScript, as its plainly written twin does."""
    js = canon_js(rows)
    wrong = []
    for blocks, twin, got_js in zip(rows, plain, js):
        got_py, want = canon_py(blocks), canon_py(twin)
        if not (got_py == got_js == want):
            wrong.append(ascii(blocks))
    test.assertEqual(wrong, [])


class InsideStrings(unittest.TestCase):
    def test_whitespace_and_what_is_not_whitespace_are_kept_as_written_inside_a_string(self):
        wrong = []
        for c in STRINGS:
            st = gp.Store()
            st.apply(f"{HEAD}(a:T {{name: 'x{c}y'}})")
            name = next(iter(st.graphs["ws"]["nodes"].values()))["props"]["name"]
            if name != f"x{c}y":
                wrong.append(ascii(c))
        self.assertEqual(wrong, [])
        rows = [[f"{HEAD}(a:T {{name: 'x{c}y'}})"] for c in STRINGS]
        self.assertEqual([canon_py(r) for r in rows], canon_js(rows))


class BetweenItems(unittest.TestCase):
    def test_every_whitespace_character_parts_items_as_a_space_does(self):
        rows = [
            [f"{HEAD}(a:T {{name: 'A'}}),{c}(b:T {{name: 'B'}}),{c}(a)-[:R]->(b)"] for c in SPACE
        ]
        plain = [[f"{HEAD}(a:T {{name: 'A'}}), (b:T {{name: 'B'}}), (a)-[:R]->(b)"]] * len(rows)
        same_in_both(self, rows, plain)


class BeforeKeywords(unittest.TestCase):
    def test_whitespace_before_match_insert_and_set_parts_them_as_a_space_does(self):
        first = f"{HEAD}(a:T {{name: 'A'}})"
        rows = [
            [
                first,
                f"{HEAD}{c}MATCH{c}(a:T {{id: 'a'}})\n{c}INSERT{c}(b:T {{name: 'B'}}),\n"
                f"(b)-[:R]->(a)\n{c}SET{c}a.seen = TRUE",
            ]
            for c in BEFORE_KEYWORDS
        ]
        plain = [
            [
                first,
                f"{HEAD}MATCH (a:T {{id: 'a'}})\nINSERT (b:T {{name: 'B'}}),\n"
                "(b)-[:R]->(a)\nSET a.seen = TRUE",
            ]
        ] * len(rows)
        same_in_both(self, rows, plain)


if __name__ == "__main__":
    unittest.main()
