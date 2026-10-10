"""req:24.view-server-reads-plain — "The view server must serve from the reader's reading": each
view, zoom, pin and record held to the reference engine's, and served with Grafeo not installed.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_view_server
"""

import datetime as dt
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

# a trip told at two altitudes, with readings for its links, and a judgement graph holding one
# reference already and a proposal (generic test data)
STORY = """// graph: story
(t_path:ElementType {id: 'type:Path', name: 'Path', kind: 'node'}),
(t_fact:ElementType {id: 'type:Fact', name: 'Fact', kind: 'node'}),
(t_place:ElementType {id: 'type:Place', name: 'Place', kind: 'node'}),
(t_step:ElementType {id: 'type:STEP', name: 'STEP', kind: 'edge', reading: 'steps to',
  reverse_name: 'is a step of'}),
(t_at:ElementType {id: 'type:AT', name: 'AT', kind: 'edge', reading: 'is at',
  reverse_name: 'is where'}),
(meta:GraphMeta {id: 'meta:story', graph: 'story', schema: 'story@1'}),
(meta)-[:DECLARES]->(t_path), (meta)-[:DECLARES]->(t_fact), (meta)-[:DECLARES]->(t_place),
(meta)-[:DECLARES]->(t_step), (meta)-[:DECLARES]->(t_at),
(lisbon:Place {name: 'Lisbon'}),
(arrive:Fact {title: 'Arrive by train', on: DATE '2026-05-01', cost_cents: 4500}),
(tram:Fact {title: 'Ride the old tram'}),
(fado:Fact {title: 'Hear fado', note: 'book ahead'}),
(fly:Fact {title: 'Fly home'}),
(arrive)-[:AT]->(lisbon), (tram)-[:AT]->(lisbon),
(day1:Path {title: 'Day one', altitude: 1}),
(day2:Path {title: 'Day two', altitude: 1}),
(trip:Path {title: 'The trip', altitude: 2}),
(day1)-[:STEP {seq: 2}]->(tram), (day1)-[:STEP {seq: 1}]->(arrive),
(day2)-[:STEP {seq: 1}]->(fado), (day2)-[:STEP {seq: 2}]->(fly),
(trip)-[:STEP {seq: 1}]->(day1), (trip)-[:STEP {seq: 2}]->(day2)"""
JUDGEMENTS = """// graph: club
(old:Ref {id: 'ref:story/arrive', ref: 'arrive', graph: 'story'}),
(prop:Proposal {id: 'prop:1', title: 'Go in May'})"""
CLASSES = {"story": "Public", "club": "Public"}
MATRIX = {"cloud": {"Public": "yes", "Internal": "conditional"}, "local": {"Public": "yes"}}
AT = dt.date(2026, 10, 1)


def plain():
    st = gp.Store()
    st.apply(STORY)
    st.apply(JUDGEMENTS)
    return gr.World.from_store(st)


def in_grafeo():
    db = gs.grafeo.GrafeoDB()
    for name, block in (("story", STORY), ("club", JUDGEMENTS)):
        db.execute(f"CREATE GRAPH {name}")
        db.set_graph(name)
        db.execute(gs.strip(block))
    return db


def session(source):
    """A serving: the trip at altitude 1, then at 0 within a budget that folds it, a zoom into a
    day, the proposal's pins and its record — and each refusal, as its words."""
    vs = gs.ViewServer(source, CLASSES, "serving:1", "model:any", "cloud", AT, matrix=MATRIX)
    out = [vs.serve("story", "trip", 1, None), vs.serve("story", "trip", 0, 200)]
    out.append(vs.zoom("story", "day2"))
    out.append(vs.zoom("story", "lisbon"))
    for bad in (lambda: vs.zoom("story", "nowhere"), lambda: vs.serve("story", "trip", 0, 10)):
        try:
            bad()
        except (PermissionError, ValueError, KeyError) as e:
            out.append(f"{type(e).__name__}: {e}")
    out.append(vs.pins([("story", "arrive"), ("story", "fado")]))
    out.append(vs.record_block("club", "prop:1", [("story", "arrive"), ("story", "fado")]))
    return out, vs.served, sorted(vs.visible)


class ViewServerReadsPlain(unittest.TestCase):
    def test_the_view_server_serves_the_reader_s_reading_with_grafeo_not_installed(self):
        code = (
            "import sys\nsys.modules['grafeo'] = None\n"
            f"sys.path.insert(0, {SRC!r}); sys.path.insert(0, {HERE!r})\n"
            "import test_view_server as t\n"
            "out, served, visible = t.session(t.plain())\n"
            "print(len(out), sorted(n for _, n in served), out[-1].splitlines()[0])\n"
        )
        r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(
            r.stdout.strip(),
            "8 ['arrive', 'day1', 'day2', 'fado', 'fly', 'lisbon', 'tram', 'trip'] "
            "MATCH (r3:Ref {id: 'ref:story/arrive'})",
        )

    @needs_engine
    def test_every_view_zoom_pin_and_record_of_the_reader_s_reading_is_grafeo_s(self):
        ours, theirs = session(plain()), session(in_grafeo())
        for a, b in zip(ours[0], theirs[0]):
            self.assertEqual(a, b)
        self.assertEqual(ours, theirs)


if __name__ == "__main__":
    unittest.main()
