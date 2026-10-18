"""Notes in the SCXML export (editor spec §24, note_standard; graph spec req:26.plain): SCXML is
XML, which has comments, so a /// note on a State or a transition is kept as an XML comment
directly before the element written for it, its text escaped so XML reads it back as written and
nothing in it can end the comment. The comment is written as the core writes a note into GraphML,
held to one table, tests/note_comment_cases.json, which packages/core/test/xml-comment.test.js
holds the core to. The process is the shared case notes-on-a-process of
packages/graph-spec/test/owned-comment-cases.json, whose notes both readers read alike
(tests/test_notes.py).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_scxml
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
import graph_spec as gs  # noqa: E402
from engine_support import needs_engine  # noqa: E402
from graphspec.engine.optional_imports import etree  # noqa: E402
from graphspec.engine.process.scxml import NS, comment_note, note_comment, to_scxml  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "owned-comment-cases.json"),
    encoding="utf-8",
) as f:
    PROCESS = next(c for c in json.load(f)["cases"] if c["id"] == "notes-on-a-process")["block"]
with open(os.path.join(HERE, "note_comment_cases.json"), encoding="utf-8") as f:
    COMMENTS = json.load(f)["cases"]

# the same process with its notes left out
PLAIN = "\n".join(line for line in PROCESS.split("\n") if not line.startswith("///"))


def plain(block):
    st = gp.Store()
    st.apply(block)
    return gr.World.from_store(st)["loan_process"]


def place(el):
    """Where an element of the export is: a state by its id, a transition by its state, event,
    condition and target."""
    if el.tag == f"{{{NS}}}transition":
        state = el.getparent().get("id")
        return ("transition", state, el.get("event"), el.get("cond"), el.get("target"))
    return (etree.QName(el).localname, el.get("id"))


def noted(xml):
    """Each comment of an SCXML text, read back, with the element directly after it."""
    doc = etree.fromstring(xml.encode())
    return [(place(c.getnext()), comment_note(c.text)) for c in doc.iter(etree.Comment)]


def elements(xml):
    """Every element of an SCXML text, in order, with its attributes."""
    doc = etree.fromstring(xml.encode())
    return [(el.tag, dict(el.attrib)) for el in doc.iter() if isinstance(el.tag, str)]


class ScxmlKeepsNotes(unittest.TestCase):
    def test_note_standard_a_note_on_a_state_or_a_transition_is_a_comment_before_it(self):
        xml = to_scxml(plain(PROCESS), PROCESS)
        closed = "Closed for good: --> <!-- a -- b --- c -\n\\ back\\slash"
        self.assertEqual(
            noted(xml),
            [
                (("state", "loan_applied"), "Where every loan starts."),
                (
                    ("transition", "loan_applied", "assess", "score > 600", "loan_closed"),
                    "Scored above 600.",
                ),
                (("final", "loan_closed"), closed),
            ],
        )

    def test_note_standard_a_hostile_note_stays_inside_its_comment(self):
        xml = to_scxml(plain(PROCESS), PROCESS)
        # the document holds the elements of the export without notes, and nothing else
        self.assertEqual(elements(xml), elements(to_scxml(plain(PLAIN))))
        for c in etree.fromstring(xml.encode()).iter(etree.Comment):
            self.assertNotIn("--", c.text)
            self.assertFalse(c.text.endswith("-"))

    def test_note_standard_with_no_notes_the_export_is_as_it_was(self):
        self.assertEqual(to_scxml(plain(PLAIN), PLAIN), to_scxml(plain(PLAIN)))
        self.assertNotIn("<!--", to_scxml(plain(PROCESS)))


# Two transitions with the same ends, the first written holding the note. The note is the first's,
# whatever order a source gives the transitions in. The core puts a note on the first link
# written with its ends in the same way.
ORDERED = "\n".join(
    [
        "// graph: loan_process",
        "(applied:State {id: 'loan/applied', flow: 'loan', initial: TRUE}),",
        "(closed:State {id: 'loan/closed', flow: 'loan', final: TRUE}),",
        "/// Scored above 600.",
        "(applied)-[:TRANSITION {event: 'assess', guard: 'score > 600'}]->(closed),",
        "(applied)-[:TRANSITION {event: 'assess', guard: 'else'}]->(closed)",
    ]
)
SCORED = ("transition", "loan_applied", "assess", "score > 600", "loan_closed")


def out_of_order(g):
    """The same graph with its links given in the reverse of the order written, as a source such
    as a database may give its rows."""
    return gr.Graph(g.nodes, list(reversed(g.edges)))


class ATransitionNoteFollowsTheWrittenOrder(unittest.TestCase):
    def test_note_standard_rows_out_of_written_order_still_note_the_transition_written(self):
        for source in (plain(ORDERED), out_of_order(plain(ORDERED))):
            self.assertEqual(noted(to_scxml(source, ORDERED)), [(SCORED, "Scored above 600.")])

    def test_note_standard_the_export_is_the_same_whatever_order_the_rows_come_in(self):
        for block in (ORDERED, PROCESS):
            self.assertEqual(
                to_scxml(out_of_order(plain(block)), block), to_scxml(plain(block), block)
            )

    @needs_engine
    def test_note_standard_grafeo_s_rows_give_the_export_the_reader_s_reading_gives(self):
        for block in (ORDERED, PROCESS):
            db = gs.grafeo.GrafeoDB()
            db.execute("CREATE GRAPH loan_process")
            db.set_graph("loan_process")
            db.execute(gs.strip(block))
            self.assertEqual(to_scxml(db, block), to_scxml(plain(block), block))


class OneCommentForOneNote(unittest.TestCase):
    """The shared table: the comment the core writes into GraphML is the one written here."""

    def test_note_standard_each_note_is_written_as_the_comment_the_table_gives(self):
        self.assertGreater(len(COMMENTS), 10)
        for c in COMMENTS:
            self.assertEqual("<!--" + note_comment(c["text"]) + "-->", c["comment"], c["id"])

    def test_note_standard_each_comment_reads_back_through_xml_as_the_note(self):
        for c in COMMENTS:
            root = etree.Element("scxml")
            root.append(etree.Comment(note_comment(c["text"])))
            # in UTF-8, as to_scxml writes: in ASCII, lxml would write a character beyond it as a
            # reference, which a comment does not read
            back = etree.fromstring(etree.tostring(root, encoding="UTF-8"))
            self.assertEqual(comment_note(back[0].text), c["text"], c["id"])

    def test_note_standard_a_comment_written_otherwise_is_refused(self):
        for text in [" \\x ", "no spaces", " \\u{110000} ", " \\u{zz} ", " a\\"]:
            with self.assertRaises(ValueError, msg=text):
                comment_note(text)


if __name__ == "__main__":
    unittest.main()
