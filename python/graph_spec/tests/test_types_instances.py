"""Lasting types and their instances (editor spec §27, type_instance_split and
instance_inherits_type). An instance links to its type, asked about in general or one at a time.
It inherits every property of its type unless it sets its own, and its own value changes neither
the type nor another instance. The cases are packages/graph-spec/test/types-instances-cases.json,
which the JavaScript library answers too (packages/graph-spec/test/types-instances.test.mjs).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_types_instances
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
from graphspec.engine.mesh.types_instances import inherited, instances_of, type_of  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "types-instances-cases.json"),
    encoding="utf-8",
) as f:
    T = json.load(f)

ASK = {"typeOf": type_of, "instancesOf": instances_of, "inherited": inherited}


def world_of(blocks):
    st = gp.Store()
    for lines in blocks:
        st.apply("\n".join(lines))
    return gr.World.from_store(st)


class TypesAndInstances(unittest.TestCase):
    def test_each_case(self):
        w = world_of(T["blocks"])
        for c in T["cases"]:
            with self.subTest(c["name"]):
                self.assertEqual(ASK[c["ask"]](w, c["graph"], c["key"]), c["answer"])

    def test_an_instance_replaced_leaves_its_type_and_the_others(self):
        w = world_of(T["blocks"])
        old = "(bens_reader:Item {serial: 'B2', weight: 180, power: 'battery'})"
        new = "(bens_reader:Item {serial: 'B9', weight: 150})"
        r = world_of([[line.replace(old, new) for line in b] for b in T["blocks"]])
        self.assertEqual(inherited(r, "models", "e_reader"), inherited(w, "models", "e_reader"))
        self.assertEqual(
            inherited(r, "desks", "anns_reader"), inherited(w, "desks", "anns_reader")
        )
        self.assertEqual(inherited(r, "desks", "bens_reader")["props"]["weight"], 150)

    def test_a_type_that_is_its_own_type_is_read_once(self):
        block = [
            "// graph: loop",
            "(a:Kind {x: 1}),",
            "(b:Kind {y: 2}),",
            "(a)-[:INSTANCE_OF]->(b),",
            "(b)-[:INSTANCE_OF]->(a)",
        ]
        self.assertEqual(
            inherited(world_of([block]), "loop", "a")["props"], {"id": "a", "x": 1, "y": 2}
        )


if __name__ == "__main__":
    unittest.main()
