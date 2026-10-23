"""The two engines answer alike (editor spec §27, mesh_engine_parity). Each shared mesh case,
joins included, is run whole. Its answer is written as RFC 8785 text, a date as ISO 8601, and its
SHA-256 must be the one in packages/graph-spec/test/mesh-parity-cases.json. The JavaScript library
is held to the same hashes (packages/graph-spec/test/mesh-parity.test.mjs).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_mesh_parity
"""

import hashlib
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TESTS = os.path.join(HERE, "..", "..", "..", "packages", "graph-spec", "test")
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
from graphspec.engine.mesh.as_at import as_at, lens_as_at  # noqa: E402
from graphspec.rules.canonical_json import jcs, norm  # noqa: E402
from test_mesh_join import answer  # noqa: E402


def cases(name):
    with open(os.path.join(TESTS, name), encoding="utf-8") as f:
        return json.load(f)


def plain(g):
    """A graph as plain data: its things by key, each with its labels sorted, and its links
    sorted."""
    return {
        "nodes": [
            [k, sorted(labels), {p: norm(v) for p, v in props.items()}]
            for k, (labels, props) in sorted(g.nodes.items())
        ],
        "edges": sorted(jcs([norm(x) for x in e]) for e in g.edges),
    }


def answers():
    """Each parity case's name and its whole answer, as RFC 8785 text."""
    out = {}
    for c in cases("mesh-join-cases.json")["cases"]:
        out[f"join: {c['name']}"] = jcs(answer(c))
    times = cases("two-times-cases.json")
    st = gp.Store()
    st.apply("\n".join(times["block"]))
    g = gr.World.from_store(st)["staff"]
    for c in times["cases"]:
        at = {"graph": plain(as_at(g, c["axis"], c["date"]))}
        at["buckets"] = lens_as_at(g, times["lens"], c["axis"], c["date"])
        out[f"as at: {c['axis']} {c['date']}"] = jcs(at)
    return out


class MeshEngineParity(unittest.TestCase):
    def test_every_case_gives_the_same_bytes_as_the_javascript_library(self):
        ours, parity = answers(), cases("mesh-parity-cases.json")["cases"]
        self.assertEqual(sorted(ours), sorted(c["name"] for c in parity))
        for c in parity:
            with self.subTest(c["name"]):
                self.assertEqual(hashlib.sha256(ours[c["name"]].encode()).hexdigest(), c["sha256"])


if __name__ == "__main__":
    unittest.main()
