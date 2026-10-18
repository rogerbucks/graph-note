"""req:7.machine-reads-plain — "The process engine must run a process graph from the reader's
reading" — and req:18.scxml-reads-plain — "The SCXML export must be built from the reader's
reading": each held to the reference engine's answer, and run with Grafeo not installed.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_machine
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

# A loan, with drawing it down detailed in a sub-flow. It has guards, an else, actions and a
# self-transition. Its sub-flow's end is heard by its parent as done (§7, §16). Generic test data.
PROCESS = """// graph: loan_process
(applied:State {id: 'loan/applied', flow: 'loan', initial: TRUE}),
(approved:State {id: 'loan/approved', flow: 'loan'}),
(drawing:State {id: 'loan/drawing', flow: 'loan'}),
(repaying:State {id: 'loan/repaying', flow: 'loan'}),
(closed:State {id: 'loan/closed', flow: 'loan', final: TRUE}),
(requested:State {id: 'draw/requested', flow: 'draw', initial: TRUE}),
(paid:State {id: 'draw/paid', flow: 'draw', final: TRUE}),
(applied)-[:TRANSITION {event: 'assess', guard: 'score > 600', do: 'notify'}]->(approved),
(applied)-[:TRANSITION {event: 'assess', guard: 'else'}]->(closed),
(approved)-[:TRANSITION {event: 'draw'}]->(drawing),
(approved)-[:TRANSITION {event: 'remind', do: 'send reminder'}]->(approved),
(drawing)-[:DETAILED_IN]->(requested),
(requested)-[:TRANSITION {event: 'pay', do: 'transfer'}]->(paid),
(drawing)-[:TRANSITION {event: 'done'}]->(repaying),
(drawing)-[:TRANSITION {event: 'cancel'}]->(closed),
(repaying)-[:TRANSITION {event: 'repay', guard: 'balance = 0'}]->(closed)"""
CASES = {"assess": [{"score": 700}, {"score": 500}], "repay": [{"balance": 0}, {"balance": 9}]}


def plain():
    st = gp.Store()
    st.apply(PROCESS)
    return gr.World.from_store(st)["loan_process"]


def in_grafeo():
    db = gs.grafeo.GrafeoDB()
    db.execute("CREATE GRAPH loan_process")
    db.set_graph("loan_process")
    db.execute(gs.strip(PROCESS))
    return db


def runs(m, events):
    """Every configuration the machine reaches, and what each event does there."""
    seen, todo, out = set(), [m.start()], []
    while todo:
        conf = todo.pop()
        if conf in seen:
            continue
        seen.add(conf)
        for e, ctx in events:
            nxt, acts = m.step(conf, e, ctx)
            out.append((conf, e, sorted(ctx.items()), nxt, acts))
            todo.append(nxt)
    return sorted(out, key=repr)


class MachineReadsPlain(unittest.TestCase):
    def test_the_engine_runs_a_process_read_by_the_reader_with_grafeo_not_installed(self):
        code = (
            "import sys\nsys.modules['grafeo'] = None\n"
            f"sys.path.insert(0, {SRC!r}); sys.path.insert(0, {HERE!r})\n"
            "import graph_spec as gs, test_machine as t\n"
            "m = gs.Machine(t.plain())\n"
            "c, acts = m.step(m.start(), 'assess', {'score': 700})\n"
            "c, _ = m.step(c, 'draw', {})\n"
            "c, more = m.step(c, 'pay', {})\n"
            "print(m.root, c, acts + more)\n"
            "print('loan_approved' in gs.to_scxml(t.plain()))\n"
        )
        r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(
            r.stdout.split("\n")[:2],
            ["loan/applied ('loan/repaying',) ['notify', 'transfer']", "True"],
        )

    @needs_engine
    def test_the_process_read_by_the_reader_is_the_one_grafeo_reads(self):
        ours, theirs = gs.Machine(plain()), gs.Machine(in_grafeo())
        self.assertEqual(ours.S, theirs.S)
        self.assertEqual(
            {k: sorted(v, key=repr) for k, v in ours.T.items()},
            {k: sorted(v, key=repr) for k, v in theirs.T.items()},
        )
        self.assertEqual((ours.D, ours.root), (theirs.D, theirs.root))

    @needs_engine
    def test_every_step_from_every_state_is_the_one_grafeo_s_reading_takes(self):
        events = gs.process_events([in_grafeo()], CASES)
        self.assertEqual(events, gs.process_events([plain()], CASES))
        mine = runs(gs.Machine(plain()), events)
        self.assertGreater(len(mine), 20)
        self.assertEqual(mine, runs(gs.Machine(in_grafeo()), events))

    @needs_engine
    def test_the_scxml_export_of_the_reader_s_reading_is_grafeo_s(self):
        ours = gs.to_scxml(plain())
        self.assertEqual(ours, gs.to_scxml(in_grafeo()))
        self.assertIn('initial="loan_applied"', ours)


if __name__ == "__main__":
    unittest.main()
