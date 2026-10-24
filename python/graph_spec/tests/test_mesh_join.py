"""Editor spec §28 and §30: the graph mesh's join. Graphs from many notes are joined: a clash keeps
both sides and is flagged, gaps are listed, certainty is in words and ranks by a key made from
them, doubt stays on the thing disputed, links to a contested thing are marked, hand-made clusters
can be contested, and same-named states match only as a guess. The cases are
packages/graph-spec/test/mesh-join-cases.json, which the JavaScript library is held to as well.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_mesh_join
"""

import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import graph_spec as gs  # noqa: E402
from graphspec.engine.mesh.mesh_join import by_certainty, certainty_of, mesh_join  # noqa: E402

with open(
    os.path.join(ROOT, "packages", "graph-spec", "test", "mesh-join-cases.json"), encoding="utf-8"
) as f:
    CASES = json.load(f)["cases"]


def block(d):
    return "// graph: shop · document {} · schema s1 · as of 2026-10-01\n{}".format(
        d["id"], "\n".join(d["lines"])
    )


def answer(c):
    """A case's documents joined as the mesh joins them, each read from a file."""
    old = gs.PARSER
    gs.PARSER = "profile"
    try:
        with tempfile.TemporaryDirectory() as d:
            config, log, docs = gs.config_from(c.get("config") or {}), [], []
            for i, doc in enumerate(c["docs"]):
                p = os.path.join(d, f"doc{i}.md")
                with open(p, "w", encoding="utf-8") as f:
                    f.write(f"```gql\n{block(doc)}\n```\n")
                read = gs.normalise(gs.parse(p), log, config)
                gs.validate(read, log, config)
                docs.append(read)
            out = mesh_join(
                docs,
                config,
                c.get("findings") or [],
                c.get("spread") or [],
                c.get("same_domain") or [],
            )
    finally:
        gs.PARSER = old
    if c.get("query"):
        q = c["query"]
        out["ranked"] = by_certainty(
            out["claims"], shaky=bool(q.get("shaky")), at_least=q.get("at_least")
        )
    return json.loads(json.dumps(out))  # tuples and lists alike, as the case file holds them


def cases_for(requirement):
    return [c for c in CASES if c["requirement"] == requirement]


class Cases:
    requirement = ""

    def test_each_case(self):
        found = cases_for(self.requirement)
        self.assertTrue(found)
        for c in found:
            with self.subTest(c["name"]):
                out = answer(c)
                for k, v in c["answer"].items():
                    self.assertEqual(out[k], v, k)


class ConflictsFlaggedKept(Cases, unittest.TestCase):
    requirement = "conflicts_flagged_kept"

    def test_a_clash_completes_the_join_with_neither_side_asserted(self):
        out = answer(cases_for(self.requirement)[0])
        self.assertNotIn("price", out["nodes"]["widget"])
        self.assertEqual([v for v, _ in out["conflicts"][0]["sides"]], [10, 12])


class MeshJoinReportsGaps(Cases, unittest.TestCase):
    requirement = "mesh_join_reports_gaps"


class CertaintyInWords(Cases, unittest.TestCase):
    requirement = "certainty_in_words"


class CertaintyQueryDimension(Cases, unittest.TestCase):
    requirement = "certainty_query_dimension"

    def test_a_sort_key_is_never_read_from_the_text(self):
        claims = answer(cases_for(self.requirement)[0])["claims"]
        self.assertNotEqual(next(c for c in claims if c["id"] == "k1")["sort_key"], 999)

    def test_a_certainty_with_no_likelihood_word_ranks_nowhere(self):
        self.assertEqual(by_certainty([{"id": "n", "likelihood": 0.7, "confidence": "high"}]), [])
        self.assertEqual(certainty_of({"likelihood": "likely"})["range"], [55, 80])


class DoubtStaysLocal(Cases, unittest.TestCase):
    requirement = "doubt_stays_local"


class ContestedLinkMarker(Cases, unittest.TestCase):
    requirement = "contested_link_marker"


class HandClustersContestable(Cases, unittest.TestCase):
    requirement = "hand_clusters_contestable"


class StateNamesStartDoubtful(Cases, unittest.TestCase):
    requirement = "state_names_start_doubtful"


if __name__ == "__main__":
    unittest.main()
