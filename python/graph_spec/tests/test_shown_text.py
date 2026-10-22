"""The text a thing is shown by in a drawing, chosen by one ranked rule (editor spec §3,
shown_text_ranked; Roger, 22 Oct 2026).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_shown_text

The cases are packages/graph-spec/test/shown-text-cases.json, the table the JavaScript library's
shown-text.test.mjs runs too, so both libraries choose the same text.
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "shown-text-cases.json"), encoding="utf-8"
) as f:
    TABLE = json.load(f)


def world_of(*blocks):
    st = gp.Store()
    for b in blocks:
        st.apply(b)
    return gr.World.from_store(st)


class ShownText(unittest.TestCase):
    def test_every_case_is_shown_as_the_table_says(self):
        for c in TABLE["cases"]:
            g = world_of("\n".join(c["body"]))[c["graph"]]
            for i, shown in c["shown"].items():
                self.assertEqual(list(gr.shown_text(g, i)), shown, f"{c['name']}: {i}")

    def test_the_shared_schema_gives_shown_by_when_the_graph_has_none(self):
        w = world_of(
            "// graph: shared\n(t:Meta:ElementType {name: 'Requirement', kind: 'node', "
            "origin: 'source', shown_by: 'statement'})",
            "// graph: spec\n(r:Requirement {id: 'req:1', name: 'One', "
            "statement: 'The first rule'})",
        )
        self.assertEqual(
            gr.shown_text(w["spec"], "req:1", w["shared"]), ("The first rule", "statement")
        )


if __name__ == "__main__":
    unittest.main()
