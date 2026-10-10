"""req:21.loan-balance-reads-plain — "The loan-balance figure must be computed from the reader's
reading": held to the reference engine's answer, and computed with Grafeo not installed.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_named_rules
"""

import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
sys.path.insert(0, SRC)
sys.path.insert(0, HERE)

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
import graph_spec as gs  # noqa: E402
from engine_support import needs_engine  # noqa: E402

# two loans — one whose figures are settled, one with a contested principal and a contested
# repayment — and a contested claim about something the figure does not depend on (generic data)
LOANS = """// graph: lending
(bike:Loan {id: 'loan:bike', principal_cents: 50000, currency: 'GBP'}),
(r1:Repayment {id: 'rep:1', amount_cents: 12000}),
(r2:Repayment {id: 'rep:2', amount_cents: 8000}),
(r1)-[:REPAYS]->(bike),
(r2)-[:REPAYS]->(bike),
(boat:Loan {id: 'loan:boat', principal_cents: 90000, currency: 'EUR'}),
(r3:Repayment {id: 'rep:3', amount_cents: 1000}),
(r3)-[:REPAYS]->(boat),
(c1:Claim {id: 'claim:principal', status: 'contested', claimed_property: 'principal_cents'}),
(c1)-[:ABOUT]->(boat),
(c2:Claim {id: 'claim:amount', status: 'contested', claimed_property: 'amount_cents'}),
(c2)-[:ABOUT]->(r3),
(c3:Claim {id: 'claim:colour', status: 'contested', claimed_property: 'colour'}),
(c3)-[:ABOUT]->(bike),
(c4:Claim {id: 'claim:settled', status: 'confirmed', claimed_property: 'currency'}),
(c4)-[:ABOUT]->(bike)"""


def plain():
    st = gp.Store()
    st.apply(LOANS)
    return gr.World.from_store(st)["lending"]


def in_grafeo():
    db = gs.grafeo.GrafeoDB()
    db.execute("CREATE GRAPH lending")
    db.set_graph("lending")
    db.execute(gs.strip(LOANS))
    return db


class LoanBalanceReadsPlain(unittest.TestCase):
    def test_the_balance_is_computed_from_the_reader_s_reading_with_grafeo_not_installed(self):
        code = (
            "import sys\nsys.modules['grafeo'] = None\n"
            f"sys.path.insert(0, {SRC!r}); sys.path.insert(0, {HERE!r})\n"
            "import graph_spec as gs, test_named_rules as t\n"
            "print(gs.fig_loan_balance(t.plain(), 'loan:bike'))\n"
            "print(gs.fig_loan_balance(t.plain(), 'loan:boat'))\n"
        )
        r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(
            r.stdout.split("\n")[:2],
            [
                "{'result': 'ok', 'value': 30000, 'currency': 'GBP'}",
                "{'result': 'incomplete', 'depends_on': ['claim:amount', 'claim:principal']}",
            ],
        )

    @needs_engine
    def test_the_balance_from_the_reader_s_reading_is_grafeo_s(self):
        for loan in ("loan:bike", "loan:boat"):
            self.assertEqual(
                gs.fig_loan_balance(plain(), loan), gs.fig_loan_balance(in_grafeo(), loan), loan
            )


if __name__ == "__main__":
    unittest.main()
