"""A relationship type written without its colon.

req:3.bare-link-type and req:3.engine-gets-corrected.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

As packages/graph-spec/test/graph-spec-check-bare.test.mjs: in a data block, a bracketed name
matching exactly one relationship type of the graph, ignoring case, is read as that type and
reported; first uses, case-only twins and query blocks are not. And no engine is ever given a block
that still holds a bare type: its load is refused, with the fix.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import gql_profile as gp  # noqa: E402
import graph_spec as gs  # noqa: E402

FIRST = "\n".join(
    [
        "// graph: g",
        "(r:Reason {title: 'Sun'}),",
        "(o:Option {name: 'Coast'}),",
        "(r)-[:FAVOURS]->(o)",
    ]
)


def read(*blocks):
    st = gp.Store()
    for b in blocks:
        st.apply(b)
    return st


def types(st):
    return [e[1] for e in st.graph("g")["edges"]]


class BareTypes(unittest.TestCase):
    def test_one_match_ignoring_case_is_read_as_that_type_and_reported(self):
        st = read(FIRST, "// graph: g\n(s:Reason {title: 'Quiet'}),\n(s)-[favours]->(o)")
        self.assertEqual(types(st), ["FAVOURS", "FAVOURS"])
        self.assertEqual(
            st.bares, [{"graph": "g", "line": 3, "written": "favours", "type": "FAVOURS"}]
        )

    def test_earlier_in_the_block_and_declared_types_count(self):
        self.assertEqual(types(read(FIRST + ",\n(r)-[Favours]->(o)")), ["FAVOURS", "FAVOURS"])
        declared = "\n".join(
            [
                "// graph: g",
                "(t:ElementType {name: 'CITES', kind: 'edge', reading: 'cites',"
                " reverse_name: 'is cited by'}),",
                "(r:Reason {title: 'Sun'}),",
                "(o:Option {name: 'Coast'}),",
                "(r)-[cites]->(o)",
            ]
        )
        self.assertEqual(types(read(declared)), ["CITES"])

    def test_a_first_use_needs_its_colon(self):
        block = FIRST.replace("[:FAVOURS]", "[favours]")
        with self.assertRaises(gp.ProfileError) as e:
            read(block)
        self.assertEqual(
            str(e.exception),
            "line 4: [favours] has no colon, and graph g has no relationship type called favours"
            " — a relationship type is written with its colon: [:FAVOURS]",
        )

    def test_case_only_twins_are_not_guessed(self):
        twins = FIRST + ",\n(p:Option {name: 'Hills'}),\n(r)-[:Favours]->(p),\n(r)-[favours]->(p)"
        with self.assertRaises(gp.ProfileError) as e:
            read(twins)
        self.assertEqual(
            str(e.exception),
            "line 7: [favours] has no colon, and graph g has relationship types FAVOURS and"
            " Favours, which differ only by case — write the one meant with its colon, such as"
            " [:FAVOURS]",
        )

    def test_with_its_colon_nothing_is_reported(self):
        self.assertEqual(read(FIRST).bares, [])


class EngineGetsCorrected(unittest.TestCase):
    """No route may give an engine a block that still holds a bare type.

    req:3.engine-gets-corrected.
    """

    BARE = FIRST + ",\n(r)-[favours]->(o)"

    def test_to_gql_refuses_a_bare_type_with_the_fix(self):
        with self.assertRaises(gp.ProfileError) as e:
            gp.to_gql(self.BARE)
        self.assertIn("[favours] has no colon", str(e.exception))
        self.assertIn("[:FAVOURS]", str(e.exception))

    def test_loading_into_grafeo_is_refused(self):
        with self.assertRaises(gp.ProfileError):
            gs.load(self.BARE)

    def test_the_reader_s_corrected_text_loads(self):
        st = read(self.BARE)
        db = gs.load(st.corrected(self.BARE))
        rows = gs.Q(db, "MATCH ()-[r]->() RETURN type(r) AS t")
        self.assertEqual(sorted(r["t"] for r in rows), ["FAVOURS", "FAVOURS"])


class CorrectedByPlace(unittest.TestCase):
    """The corrected text writes the colon where the reader read each bare type, by its place."""

    def test_not_inside_a_string_and_across_a_line_break(self):
        block = (
            "// graph: g\n(s:Reason {title: 'see [favours'})-[favours]->(o),\n"
            "(s)-[\n  favours]->(r)"
        )
        st = read(FIRST, block)
        self.assertEqual(
            st.corrected(block),
            "// graph: g\n(s:Reason {title: 'see [favours'})-[:FAVOURS]->(o),\n"
            "(s)-[\n  :FAVOURS]->(r)",
        )


class EngineGuardEdges(unittest.TestCase):
    def test_an_edge_variable_is_not_taken_for_a_bare_type(self):
        try:
            gp.to_gql("// graph: g\nMATCH (a)-[r:LIKES]->(b)")
        except gp.ProfileError as e:
            self.assertNotIn("has no colon", str(e))

    def test_a_block_that_cannot_be_read_is_still_refused_if_it_holds_one(self):
        with self.assertRaises(gp.ProfileError) as e:
            gp.to_gql("// graph: g\n(a:T {x: @}),\n(a)-[likes]->(b)")
        self.assertIn("[likes] has no colon", str(e.exception))

    def test_the_line_given_is_the_line_in_the_block(self):
        with self.assertRaises(gp.ProfileError) as e:
            gs.load(
                "// graph: g\n// a comment\n" + FIRST.split("\n", 1)[1] + ",\n(r)-[favours]->(o)"
            )
        self.assertEqual(e.exception.line, 6)


if __name__ == "__main__":
    unittest.main()
