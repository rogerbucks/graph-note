"""Graph spec §21, req:21.trust-counted and req:21.prefix-owner (editor spec §51,
spec_join_trust): trust on joined graphs. Only own and trusted documents are counted. What only an
untrusted one states is a flagged row, left out. A thing under another document's id prefix is
refused, with the owner named. The same cases as packages/graph-spec/test/trust.test.mjs.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_trust
"""

import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import graph_spec as gs  # noqa: E402


def doc(doc_id, body):
    return f"// graph: shop · document {doc_id} · schema s1 · as of 2026-10-01\n{body}"


MINE = doc(
    "doc:mine",
    "(widget:Product {name: 'Widget', price: 10}),\n(m1:Maker {id: 'acme:m1', name: 'Acme'})",
)
PEER = doc(
    "doc:peer",
    "\n".join(
        [
            "(widget:Product {name: 'Widget', price: 12, colour: 'red'}),",
            "(gizmo:Product {name: 'Gizmo'}),",
            "(m2:Maker {id: 'acme:m2', name: 'Not Acme'}),",
            "(gizmo)-[:MADE_BY]->(m2)",
        ]
    ),
)


def join(blocks, data=None):
    """The documents joined as the Node adapter's joinDocs joins them, each read from a file."""
    old = gs.PARSER
    gs.PARSER = "profile"
    try:
        with tempfile.TemporaryDirectory() as d:
            config, log, docs = gs.config_from(data or {}), [], []
            for i, block in enumerate(blocks):
                p = os.path.join(d, f"doc{i}.md")
                with open(p, "w", encoding="utf-8") as f:
                    f.write(f"```gql\n{block}\n```\n")
                doc_read = gs.normalise(gs.parse(p), log, config)
                gs.validate(doc_read, log, config)
                docs.append(doc_read)
            joined = gs.join(docs, config)
            joined["report"] = log + joined["report"]
            return joined
    finally:
        gs.PARSER = old


def rows(joined, kind):
    return [r for r in joined["report"] if r[0] == kind]


class TrustCounted(unittest.TestCase):
    def test_naming_no_trust_every_document_is_counted(self):
        j = join([MINE, PEER])
        self.assertEqual(
            sorted(j["claims"]),
            ["claim:join/widget/price=10@mine", "claim:join/widget/price=12@peer"],
        )
        self.assertIn("gizmo", j["nodes"])
        self.assertEqual(rows(j, "untrusted"), [])

    def test_an_untrusted_document_is_flagged_never_contested(self):
        j = join([MINE, PEER], {"trust": {"doc:mine": "own"}})
        self.assertEqual(j["claims"], {})
        self.assertEqual(j["nodes"]["widget"]["props"]["price"], 10)
        self.assertNotIn("colour", j["nodes"]["widget"]["props"])
        self.assertNotIn("gizmo", j["nodes"])
        self.assertEqual(j["edges"], {})
        self.assertEqual(
            sorted((r[1], r[2], r[5]) for r in rows(j, "untrusted")),
            [
                ("acme:m2", "thing", "doc:peer"),
                ("gizmo", "thing", "doc:peer"),
                ("gizmo-[:MADE_BY]->acme:m2", "relationship", "doc:peer"),
                ("widget", "colour", "doc:peer"),
                ("widget", "price", "doc:peer"),
            ],
        )
        for r in rows(j, "untrusted"):
            self.assertIn("flagged — from an untrusted source", r[4])

    def test_a_trusted_document_is_counted_and_an_unnamed_one_is_not(self):
        trusted = join([MINE, PEER], {"trust": {"doc:mine": "own", "doc:peer": "trusted"}})
        self.assertEqual(len(trusted["claims"]), 2)
        self.assertIn("gizmo", trusted["nodes"])
        self.assertNotIn("gizmo", join([MINE, PEER], {"trust": {"doc:mine": "trusted"}})["nodes"])

    def test_a_level_not_named_in_the_spec_is_refused(self):
        with self.assertRaisesRegex(ValueError, "own, trusted or untrusted"):
            join([MINE, PEER], {"trust": {"doc:peer": "friendly"}})


class PrefixOwner(unittest.TestCase):
    def test_a_thing_under_another_documents_prefix_is_refused_with_the_owner_named(self):
        j = join(
            [MINE, PEER],
            {
                "trust": {"doc:mine": "own", "doc:peer": "trusted"},
                "prefix_owners": {"acme": "doc:mine"},
            },
        )
        self.assertIn("acme:m1", j["nodes"])
        self.assertNotIn("acme:m2", j["nodes"])
        self.assertEqual(j["edges"], {})
        self.assertEqual(
            [(r[1], r[4], r[5]) for r in rows(j, "prefix")],
            [("acme:m2", "refused — the prefix acme belongs to doc:mine", "doc:peer")],
        )


if __name__ == "__main__":
    unittest.main()
