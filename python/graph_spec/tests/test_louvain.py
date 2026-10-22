"""The Louvain method gives the JavaScript library's groups on every shared case.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_louvain

The cases are packages/graph-spec/test/louvain-cases.json (wiki/Clusters-design.md, step 2).
Clusters found by links (editor spec §31) and the groups a massive graph opens as
(editor spec §53) use this one method.
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.clusters.louvain import louvain  # noqa: E402

CASES = os.path.join(ROOT, "packages", "graph-spec", "test", "louvain-cases.json")


def generated(n, seed):
    """The links a case with a seed makes: a tree of random parents, and 30% more across it."""
    s = seed

    def draw():
        nonlocal s
        s = (s * 16807) % 2147483647
        return s / 2147483647

    links = [[int(draw() * i), i] for i in range(1, n)]
    for _ in range(round(n * 0.3)):
        links.append([int(draw() * n), int(draw() * n)])
    return links


class SharedCases(unittest.TestCase):
    def test_every_shared_case_gives_its_recorded_groups(self):
        with open(CASES, encoding="utf-8") as f:
            cases = json.load(f)["cases"]
        for c in cases:
            with self.subTest(c["name"]):
                links = c["links"] if "links" in c else generated(c["n"], c["seed"])
                self.assertEqual(louvain(c["n"], links), c["groups"])


if __name__ == "__main__":
    unittest.main()
