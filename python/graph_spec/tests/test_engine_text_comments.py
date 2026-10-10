"""req:3.engine-keeps-comments — "a comment is given in a form the engine reads, on its own line" —
and req:3.engine-text-keeps-lines, on each route to Grafeo (parse, load, compute and the engine's
check_changeset). Grafeo reads /* */ and no //, so each whole-line // comment of a block reaches it
as a /* */ comment on the same line, its indentation kept; a */ in the comment's text cannot end
the comment early. A line ends at LF only (the reader's rule, issue #43), never at U+2028, U+2029,
U+0085, a form feed or the other breaks str.splitlines() takes, so a value holding one is the same
value to Grafeo as to the profile reader.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_engine_text_comments
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import graph_spec as gs  # noqa: E402
from graphspec.engine.documents.fill import compute  # noqa: E402
from test_engine_gets_corrected import (  # noqa: E402
    HEAD,
    changeset_parts,
    edge_types,
    given_to_grafeo,
    parse_text,
    parser,
    setUpModule,  # noqa: F401  # the route into the engine, asked for: each test runs under Grafeo
    tearDownModule,  # noqa: F401
)

# built with chr(), so no editor or tool can read the source's own text as a line end
LS, PS = chr(0x2028), chr(0x2029)  # line separator, paragraph separator

# a block with its comments: indented, with no space after the slashes, empty, ending in a */ that
# is not the comment's end, opening a /* inside, and (the last comment but one) holding a
# U+2028, which is not a line end here
WRITTEN = [
    "(r:Reason {id: 'r', title: 'Sun'}),",
    "// the option",
    "(o:Option {id: 'o', name: 'Coast'}),",
    "    // indented, and kept so",
    "//no space after the slashes",
    "//",
    "// it ends */ early? and /* opens",
    "// a note" + LS + "that goes on",
    "(r)-[:FAVOURS]->(o)",
]
# the same lines as Grafeo is to be given them, between the header and the end
GIVEN = [
    "(r:Reason {id: 'r', title: 'Sun'}),",
    "/* the option */",
    "(o:Option {id: 'o', name: 'Coast'}),",
    "    /* indented, and kept so */",
    "/* no space after the slashes */",
    "/* */",
    "/* it ends * / early? and /* opens */",
    "/* a note" + LS + "that goes on */",
    "(r)-[:FAVOURS]->(o)",
]
COMMENTED = "\n".join(WRITTEN)
# the block with its comment lines left out: the same graph
PLAIN = "\n".join(line for line in WRITTEN if not line.strip().startswith("//"))


def block_comment(header_line):
    """A '// …' header line as Grafeo is to be given it."""
    return "/* " + header_line[3:] + " */"


def last_given(log):
    assert log, "Grafeo was given nothing"
    return log[-1].split("\n")


class EveryCommentReachesGrafeoOnItsOwnLine(unittest.TestCase):
    """The header and each comment line become /* … */ on the same line; INSERT is the one line
    added."""

    def test_parse_gives_grafeo_the_header_and_each_comment_as_a_block_comment(self):
        with given_to_grafeo() as log:
            parse_text(COMMENTED)
        self.assertEqual(last_given(log), [block_comment(HEAD), "INSERT"] + GIVEN)

    def test_load_gives_grafeo_the_header_and_each_comment_as_a_block_comment(self):
        with given_to_grafeo() as log:
            gs.load("// graph: joined\n" + COMMENTED)
        self.assertEqual(last_given(log), ["/* graph: joined */", "INSERT"] + GIVEN)

    def test_compute_gives_grafeo_the_header_and_each_comment_as_a_block_comment(self):
        text = f"## A\n```gql\n// graph: g\n{COMMENTED}\n```\n"
        with given_to_grafeo() as log:
            compute({"load": ["#A"], "state_of": "g"}, text, ".", ".")
        self.assertEqual(last_given(log), ["/* graph: g */", "INSERT"] + GIVEN)

    def test_check_changeset_gives_grafeo_the_header_and_each_comment_as_a_block_comment(self):
        base, block = changeset_parts(
            "(a:Person {id: 'a', name: 'A'}),\n(o:Option {id: 'o', name: 'Coast'})",
            "(q:Reason {id: 'q', title: 'Quiet'}),\n  // the link, */ not its end\n"
            "(q)-[:FAVOURS]->(o)\n// last",
        )
        with given_to_grafeo() as log:
            gs.check_changeset(base, block)
        want = [
            block_comment(block.split("\n")[0]),
            "MATCH (o {id: 'o'})",
            "INSERT",
            "(q:Reason {id: 'q', title: 'Quiet'}),",
            "  /* the link, * / not its end */",
            "(q)-[:FAVOURS]->(o)",
            "/* last */",
        ]
        self.assertEqual(last_given(log), want)


class AStarSlashInACommentDoesNotEndIt(unittest.TestCase):
    TRAP = (
        "(r:Reason {id: 'r', title: 'Sun'}),\n// ends */ here, */ and here\n(o:Option {id: 'o'})"
    )

    def test_load_accepts_a_comment_holding_star_slash_and_gives_grafeo_its_text(self):
        with given_to_grafeo() as log:
            db = gs.load("// graph: joined\n" + self.TRAP)
        self.assertEqual(len(gs.Q(db, "MATCH (n) RETURN id(n) AS k")), 2)
        line = last_given(log)[3]
        self.assertEqual(line, "/* ends * / here, * / and here */")

    def test_parse_accepts_a_comment_holding_star_slash_and_gives_grafeo_its_text(self):
        with given_to_grafeo() as log:
            graph = parse_text(self.TRAP)
        self.assertEqual(sorted(graph["nodes"]), ["o", "r"])
        self.assertIn("/* ends * / here, * / and here */", last_given(log))


class ABlockWithCommentsGivesTheGraphOfTheBlockWithout(unittest.TestCase):
    def test_parse_gives_the_same_graph_with_comments_as_without(self):
        self.assertEqual(parse_text(COMMENTED), parse_text(PLAIN))

    def test_load_gives_the_same_graph_with_comments_as_without(self):
        with_comments = gs.canon_graph(gs.load("// graph: joined\n" + COMMENTED), "joined")
        without = gs.canon_graph(gs.load("// graph: joined\n" + PLAIN), "joined")
        self.assertEqual(with_comments, without)

    def test_compute_gives_the_same_state_with_comments_as_without(self):
        recipe = {"load": ["#A"], "state_of": "g"}
        with_comments = compute(recipe, f"## A\n```gql\n// graph: g\n{COMMENTED}\n```\n", ".", ".")
        without = compute(recipe, f"## A\n```gql\n// graph: g\n{PLAIN}\n```\n", ".", ".")
        self.assertEqual(with_comments, without)

    def test_check_changeset_gives_the_same_results_with_comments_as_without(self):
        base_body = "(a:Person {id: 'a', name: 'A'}),\n(o:Option {id: 'o', name: 'Coast'})"
        change = "(q:Reason {id: 'q', title: 'Quiet'}),\n<note>(q)-[:FAVOURS]->(o)"
        note = "// a */ note" + LS + "b\n"
        base, block = changeset_parts(base_body, change.replace("<note>", note))
        _, plain_block = changeset_parts(base_body, change.replace("<note>", ""))
        results = gs.check_changeset(base, block)
        self.assertEqual(results, gs.check_changeset(base, plain_block))
        self.assertTrue(all(ok for label, ok, _ in results[0] if label == "it loads"), results)
        self.assertIsNotNone(results[2])


class ALineEndsAtLfOnly(unittest.TestCase):
    """A value holding a character str.splitlines() takes for a line end is the one value the
    profile reader reads: Grafeo is given the same lines, so it is not given an extra one."""

    def body(self, char):
        titled = "(r:Reason {id:'r', title:'a<char>b'}),".replace("<char>", char)
        return titled + "\n(o:Option {id:'o'}),\n(r)-[:FAVOURS]->(o)"

    def assert_one_value(self, char):
        want = f"a{char}b"
        ours = parse_text(self.body(char))
        with parser("profile"):
            theirs = parse_text(self.body(char))
        self.assertEqual(theirs["nodes"]["r"]["props"]["title"], want)
        self.assertEqual(ours["nodes"], theirs["nodes"])
        db = gs.load("// graph: joined\n" + self.body(char))
        self.assertEqual(
            [r["t"] for r in gs.Q(db, "MATCH (n:Reason) RETURN n.title AS t")], [want]
        )
        self.assertEqual(edge_types(db), ["FAVOURS"])

    def test_u2028_in_a_value_is_the_same_value_to_grafeo_and_the_profile_reader(self):
        self.assert_one_value(LS)

    def test_u2029_in_a_value_is_the_same_value_to_grafeo_and_the_profile_reader(self):
        self.assert_one_value(PS)

    def test_u0085_in_a_value_is_the_same_value_to_grafeo_and_the_profile_reader(self):
        self.assert_one_value(chr(0x85))

    def test_a_form_feed_in_a_value_is_the_same_value_to_grafeo_and_the_profile_reader(self):
        self.assert_one_value(chr(0x0C))

    def test_grafeo_is_given_the_blocks_lines_and_no_extra_one_when_a_value_holds_u2028(self):
        written = "// graph: joined\n" + self.body(LS)
        with given_to_grafeo() as log:
            gs.load(written)
        # the block's own lines, and the one INSERT line the data shortcut needs
        self.assertEqual(len(last_given(log)), len(written.split("\n")) + 1)


if __name__ == "__main__":
    unittest.main()
