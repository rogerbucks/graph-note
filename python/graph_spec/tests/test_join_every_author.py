"""The same join for every author (editor spec §30, same_join_every_author). Edits are joined by
the same rules, whoever made them, so identical edits give identical answers apart from who made
them. A text merge that picks a value is followed by the meaning-level join, which keeps the
dispute for a person. The cases are packages/graph-spec/test/join-every-author-cases.json, which
the JavaScript library answers too (packages/graph-spec/test/join-every-author.test.mjs).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_join_every_author
"""

import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import graph_spec as gs  # noqa: E402
from graphspec.engine.mesh.after_text_merge import after_text_merge  # noqa: E402

with open(
    os.path.join(
        HERE, "..", "..", "..", "packages", "graph-spec", "test", "join-every-author-cases.json"
    ),
    encoding="utf-8",
) as f:
    CASES = json.load(f)["cases"]


def block(doc_id, lines):
    revision = "" if doc_id == "doc:base" else " · revision of doc:base"
    head = f"// graph: shop · document {doc_id} · schema s1 · as of 2026-10-01{revision}"
    return "\n".join([head, *lines])


def answer(c, author="ours"):
    """A case's answer, with its first edit made by `author`, each document read from a file."""
    old = gs.PARSER
    gs.PARSER = "profile"
    try:
        with tempfile.TemporaryDirectory() as d:
            config, log = gs.config_from({}), []

            def read(name, doc_id, lines, base=None):
                p = os.path.join(d, f"{name}.md")
                with open(p, "w", encoding="utf-8") as f:
                    f.write(f"```gql\n{block(doc_id, lines)}\n```\n")
                doc = gs.normalise(gs.parse(p), log, config, base)
                gs.validate(doc, log, config)
                return doc

            base = read("base", "doc:base", c["base"])
            ours = read("ours", f"doc:{author}", c["ours"], base)
            theirs = read("theirs", "doc:theirs", c["theirs"], base)
            p = os.path.join(d, "merged.md")
            with open(p, "w", encoding="utf-8") as f:
                f.write(f"```gql\n{block('doc:merged', c['merged'])}\n```\n")
            merged = gs.parse(p)
            return after_text_merge(base, ours, theirs, merged, config)
    finally:
        gs.PARSER = old


class SameJoinEveryAuthor(unittest.TestCase):
    def test_each_case(self):
        for c in CASES:
            with self.subTest(c["name"]):
                self.assertEqual(answer(c), c["answer"])

    def test_identical_edits_from_any_author_give_the_same_answer(self):
        for c in CASES:
            for author in ("desktop", "phone", "ai"):
                with self.subTest(c["name"], author=author):
                    said = json.dumps(answer(c, author)).replace(f"@{author}", "@ours")
                    self.assertEqual(json.loads(said), c["answer"])


if __name__ == "__main__":
    unittest.main()
