"""A proposal's proposer is read through WAS_ATTRIBUTED_TO (graph spec section 23 rule 6); the old
form, through ASSOCIATED_WITH on its activity, is accepted for one release with a warning naming
the fix.

The cases are packages/graph-spec/test/proposer-cases.json, the table the JavaScript reader's
proposers.test.mjs runs too. The warning is in the rule's detail, and Grafeo gives the same
verdict.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_proposers
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

with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "proposer-cases.json"), encoding="utf-8"
) as f:
    TABLE = json.load(f)


def blocks_of(case):
    return ["\n".join(TABLE["people"]), "\n".join(case["body"])]


class Proposers(unittest.TestCase):
    def test_every_case_is_read_as_the_table_says(self):
        for c in TABLE["cases"]:
            st = gp.Store()
            for b in blocks_of(c):
                st.apply(b)
            w = gr.World.from_store(st)
            rule = [ok for label, ok, _ in gr.check(w, c["graph"], {}) if label == TABLE["rule6"]]
            self.assertEqual(rule, [c["holds"]], c["name"])
            self.assertEqual(gr.proposer_warnings(w, c["graph"]), c["warnings"], c["name"])
            detail = [d for label, _, d in gr.check(w, c["graph"], {}) if label == TABLE["rule6"]]
            for warning in c["warnings"]:
                self.assertIn(warning, detail[0], c["name"])

    @needs_engine
    def test_grafeo_gives_the_same_verdict(self):
        for c in TABLE["cases"]:
            db = gs.grafeo.GrafeoDB()
            st = gp.Store()
            made = []
            for b in blocks_of(c):
                g = b.split("\n")[0].split(": ")[1]
                if g not in made:
                    db.execute(f"CREATE GRAPH {g}")
                    made.append(g)
                st.apply(b)
                db.set_graph(g)
                db.execute(gs.strip(st.corrected(b)))
            db.set_graph(c["graph"])
            rows = gs.judgements_rules(db, c["graph"], ["people", c["graph"]])
            rule = [ok for label, ok, _ in rows if label == TABLE["rule6"]]
            self.assertEqual(rule, [c["holds"]], c["name"])
            # the warning for the old form is the same as the reader's
            detail = [d for label, _, d in rows if label == TABLE["rule6"]]
            for warning in c["warnings"]:
                self.assertIn(warning, detail[0], c["name"])


if __name__ == "__main__":
    unittest.main()
