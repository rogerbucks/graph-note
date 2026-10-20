"""Editor spec §51, spec_read_limits (GS4): the reader, the check and a join stop at stated limits
on size, nesting and join size, each with a clear refusal. The limits and their problem codes are
packages/graph-spec/test/limit-cases.json, the table the JavaScript library is held to by
packages/graph-spec/test/limits.test.mjs. Each refusal comes before the work it would take.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_limits
"""

import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import graph_rules as gr  # noqa: E402
import graph_spec as gs  # noqa: E402
from graphspec.reader.lexer import ProfileError  # noqa: E402
from graphspec.reader.store import Store  # noqa: E402

CASES = os.path.join(HERE, "..", "..", "..", "packages", "graph-spec", "test", "limit-cases.json")
with open(CASES, encoding="utf-8") as f:
    TABLE = json.load(f)
LIMITS, CODES = TABLE["limits"], TABLE["codes"]


def things(n, start=0):
    return ",\n".join(f"(n{start + i}:Note)" for i in range(n))


def nested(depth):
    """A path graph whose paths open one into the next, depth deep."""
    lines = ["// graph: deep", "INSERT"]
    lines += [f"(p{i}:Path {{altitude: {depth - i + 1}}})," for i in range(depth + 1)]
    lines += [f"(p{i})-[:STEP {{seq: 1}}]->(p{i + 1})," for i in range(depth)]
    lines += ["(leaf:Note)", f",(p{depth})-[:STEP {{seq: 1}}]->(leaf)"]
    return "\n".join(lines)


def read(*blocks):
    st = Store()
    for b in blocks:
        st.apply(b)
    return st


def joined(bodies):
    """The documents joined as the Node adapter's joinDocs joins them, each read from a file."""
    old = gs.PARSER
    gs.PARSER = "profile"
    try:
        with tempfile.TemporaryDirectory() as d:
            config, log, docs = gs.config_from({}), [], []
            for i, body in enumerate(bodies):
                p = os.path.join(d, f"d{i}.md")
                with open(p, "w", encoding="utf-8") as f:
                    head = f"// graph: d{i} · document d{i} · schema s@1 · as of 2026-10-20"
                    f.write(f"```gql\n{head}\nINSERT\n{body}\n```\n")
                docs.append(gs.normalise(gs.parse(p), log, config))
            return gs.join(docs, config)
    finally:
        gs.PARSER = old


class ReadLimits(unittest.TestCase):
    def refused(self, call, code):
        with self.assertRaises(ProfileError) as cm:
            call()
        self.assertEqual(cm.exception.code, code)
        return cm.exception

    def test_the_library_states_the_limits_the_table_gives(self):
        self.assertEqual(gs.LIMITS, LIMITS)

    def test_a_block_longer_than_the_limit_is_refused_before_it_is_read(self):
        block = f"// graph: big\nINSERT\n(a:Note {{text: '{'x' * LIMITS['block_chars']}'}})"
        e = self.refused(lambda: read(block), CODES["block_chars"])
        self.assertIn(str(LIMITS["block_chars"]), str(e))
        self.refused(lambda: read(block * 10), CODES["block_chars"])

    def test_a_graph_holding_more_than_the_limit_is_refused(self):
        at = f"// graph: many\nINSERT\n{things(LIMITS['items'])}"
        self.assertEqual(len(read(at).graph("many")["nodes"]), LIMITS["items"])
        more = f"// graph: many\nINSERT\n{things(1, LIMITS['items'])}"
        e = self.refused(lambda: read(at, more), CODES["items"])
        self.assertIn("many", str(e))

    def test_paths_nested_deeper_than_the_limit_are_refused_never_run_out_of_stack(self):
        at = gr.World.from_store(read(nested(LIMITS["nesting"])))["deep"]
        self.assertEqual(len(gr.view_at(at, "p0", 0)), 1)
        for depth in (LIMITS["nesting"] + 1, 5000):
            g = gr.World.from_store(read(nested(depth)))["deep"]
            self.refused(lambda g=g: gr.view_at(g, "p0", 0), CODES["nesting"])

    def test_a_join_of_more_documents_than_the_limit_is_refused(self):
        bodies = ["(a:Note {id: 'a'})"] * (LIMITS["join_documents"] + 1)
        e = self.refused(lambda: joined(bodies), CODES["join_documents"])
        self.assertIn(str(LIMITS["join_documents"]), str(e))

    def test_a_join_holding_more_than_the_limit_in_all_is_refused(self):
        per = LIMITS["join_items"] // 3 + 1
        self.refused(lambda: joined([things(per)] * 3), CODES["join_items"])


if __name__ == "__main__":
    unittest.main()
