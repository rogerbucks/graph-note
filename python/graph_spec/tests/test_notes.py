"""Notes on things and links (editor spec §24): the lines of exactly three slashes directly above a
thing or a link, read by notes() into each note's text, CommonMark for the host to render, and its
summary, and the lines holding more than one thing that a note above belongs to none of. The cases
are packages/graph-spec/test/owned-comment-cases.json, which the JavaScript library reads alike
(packages/graph-spec/test/notes.test.js), and the JavaScript reader is also run live here on every
case, so both readers read the same notes from the same text (note_both_readers).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests/test_notes.py
"""

import json
import os
import shutil
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CASES_FILE = os.path.join(ROOT, "packages", "graph-spec", "test", "owned-comment-cases.json")
CHECKER = os.path.join(ROOT, "packages", "graph-spec", "src", "graph-spec-check.js")
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

# the library's modules are flat files in src/, importable only once it is on sys.path
import gql_profile as gp  # noqa: E402
import graph_spec as gs  # noqa: E402
from engine_support import needs_engine  # noqa: E402

with open(CASES_FILE, encoding="utf-8") as f:
    CASES = json.load(f)["cases"]

# The JavaScript reader's notes() for every case of the table: what it reads, or the line it
# refuses
JS_SCRIPT = """
const C = require(process.argv[1]);
const { cases } = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
process.stdout.write(JSON.stringify(cases.map((c) => {
  try { return C.notes(c.block); }
  catch (e) { if (e instanceof C.ProfileError) return { refused: e.line }; throw e; }
})));
"""


def proving(rid):
    """The cases of the table that prove requirement rid."""
    return [c for c in CASES if rid in c["proves"]]


def python_answer(block):
    """notes() of a block, or the line it is refused at, as the JavaScript script gives them."""
    try:
        return gp.notes(block)
    except gp.ProfileError as e:
        return {"refused": e.line}


def without_notes(case):
    """The case's block with the lines of its notes, as the table gives them, left out."""
    drop = {n for note in case["notes"] for n in note["lines"]}
    lines = case["block"].split("\n")
    return "\n".join(line for i, line in enumerate(lines) if i + 1 not in drop)


NOTED = [c for c in CASES if c.get("notes")]


class Notes(unittest.TestCase):
    def reads_as_the_table_says(self, rid):
        of = proving(rid)
        self.assertTrue(of, f"no case in the table proves {rid}")
        for c in of:
            if "refused" in c:
                with self.assertRaises(gp.ProfileError, msg=c["id"]) as got:
                    gp.notes(c["block"])
                self.assertEqual(got.exception.line, c["refused"], c["id"])
                continue
            self.assertEqual(
                gp.notes(c["block"]), {"notes": c["notes"], "shared": c["shared"]}, c["id"]
            )

    def test_note_comment_three_slashes_directly_above_a_thing_or_link_are_its_note(self):
        self.reads_as_the_table_says("note_comment")

    def test_note_comment_every_note_read_is_one_an_element_owns(self):
        for c in CASES:
            if "refused" in c:
                continue
            owned = [o for o in gp.owned_comments(c["block"])["owned"] if o["note"]]
            self.assertEqual(
                [[n["line"], n["element"], n["summary"]] for n in gp.notes(c["block"])["notes"]],
                [[o["line"], o["element"], o["summary"]] for o in owned],
                c["id"],
            )

    def test_note_text_is_the_lines_joined_with_a_bare_line_a_paragraph_break(self):
        self.reads_as_the_table_says("note_text")

    def test_note_never_other_comments_other_comments_are_never_notes(self):
        self.reads_as_the_table_says("note_never_other_comments")

    def test_note_one_owner_a_note_above_a_shared_line_belongs_to_none_and_is_said(self):
        self.reads_as_the_table_says("note_one_owner")

    def test_note_both_readers_the_table_is_read_as_it_says(self):
        self.reads_as_the_table_says("note_both_readers")

    @unittest.skipUnless(shutil.which("node"), "node is not installed")
    def test_note_both_readers_the_javascript_reader_reads_every_case_alike(self):
        out = subprocess.run(
            ["node", "-e", JS_SCRIPT, CHECKER, CASES_FILE],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        theirs = json.loads(out)
        self.assertEqual(len(theirs), len(CASES))
        for c, js in zip(CASES, theirs):
            self.assertEqual(python_answer(c["block"]), js, c["id"])

    def test_note_standard_a_block_reads_the_same_with_its_notes_as_without(self):
        self.assertTrue(NOTED)
        for c in NOTED:
            with_notes, without = gp.Store(), gp.Store()
            with_notes.apply(c["block"])
            without.apply(without_notes(c))
            self.assertEqual(with_notes.graphs, without.graphs, c["id"])
            self.assertIsNone(gp.check_syntax(c["block"]), c["id"])

    def test_note_standard_the_standard_text_keeps_every_note_line_in_order(self):
        for c in NOTED:
            given = gp.to_gql(c["block"]).split("\n")
            lines = c["block"].split("\n")
            kept = [line for line in given if line in lines]
            noted = [lines[n - 1] for note in c["notes"] for n in note["lines"]]
            self.assertEqual([line for line in kept if line in noted], noted, c["id"])

    @needs_engine
    def test_note_standard_the_engine_loads_the_same_graph_with_notes_as_without(self):
        for c in NOTED:
            body = "\n".join(c["block"].split("\n")[1:])
            plain = "\n".join(without_notes(c).split("\n")[1:])
            ours = gs.canon_graph(gs.load("// graph: joined\n" + body), "joined")
            theirs = gs.canon_graph(gs.load("// graph: joined\n" + plain), "joined")
            self.assertEqual(ours, theirs, c["id"])


if __name__ == "__main__":
    unittest.main()
