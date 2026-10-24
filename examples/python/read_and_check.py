"""Reads a graph block and checks it against the graph spec's rules, with the Python library.

Risk API-12: CI runs this file, so it keeps working with the library as shipped.

Run: uv run --project python/graph_spec python examples/python/read_and_check.py
It prints each rule with ✓ or ✗, and exits 1 if any fails.
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "python/graph_spec/src"))
import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402

BLOCK = """// graph: reader
INSERT (q:Question {id: 'q', title: 'Which device?'}),
       (large:Option {id: 'large', name: 'Large reader'}),
       (large)-[:ANSWERS]->(q)"""

store = gp.Store()
store.apply(BLOCK)
verdicts = gr.check(gr.World.from_store(store), "reader")
for rule, ok, _ in verdicts:
    print(("✓ " if ok else "✗ ") + rule)
sys.exit(0 if all(ok for _, ok, _ in verdicts) else 1)
