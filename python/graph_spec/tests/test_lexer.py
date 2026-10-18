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
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import gql_profile as gp  # noqa: E402
from graphspec.reader.lexer import header, tokens  # noqa: E402

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


def one_line(n):
    """A data block of n things, all on its one line."""
    return "// graph: g\n" + ", ".join(f"(n{i}:T {{name: 'x'}})" for i in range(n))


def seconds(f, arg):
    """The processor time f(arg) takes: time spent waiting for the processor, which a loaded
    machine adds more of to a longer run, is not counted."""
    start = time.process_time()
    f(arg)
    return time.process_time() - start


class OneLongLine(unittest.TestCase):
    """A broken block is re-read up to the shared budget (editor spec §9), so a slow read of one
    long line is paid many times over: the reader's time must grow with the line's length, not
    with its square."""

    def test_a_line_four_times_as_long_is_read_in_about_four_times_the_time(self):
        short, long = one_line(2000), one_line(8000)
        # Timed against each other in the same run, never against a fixed time. Processor time,
        # so waiting on a loaded machine is not counted. The fastest of several runs, taken in
        # turn. Linear reading gives a ratio of about 4, quadratic about 16.
        t_short = t_long = float("inf")
        for _ in range(5):
            t_short = min(t_short, seconds(tokens, short))
            t_long = min(t_long, seconds(tokens, long))
        self.assertLess(
            t_long / t_short,
            1.5 * len(long) / len(short),
            f"{len(short)} characters took {t_short * 1000:.0f} ms, "
            f"{len(long)} took {t_long * 1000:.0f} ms",
        )


if __name__ == "__main__":
    unittest.main()
