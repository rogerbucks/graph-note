"""The Python library gives the JavaScript library's answers on every case the repository holds.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest discover -s tests

The cases are packages/graph-spec/test/cases.mjs, read through Node; the answers are the ones
recorded in packages/graph-spec/test/expected.json. Each answer is built here in the shape the Node
adapter gives (bin/graph-spec-check-node.js), from the Python functions that do the same work.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
import hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
JS_TEST = os.path.join(ROOT, "packages", "graph-spec", "test")
sys.path.insert(0, os.path.join(HERE, "..", "src"))

# the library's modules are flat files in src/, importable only once it is on sys.path
import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
import graph_spec as gs  # noqa: E402

AGAINST = "@@AGAINST@@"


def slug(s):
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))


def load_cases():
    """The cases, and the change-set case with a placeholder for the hash it is made against."""
    script = (
        "import(process.argv[1]).then(m => process.stdout.write(JSON.stringify("
        "{cases: m.cases, changeset: m.changesetCase(process.argv[2])})))"
    )
    url = "file://" + os.path.join(JS_TEST, "cases.mjs")
    out = subprocess.run(
        ["node", "-e", script, url, AGAINST], capture_output=True, text=True, check=True
    ).stdout
    return json.loads(out)


def join_answer(q):
    """A join of document blocks, as the Node adapter's joinDocs gives it."""
    old = gs.PARSER
    gs.PARSER = "profile"  # the portable reader, as the JavaScript join reads its documents
    try:
        with tempfile.TemporaryDirectory() as d:
            paths = []
            for i, block in enumerate(q["docs"]):
                p = os.path.join(d, f"doc{i}.md")
                paths.append(p)
                with open(p, "w", encoding="utf-8") as f:
                    f.write(f"```gql\n{block}\n```\n")
            config = gs.config_from(q.get("config"))
            log = []
            docs = []
            for p in paths:
                doc = gs.normalise(gs.parse(p), log, config)
                gs.validate(doc, log, config)
                docs.append(doc)
            joined = gs.join(docs, config, q.get("findings") or [])
    finally:
        gs.PARSER = old
    nv = gr.norm
    return {
        "rows": sorted(
            [[r[0], str(r[1]), str(r[2]), r[4], r[5]] for r in log + joined["report"]], key=gr.jcs
        ),
        "claims": {k: [c["status"], c["confidence"]] for k, c in joined["claims"].items()},
        "pairs": [list(p) for p in joined["pairs"]],
        "paradoxes": sorted([[p[0], p[1], list(p[2])] for p in joined["paradoxes"]], key=gr.jcs),
        "nodes": {
            k: [sorted(n["labels"]), {x: nv(v) for x, v in n["props"].items()}]
            for k, n in joined["nodes"].items()
        },
        "edges": {
            gr.jcs([k[0], k[1], nv(k[2]), [nv(x) for x in k[3]]]): {x: nv(v) for x, v in p.items()}
            for k, p in joined["edges"].items()
        },
    }


def answer(q):
    """What the Node adapter answers for a request, built from the Python library."""
    sw = frozenset(q.get("switches") or [])
    out = {"canon": {}, "verdicts": {}, "reviews": [], "whys": [], "changesets": [], "lint": []}
    try:
        st = gp.Store()
        for b in q.get("blocks") or []:
            st.apply(b)
        world = gr.World.from_store(st)
        out["views"] = {}
        for g in q.get("graphs") or []:
            out["canon"][g] = gr.canon(world[g])
            out["verdicts"][g] = [
                [label, bool(ok)] for label, ok, _ in gr.check(world, g, q.get("matrix"), sw)
            ]
            out["views"][g] = gr.views(
                world[g], None if world[g].labelled("ElementType") else world.schema_for(g)[1]
            )
        for t in q.get("lint") or []:
            out["lint"].append([f["trap"] for f in gs.lint(t)])
    except Exception as e:
        out["error"] = str(e)
    for c in q.get("changesets") or []:
        base = [(re.match(r"\s*// graph: (\S+)", b).group(1), b) for b in c["base"]]
        res, h, after = gr.check_changeset(base, c["block"], q.get("matrix"), gs.lint, sw)
        out["changesets"].append(
            {
                "failed": sorted(label for label, ok, _ in res if not ok),
                "after": after,
                "refreshes": [list(x) for x in (h or {}).get("refreshes") or []],
            }
        )
    if q.get("join"):
        out["join"] = join_answer(q["join"])
    if q.get("completeness"):
        st = gp.Store()
        for b in q.get("blocks") or []:
            st.apply(b)
        c = q["completeness"]
        out["completeness"] = gr.completeness(gr.World.from_store(st)[c["graph"]], c["today"])
    if q.get("sha256"):
        out["sha256"] = [hashlib.sha256(s.encode()).hexdigest() for s in q["sha256"]]
    if q.get("jcs"):
        out["jcs"] = [gr.jcs(v) for v in q["jcs"]]
    return json.loads(json.dumps(out, default=str))


class Parity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.loaded = load_cases()
        with open(os.path.join(JS_TEST, "expected.json"), encoding="utf-8") as f:
            cls.expected = json.load(f)

    def test_every_case(self):
        for name, q in self.loaded["cases"].items():
            with self.subTest(case=name):
                self.assertEqual(answer(q), self.expected[slug(name)])

    def test_a_change_set_current_and_stale(self):
        st = gp.Store()
        for b in self.loaded["changeset"]["blocks"]:
            st.apply(b)
        against = gr.canon(gr.World.from_store(st)["library"])[:16]
        q = json.loads(json.dumps(self.loaded["changeset"]).replace(AGAINST, against))
        self.assertEqual(answer(q), self.expected["a-change-set-current-and-stale"])


if __name__ == "__main__":
    unittest.main()
