"""A change set may DELETE and SET, each statement naming one target (graph spec §24, 16 Oct 2026).

The cases are packages/graph-spec/test/change-cases.json, the table the JavaScript reader's
changes.test.mjs runs too. Here the Python reader runs each one, and the JavaScript reader is run
live by Node on the same blocks: the same checks failed, the same changes with the same ids and the
same state after (req:24.cs-two-readers).

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_changes
"""

import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
JS = os.path.join(ROOT, "packages", "graph-spec")
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
import graph_spec as gs  # noqa: E402

with open(os.path.join(JS, "test", "change-cases.json"), encoding="utf-8") as f:
    TABLE = json.load(f)

BASE = "\n".join(TABLE["head"] + TABLE["base_rest"])


def state_of(text):
    st = gp.Store()
    st.apply(text)
    return gp.canon(st, "library")[0][:16]


NOW = state_of(BASE)


def block_of(case):
    header = f"// graph: library · CHANGE SET cs · against {case.get('against', NOW)} · by {case.get('by', 'ada')}"
    return "\n".join([header, *case["body"]])


def python_answer(case):
    res, h, after = gr.check_changeset(
        [("library", BASE)], block_of(case), {}, gs.lint, frozenset()
    )
    return {
        "failed": sorted(label for label, ok, _ in res if not ok),
        "changes": [[c["op"], c["reason"], c["id"]] for c in h["changes"]],
        "after": after,
    }


def node_answers():
    request = {
        "changesets": [{"base": [BASE], "block": block_of(c)} for c in TABLE["cases"]],
        "matrix": {},
    }
    out = subprocess.run(
        ["node", os.path.join(JS, "bin", "graph-spec-check-node.js")],
        input=json.dumps(request),
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)["changesets"]


class Changes(unittest.TestCase):
    def test_every_case_is_read_as_the_table_says(self):
        # a plain loop, never subTest: the tests-first replay counts a test by its own result
        ids = {}
        for c in TABLE["cases"]:
            got = python_answer(c)
            self.assertEqual(
                got["failed"], sorted(TABLE["labels"][k] for k in c["failed"]), c["name"]
            )
            self.assertEqual([x[:2] for x in got["changes"]], c["changes"], c["name"])
            self.assertTrue(all(len(x[2]) == 16 for x in got["changes"]), c["name"])
            self.assertEqual(len({x[2] for x in got["changes"]}), len(got["changes"]), c["name"])
            want = None if c["after"] is None else state_of("\n".join(TABLE["head"] + c["after"]))
            self.assertEqual(got["after"], want, c["name"])
            if len(got["changes"]) == 1:
                ids[c["name"]] = got["changes"][0][2]
            if c.get("same_id_as"):
                self.assertEqual(got["changes"][0][2], ids[c["same_id_as"]], c["name"])

    def test_both_readers_read_the_same_changes(self):
        theirs = node_answers()
        for c, js in zip(TABLE["cases"], theirs):
            got = python_answer(c)
            self.assertEqual(got["failed"], js["failed"], c["name"])
            self.assertEqual(
                got["changes"], [[x["op"], x["reason"], x["id"]] for x in js["changes"]], c["name"]
            )
            self.assertEqual(got["after"], js["after"], c["name"])

    def test_a_change_set_with_no_delete_or_set_reads_no_changes(self):
        block = f"// graph: library · CHANGE SET cs · against {NOW} · by ada\n(late:Book {{title: 'A late book'}})"
        res, h, _ = gr.check_changeset([("library", BASE)], block, {}, gs.lint)
        self.assertEqual(h["changes"], [])
        self.assertEqual([label for label, ok, _ in res if not ok], [])


if __name__ == "__main__":
    unittest.main()
