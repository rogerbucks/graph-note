"""The reader and its plain rules give Grafeo's answers — the proof that reading and checking need
no database (portable checker P1 and P2), run in the repository's own CI.

Grafeo is the reference engine: it is a test dependency here, never one the readers need. Each
case is graph blocks only, generic test data held in tests/agreement/*.json (each block a list of
lines), with what to compare beyond the rules: change sets, reviews and why layers. Every case
loads into Grafeo and into the reader's Store, and for each one:

- P1: every graph the blocks build is the same graph, by canonical hash.
- P2: every rule Grafeo checks a graph by gives the same verdict as the plain rules (graph_check);
  §20's stored-value rules (caches, track record), §22's paths and §23's judgements give the same
  values; a change set's dry run reaches the same outcome; review and the why layer agree.
- Every GQL constraint with a named reference finds the breaches its reference finds.

A further test holds the cases to their purpose: across them, every rule is seen both holding and
failing, so an agreement can never be an agreement on nothing.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_reader_agrees_with_grafeo
"""

import glob
import json
import os
import re
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
import graph_spec as gs  # noqa: E402
from graphspec.engine import settings  # noqa: E402
from engine_support import needs_engine  # noqa: E402

CASES_DIR = os.path.join(HERE, "agreement")
# a generic destination matrix for §24 H3's served rules, in the classification note's shape
NOTE = os.path.join(CASES_DIR, "classification.md")


# Where the two are known to differ, each with its cause. Not agreements: findings, held here so
# that any other difference fails, and so that putting one right fails until its entry goes.
# (String escapes were one, found 11 Oct 2026: req:3.gql-escapes put them right.)
KNOWN_P1 = {}
KNOWN_GRAFEO_REFUSES = {
    "every whitespace character GQL names parts words and items, before keywords too (§3)": (
        "Grafeo 0.5.43 parts words only at ASCII whitespace, not at every character GQL names"
    ),
}


def text(lines):
    return "\n".join(lines)


def shared_cases():
    """The repository's shared cases (packages/graph-spec/test/cases.mjs, read through Node) that
    build graphs — the ones both readers already answer alike."""
    script = (
        "import(process.argv[1]).then(m => process.stdout.write(JSON.stringify("
        "Object.entries(m.cases).filter(([, c]) => c.blocks && c.graphs && c.graphs.length)"
        ".map(([name, c]) => ({name, blocks: c.blocks.map(b => b.split('\\n'))})))))"
    )
    url = "file://" + os.path.join(ROOT, "packages", "graph-spec", "test", "cases.mjs")
    out = subprocess.run(["node", "-e", script, url], capture_output=True, text=True, check=True)
    return [dict(c, _file="cases.mjs") for c in json.loads(out.stdout)]


def load_cases():
    out = shared_cases()
    for path in sorted(glob.glob(os.path.join(CASES_DIR, "*.json"))):
        with open(path, encoding="utf-8") as f:
            for c in json.load(f)["cases"]:
                c["_file"] = os.path.basename(path)
                out.append(c)
    return out


def graph_of(block):
    return re.match(r"\s*// graph: (\S+)", block).group(1)


def in_grafeo(blocks):
    """The blocks loaded into one Grafeo database, each into the graph its header names, as the
    conformance suite loads a round's documents."""
    db = gs.grafeo.GrafeoDB()
    graphs = []
    # read first, and Grafeo given the corrected text (req:3.engine-gets-corrected)
    st = gp.Store()
    for b in blocks:
        g = graph_of(b)
        st.apply(b)
        if g not in graphs:
            db.execute(f"CREATE GRAPH {g}")
            graphs.append(g)
        db.set_graph(g)
        db.execute(gs.strip(st.corrected(b)))
    return db, graphs


def in_reader(blocks):
    st = gp.Store()
    for b in blocks:
        st.apply(b)
    return st, gr.World.from_store(st)


def grafeo_verdicts(db, g, graphs, switches, w):
    """The rules the conformance suite checks a graph by in Grafeo, as {label: ok}. A draft — no
    schema of its own and none named — is checked by the draft rule (§5, decided 6 Oct 2026),
    which has no Grafeo form, so Grafeo's declared-type rule is not asked of it."""
    db.set_graph(g)
    out = {"§18: the flat projection rebuilds the graph": gs.projects_back(db, g)}
    if not gr.is_draft(w, g):
        out["§5: every element has a declared type"] = gs.typed(db)
    rows = gs.paths_rules(db) + gs.section20(db, switches) + gs.prov_rules(db, g, graphs)
    db.set_graph(g)
    if gs.Q(db, "MATCH (d:Decision) RETURN d LIMIT 1"):
        rows += gs.judgements_rules(db, g, graphs) + gs.served_rules(db, g)
    out.update({label: ok for label, ok, _ in rows})
    db.set_graph(g)
    return out


@needs_engine
class Agreement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_note = settings.CLASSIFICATION_NOTE
        settings.CLASSIFICATION_NOTE = NOTE
        cls.matrix = gs.destination_matrix()
        cls.cases, cls.loaded, cls.grafeo_refused = [], {}, {}
        for c in load_cases():
            blocks = [text(b) for b in c["blocks"]]
            try:
                st, w = in_reader(blocks)
            except gp.ProfileError:
                # a shared case may be one the readers refuse (test_parity proves they refuse it
                # alike); a case of this test's own must be read
                if c["_file"] == "cases.mjs":
                    continue
                raise
            try:
                db, graphs = in_grafeo(blocks)
            # Any error, never narrowed. What is caught is held to KNOWN_GRAFEO_REFUSES exactly
            # (test_every_case_grafeo_refuses_is_a_known_one). So nothing new passes unseen.
            except Exception as e:
                cls.grafeo_refused[c["name"]] = str(e).splitlines()[0]
                continue
            cls.cases.append(c)
            cls.loaded[c["name"]] = (blocks, db, graphs, st, w, frozenset(c.get("switches") or []))

    @classmethod
    def tearDownClass(cls):
        settings.CLASSIFICATION_NOTE = cls.old_note

    def each(self, built_alike=True):
        """Every case, with what it loaded — by default only cases whose graphs both build alike,
        since the rules can be compared only on one graph."""
        for c in self.cases:
            if built_alike and any(k.startswith(c["name"] + " · ") for k in KNOWN_P1):
                continue
            yield (c, *self.loaded[c["name"]])

    # a plain loop in each test, never subTest: the tests-first replay counts a test by its result

    def test_there_are_cases(self):
        self.assertGreater(len(self.cases), 0)

    def test_p1_the_reader_builds_grafeos_graphs(self):
        differ = {}
        for c, blocks, db, graphs, st, w, sw in self.each(built_alike=False):
            for g in graphs:
                if gs.canon_graph(db, g) != gp.canon(st, g):
                    differ[f"{c['name']} · {g}"] = KNOWN_P1.get(f"{c['name']} · {g}", "unknown")
        # every difference is a known one, named with its cause; one that is put right fails here
        # too, so its entry is taken out
        self.assertEqual(differ, KNOWN_P1)

    def test_every_case_grafeo_refuses_is_a_known_one(self):
        self.assertEqual(sorted(self.grafeo_refused), sorted(KNOWN_GRAFEO_REFUSES))

    def test_p2_the_plain_rules_give_grafeos_verdicts(self):
        for c, blocks, db, graphs, st, w, sw in self.each():
            for g in graphs:
                if g in w.schemas.values() or g not in w.graphs:
                    continue
                mine = grafeo_verdicts(db, g, graphs, sw, w)
                plain = {label: ok for label, ok, _ in gr.check(w, g, self.matrix, sw)}
                diff = {k: (v, plain.get(k)) for k, v in mine.items() if plain.get(k) != v}
                self.assertEqual(diff, {}, f"{c['name']} {g}")

    def test_p2_section20_values_agree(self):
        names = (
            "latest_assessment",
            "confidence_from_evidence",
            "claim_status",
            "derived_ranges",
            "settled",
            "reliability",
        )
        empty = set(names) | {"calibration", "corroboration"}
        for c, blocks, db, graphs, st, w, sw in self.each():
            for g in graphs:
                if g not in w.graphs:
                    continue
                db.set_graph(g)
                for n in names:
                    theirs = getattr(gs, n)(db)
                    self.assertEqual(theirs, getattr(gr, n)(w[g]), f"{c['name']} {g} {n}")
                    empty -= {n} if theirs else set()
                for before in (True, False):
                    theirs = gs.calibration(db, before)
                    self.assertEqual(
                        theirs, gr.calibration(w[g], before), f"{c['name']} {g} cal {before}"
                    )
                    empty -= {"calibration"} if theirs else set()
                for one in (True, False):
                    theirs = gs.corroboration(db, one)
                    self.assertEqual(
                        theirs, gr.corroboration(w[g], one), f"{c['name']} {g} cor {one}"
                    )
                    empty -= {"corroboration"} if theirs else set()
        self.assertEqual(empty, set(), "values no case gives, so never compared")

    def test_p2_paths_agree(self):
        for c, blocks, db, graphs, st, w, sw in self.each():
            for g in graphs:
                if g not in w.graphs:
                    continue
                db.set_graph(g)
                G = w[g]  # noqa: N806
                for p in G.labelled("Path"):
                    steps = [
                        (r["seq"], r["id"], r["altitude"], sorted(r["labels"]))
                        for r in gs.path_steps(db, p)
                    ]
                    plain = [
                        (r["seq"], r["id"], r["altitude"], sorted(r["labels"]))
                        for r in gr.path_steps(G, p)
                    ]
                    self.assertEqual(steps, plain, f"{c['name']} {g} steps of {p}")
                    for level in range(0, 6):
                        self.assertEqual(
                            gs.view_at(db, p, level),
                            gr.view_at(G, p, level),
                            f"{c['name']} {g} {p} at {level}",
                        )
                for x in G.nodes:
                    # Grafeo orders the paths above by altitude and leaves a tie unordered. The
                    # reader breaks it by id. Grafeo's answer is put in that order to compare.
                    theirs = sorted(gs.lift(db, x), key=lambda p: (G.p(p).get("altitude") or 0, p))
                    self.assertEqual(theirs, gr.lift(G, x), f"{c['name']} {g} lift {x}")

    def test_p2_judgements_agree(self):
        for c, blocks, db, graphs, st, w, sw in self.each():
            for g in graphs:
                if g not in w.graphs or not gr.is_judgement_graph(w[g]):
                    continue
                self.assertEqual(
                    gs.current_decisions(db, g), gr.current_decisions(w, g), f"{c['name']} {g}"
                )
                for d in gr.current_decisions(w, g):
                    self.assertEqual(
                        gs.judgement_hash(db, g, d),
                        gr.judgement_hash(w, g, d),
                        f"{c['name']} {g} hash of {d}",
                    )

    def test_p2_review_agrees(self):
        reasons = set()
        for c, blocks, db, graphs, st, w, sw in self.each():
            for g in c.get("review") or []:
                theirs = gs.review(db, g, sw)
                self.assertEqual(theirs, gr.review(w, g, sw), f"{c['name']} {g}")
                reasons |= {r for why in theirs.values() for r in why or ["none"]}
        want = {"basis-moved", "assumption-weakened", "shape-changed", "none"}
        self.assertEqual(reasons, want, "every reason, and none, is seen")

    def test_p2_why_layer_agrees(self):
        sizes = set()
        for c, blocks, db, graphs, st, w, sw in self.each():
            for q in c.get("why") or []:
                args = (q["graph"], q["data"], q["top"], q["level"])
                theirs = gs.why_layer(db, *args, sw)
                self.assertEqual(theirs, gr.why_layer(w, *args, sw), f"{c['name']} {q}")
                sizes.add(bool(theirs))
        self.assertEqual(sizes, {True, False}, "a why layer with judgements and one without")

    def test_p2_a_change_sets_dry_run_reaches_grafeos_outcome(self):
        # the reader may refuse what is outside the profile ('it loads') but is never more lenient
        outcomes, refreshed = set(), False
        for c, blocks, db, graphs, st, w, sw in self.each():
            base = [(graph_of(b), b) for b in blocks]
            for s in c.get("changesets") or []:
                block = text(s)
                old, settings.PARSER = settings.PARSER, "grafeo"  # Grafeo's dry run, asked for
                try:
                    res, h, after = gs.check_changeset(base, block, sw)
                finally:
                    settings.PARSER = old
                pres, ph, pafter = gr.check_changeset(base, block, self.matrix, gs.lint, sw)
                gf = {label for label, ok, _ in res if not ok}
                pf = {label for label, ok, _ in pres if not ok}
                self.assertEqual(bool(gf), bool(pf), f"{c['name']}: {sorted(gf)} {sorted(pf)}")
                self.assertTrue(gf <= pf and pf - gf <= {"it loads"}, f"{c['name']}: {pf - gf}")
                if "it loads" not in pf:
                    self.assertEqual(after, pafter, c["name"])
                    self.assertEqual(
                        (h or {}).get("refreshes") or [], (ph or {}).get("refreshes") or []
                    )
                outcomes.add(bool(gf))
                refreshed |= bool((h or {}).get("refreshes"))
        self.assertEqual(outcomes, {True, False}, "a change set offered and one refused")
        self.assertTrue(refreshed, "a change set that refreshes a cache")

    def test_a_gql_constraint_finds_what_its_reference_finds(self):
        def norm(bs):
            return sorted(
                (
                    tuple(sorted(map(tuple, b.get("slots") or []))),
                    tuple(sorted(b.get("edges") or [], key=str)),
                )
                for b in bs
            )

        found = 0
        for c, blocks, db, graphs, st, w, sw in self.each():
            if not c.get("configuration"):
                continue
            cfg = gs.config_from(c["configuration"])
            G = w[graphs[0]]  # noqa: N806
            nodes = {i: {"labels": set(ls), "props": dict(p)} for i, (ls, p) in G.nodes.items()}
            # a join's edge map: keyed by (from, type, to, its identifying values) (§5)
            edges = {
                (s, t, d, tuple(p.get(a) for a in cfg["edge_keys"].get(t, ()))): dict(p)
                for s, t, d, p in G.edges
            }
            for rule in c["configuration"]["constraints"]:
                # the GQL itself, in Grafeo: config_from runs the named twin in its place,
                # whatever the parser (req:3.reader-default)
                got = norm(gs.gql_rule(rule["gql"], cfg)(nodes, edges))
                self.assertEqual(
                    got, norm(gs.RULES[rule["reference"]](nodes, edges)), f"{c['name']} {rule}"
                )
                found += len(got)
        self.assertGreater(found, 0, "no case breaks a rule, so no breach is compared")

    def test_every_rule_is_seen_holding_and_failing(self):
        seen = {}
        for c, blocks, db, graphs, st, w, sw in self.each():
            for g in graphs:
                if g in w.graphs:
                    for label, ok in grafeo_verdicts(db, g, graphs, sw, w).items():
                        seen.setdefault(label, set()).add(ok)
        one_sided = {k: v for k, v in seen.items() if v != {True, False}}
        self.assertEqual(one_sided, {})


if __name__ == "__main__":
    unittest.main()
