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
        # a plain loop, never subTest: the tests-first replay counts a test by its own result
        for name, q in self.loaded["cases"].items():
            self.assertEqual(answer(q), self.expected[slug(name)], f"case {name}")

    def test_a_change_set_current_and_stale(self):
        st = gp.Store()
        for b in self.loaded["changeset"]["blocks"]:
            st.apply(b)
        against = gr.canon(gr.World.from_store(st)["library"])[:16]
        q = json.loads(json.dumps(self.loaded["changeset"]).replace(AGAINST, against))
        self.assertEqual(answer(q), self.expected["a-change-set-current-and-stale"])


CORE = os.path.join(ROOT, "packages", "core", "src", "partial-read.ts")

# A broken block, read with a small budget of reading again (10 Oct 2026): past it, both readers
# leave the rest out at once, from the failing line, each read again and each trial charged its
# length in UTF-16 units — an emoji is two.
CUT_BLOCKS = [
    "// graph: trip\n(home:Place {name: 'Home 🏠'}),\n(walk:Leg {name: 'Walk'}),\n"
    "(bus:Leg {name 'Bus'}),\n(train:Leg {name 'Train'}),\n(tram:Leg {name 'Tram'}),\n"
    "(walk)-[:STARTS_AT]->(home)",
    "// graph: trip\n(start:Place {name: 'Start'}),\n(stop:Place {name: 'Stop'}), "
    "(gone:Leg {name 'Gone'}), (bus2:Leg {name: 'Bus'})\n(ferry:Leg {name: 'Ferry'})",
]


CUT_SAID = "left out from this line on"


def core_read(blocks, budget):
    """The core's reading of the blocks, by Node: each error's block, line, whether it says the
    rest was cut, and what was left out; and the ids of each graph's things. (The parser's own
    words quote a token each in its language's way, so they are not compared.)"""
    script = (
        "import(process.argv[1]).then((m) => {"
        " const r = m.readBlocks(JSON.parse(process.argv[2]), [], Number(process.argv[3]));"
        " process.stdout.write(JSON.stringify({errors: r.problems"
        ".filter((p) => p.severity === 'error').map((p) => [p.block, p.line,"
        f" p.message.endsWith('{CUT_SAID}'), p.dropped]),"
        " ids: Object.fromEntries(Object.entries(r.store.graphs).map(([g, x]) =>"
        " [g, [...x.nodes.values()].map((n) => n.props.id)]))})) })"
    )
    out = subprocess.run(
        ["node", "-e", script, "file://" + CORE, json.dumps(blocks), str(budget)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


class ReadingCut(unittest.TestCase):
    def test_past_the_budget_the_core_and_python_leave_out_the_same(self):
        # a plain loop, never subTest: the tests-first replay counts a test by its own result
        for budget in (10**9, 2 * len(CUT_BLOCKS[0].encode("utf-16-le")) // 2, 700):
            store, problems = gp.read_for_drawing(CUT_BLOCKS, budget=budget)
            python = {
                "errors": [
                    [p["block"], p["line"], p["message"].endswith(CUT_SAID), p.get("dropped")]
                    for p in problems
                    if p["severity"] == "error"
                ],
                "ids": {
                    g: [n["props"].get("id") for n in x["nodes"].values()]
                    for g, x in store.graphs.items()
                },
            }
            self.assertEqual(python, core_read(CUT_BLOCKS, budget), f"budget {budget}")

    def test_a_small_budget_cuts_and_a_large_one_does_not(self):
        _, cut = gp.read_for_drawing(CUT_BLOCKS, budget=700)
        _, whole = gp.read_for_drawing(CUT_BLOCKS)
        self.assertTrue(any(CUT_SAID in p["message"] for p in cut))
        self.assertFalse(any(CUT_SAID in p["message"] for p in whole))


# A line neither reader can read is quoted cut at 20 UTF-16 units, never inside an emoji, by both
# readers (review of PR #28): the cases are shared with packages/core/test/layout-parity.test.js.
with open(os.path.join(JS_TEST, "cannot-read-cases.json"), encoding="utf-8") as f:
    CANNOT_READ = json.load(f)["cases"]


def cannot_read(messages):
    return [m for m in messages if "cannot read" in m]


def core_messages(blocks):
    """The core's problem messages for each block, read alone, by Node."""
    script = (
        "import(process.argv[1]).then((m) => process.stdout.write(JSON.stringify("
        "JSON.parse(process.argv[2]).map((b) => m.readBlocks([b], []).problems"
        ".map((p) => p.message)))))"
    )
    out = subprocess.run(
        ["node", "-e", script, "file://" + CORE, json.dumps(blocks)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


class CannotRead(unittest.TestCase):
    def test_a_line_that_cannot_be_read_is_quoted_the_same_by_both_readers(self):
        core = core_messages([c["block"] for c in CANNOT_READ])
        # a plain loop, never subTest: the tests-first replay counts a test by its own result
        for c, theirs in zip(CANNOT_READ, core):
            ours = cannot_read(p["message"] for p in gp.read_for_drawing([c["block"]])[1])
            self.assertEqual(len(ours), 1, c["name"])
            self.assertIn(f"cannot read '{c['excerpt']}'", ours[0], c["name"])
            self.assertEqual(ours, cannot_read(theirs), c["name"])


# Spec §3, req:3.id-once: a variable is written once in a block, and an id names one node. Each
# block here breaks one half, and both readers must refuse it at the same block and line.
ID_ONCE_BLOCKS = {
    "a variable written twice in one block": "// graph: g\n(x:T {n:1}),\n(x:T {m:2})",
    "an id that clashes with another node's name": "// graph: g\n(x:T {id:'y'}),\n(y:T {n:1})",
}


def refusal_kind(message):
    """Which half of the rule a refusal is, whatever words each reader quotes it in."""
    if "written twice" in message:
        return "variable twice"
    if "is already a node" in message:
        return "id clash"
    return message


def core_refusals(blocks):
    """The core's errors for each block, read alone, by Node: block, line and message."""
    script = (
        "import(process.argv[1]).then((m) => process.stdout.write(JSON.stringify("
        "JSON.parse(process.argv[2]).map((b) => m.readBlocks([b], []).problems"
        ".filter((p) => p.severity === 'error').map((p) => [p.block, p.line, p.message])))))"
    )
    out = subprocess.run(
        ["node", "-e", script, "file://" + CORE, json.dumps(blocks)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


class IdOnce(unittest.TestCase):
    def test_both_readers_refuse_a_name_or_id_used_twice_alike(self):
        names = list(ID_ONCE_BLOCKS)
        core = core_refusals([ID_ONCE_BLOCKS[n] for n in names])
        # a plain loop, never subTest: the tests-first replay counts a test by its own result
        for name, theirs in zip(names, core):
            _, problems = gp.read_for_drawing([ID_ONCE_BLOCKS[name]])
            ours = [
                [p["block"], p["line"], refusal_kind(p["message"])]
                for p in problems
                if p["severity"] == "error"
            ]
            self.assertEqual(len(ours), 1, name)
            self.assertIn(ours[0][2], ("variable twice", "id clash"), name)
            self.assertEqual(ours, [[b, ln, refusal_kind(m)] for b, ln, m in theirs], name)

    def test_parse_refuses_what_the_core_refuses_before_grafeo_is_given_it(self):
        # req:3.engine-reads-first: parse() under the default parser, Grafeo, reads the block with
        # the reader first, so it refuses each block the core refuses, at the same line
        self.assertEqual(gs.PARSER, "grafeo")
        names = list(ENGINE_BLOCKS)
        core = core_refusals([ENGINE_BLOCKS[n] for n in names])
        # a plain loop, never subTest: the tests-first replay counts a test by its own result
        for name, theirs in zip(names, core):
            self.assertEqual(len(theirs), 1, name)
            with tempfile.TemporaryDirectory() as d:
                p = os.path.join(d, "doc.md")
                with open(p, "w", encoding="utf-8") as f:
                    f.write(f"```gql\n{ENGINE_BLOCKS[name]}\n```\n")
                with self.assertRaises(gp.ProfileError, msg=name) as e:
                    gs.parse(p)
            ours = [e.exception.line, refusal_kind(e.exception.message)]
            self.assertEqual(ours, [theirs[0][1], refusal_kind(theirs[0][2])], name)


# Blocks the readers refuse, each in a document parse() can read the header of: the two halves of
# req:3.id-once, and a block that is not one data statement, which Grafeo would take whole.
DOC_HEAD = "// graph: g · document doc:one · schema s1 · as of 2026-10-01"
ENGINE_BLOCKS = {
    "a variable written twice in one block": f"{DOC_HEAD}\n(x:T {{n:1}}),\n(x:T {{m:2}})",
    "an id that clashes with another node's name": f"{DOC_HEAD}\n(x:T {{id:'y'}}),\n(y:T {{n:1}})",
    "one id given in two INSERT statements": (
        f"{DOC_HEAD}\nINSERT (a:T {{id: 'x'}})\nINSERT (b:T {{id: 'x'}})"
    ),
}


if __name__ == "__main__":
    unittest.main()
