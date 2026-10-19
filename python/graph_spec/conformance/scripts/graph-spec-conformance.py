#!/usr/bin/env python3
"""Runs the graph spec's conformance suite — every case's expected answers, the general properties and the safeguards — and writes the report.

Usage:
  ~/.venvs/graphspec/bin/python zzSupport/_scripts/graph-spec-conformance.py            # run the suite, write the report
  ~/.venvs/graphspec/bin/python zzSupport/_scripts/graph-spec-conformance.py --check    # run it, write nothing; exit 1 on any failure

Writes: Standards/Graph spec conformance — report.md and Standards/Graph spec requirements — trace report.md (both generated, regenerable); nothing with --check. Exit 1 if any check fails.

Category: Checks — graph model

WHY (4 Oct 2026): Roger — "make the tests part of the spec." §17 of the Graph spec model makes this
suite a condition of conformance. The cases and their expected answers are data in the test documents
(a yaml block starting `# conformance case`); the configurations are data in the suite note. This script
holds no expected answers of its own — only the general properties every case must keep, and the
safeguards it switches off to prove each one is needed.
Needs Grafeo 0.5.43 and PyYAML in ~/.venvs/graphspec (spec §3 names the dialect).
6 Oct 2026: also runs graph-spec-trace.py — the spec's meta-schema and requirements graph — and checks both in Grafeo.
14 Oct 2026: a third kind of case, `reader` — short blocks read by both portable readers and by the engine route (gs.load), for
the reading rules of §3, §14, §26 and §27 that graph-spec 0.4.3 made provable: Standards/Reader test — what the readers keep, own and refuse.
Its second case, Standards/Plain reading test — the library's tools on the reader's reading, runs the process engine, SCXML
export, loan balance, view server and filler on the reader's reading and on Grafeo, and requires the same answers; plus §27's tests.
"""
import sys, os, re, glob, json, yaml, datetime as dt
from collections import Counter
from itertools import permutations
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graph_spec as gs

VAULT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
STD = os.path.join(VAULT, 'Standards')
SUITE = os.path.join(STD, 'Graph spec conformance suite.md')
REPORT = os.path.join(STD, 'Graph spec conformance — report.md')
REPORT_UUID = 'a7276d77-d8fd-48f0-91f4-43de7cb86f77'
CHECKS = ('cycles', 'cardinality', 'constraints', 'determinism', 'flags')
SAFEGUARDS = {   # switch: what it switches off
    'validate': 'checking each document on its own first',
    'unit-maps': 'restating units',
    'time-restatement': 'restating values that change over time',
    'cycles': 'the cycle check',
    'cardinality': 'the "too many" limits',
    'constraints': 'the declared rules across values (and §16 rules 3–4)',
    'determinism': 'the §7 determinism check',
    'flags': 'the flags for possible duplicates and undeclared properties',
    'base': 'joining revisions from their earlier version (three-way)',
    'base-dates': 'keeping the earlier version\'s date on an unchanged value',
    'hold-removals': 'holding back a removal that meets a change',
    'edge-keys': 'declared identity for repeatable relationships (§5)',
    'rule3-every-level': '§16 rule 3 at every level, not only the parent',
    'before-settlement': 'counting only assessments made before a claim was settled (§20)',
    'one-vote-per-source': 'one vote per source in corroboration (§20)',
    'no-restart': 'a self-transition never restarts its sub-flow (§16 rule 2)',
    'straight-quotes': "straightening Word's curly quotes when a block is extracted (§3)",
    'why-folded': 'showing judgements on what is folded into a view, not only on what is on screen (§23)',
    'assumption-bands': "surfacing a judgement when an assumption's likelihood falls a band, not only when it is refuted (§23)",
    'view-fence': 'fencing graph text as data when it is served to an AI (§24 H3)',
    'lens-pins': 'checking a judgement resting on a lens bucket against the lens rule (§23, §15)',
    'model-may-add': 'limiting what a model may add to claims, assessments, evidence, proposals and options (§24 H4)',
    # 'additions-only' is left out here (19 Oct 2026). Since 16 Oct a change set may DELETE and SET.
    # §24 rule 4 refuses each change to a record or a cache on its own, and X5 proves it.
    # The reader refuses an INSERT that reuses an id. So the switch's "it only adds" check can no longer fail.
}
def doc_class(path):
    """A case document's class, from its test_class line: test data, so the repository's guard against confidential
    files never mistakes it for a real class. A document with none falls back to the library's own reading."""
    m = re.search(r"^test_class:\s*(\S+)\s*$", open(path, encoding='utf-8').read(), re.M)
    return m.group(1) if m else gs.document_class(path)

XSD = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'graph_spec_xsd')

def structs(db, g, C):
    """A loaded graph as the join's node and edge maps, edges keyed by their declared identity (§5)."""
    N, R = gs.read(db, g); byk = {n['k']: n['p']['id'] for n in N}
    nodes = {n['p']['id']: {'labels': set(n['l']), 'props': dict(n['p'])} for n in N}
    edges = {gs.ekey(byk[r['s']], r['ty'], byk[r['t']], dict(r['p'] or {}), C): dict(r['p'] or {}) for r in R}
    return nodes, edges

# ── graph cases: documents loaded in order into their named graphs, checked by rules, expectations and mutations ──
def doc_block(ref, mutation=None):
    """The GQL block of a document — 'Name' or 'Name#Heading' for the first block under a heading — with any mutation applied."""
    name, _, heading = ref.partition('#')
    text = open(os.path.join(STD, name + '.md'), encoding='utf-8').read()
    if heading: text = text[text.index('## ' + heading):]
    block = re.search(r"```gql\n(.*?)\n```", text, re.S).group(1)
    if mutation and mutation.get('document') == ref:
        if 'append' in mutation: block = block.rstrip() + mutation['append']
        if 'replace' in mutation:
            assert mutation['replace'] in block, f"mutation target not found: {mutation['replace']}"
            block = block.replace(mutation['replace'], mutation['with'], 1)
        if 'replace_regex' in mutation:
            block, n = re.subn(mutation['replace_regex'], mutation['with_regex'], block, count=1)
            assert n == 1, f"mutation target not found: {mutation['replace_regex']}"
    return block

def load_graphs(refs, mutation=None):
    db = gs.grafeo.GrafeoDB(); graphs = []
    for ref in refs:
        block = gs.require_graph_line(doc_block(ref, mutation), ref); g = re.match(r"\s*// graph: (\S+)", block).group(1)
        if g not in graphs: db.execute(f"CREATE GRAPH {g}"); graphs.append(g)
        db.set_graph(g); db.execute(gs.strip(block))
    db.set_graph(graphs[0]); return db, graphs

def lint_detail(found): return '; '.join(f"line {x['line']}: {x['trap']} — {x['text']} → {x['fix']}" for x in found)

def run_graphs_round(case, rnd, confs, switches=frozenset(), mutation=None):
    res = []
    def check(label, ok, detail=''): res.append((label, bool(ok), detail))
    if 'dialect-lint' not in switches:   # §24 H1: every block and query is linted before it runs
        for ref in list(rnd['documents']) + [q['query'] for q in (rnd.get('expect') or {}).get('queries') or []]:
            found = gs.lint(doc_block(ref, mutation)); check(f"{ref.partition('#')[2] or ref}: passes the dialect linter (§24 H1)", not found, lint_detail(found))
    try: db, graphs = load_graphs(rnd['documents'], mutation)
    except Exception as e: return [(f"{case['case']} · {rnd['name']}: {l}", ok, d) for l, ok, d in res + [("the documents load", False, f"{type(e).__name__}: {e}")]]
    tag = lambda t: f"[{t}] " if t else ''
    import gql_profile as gp, graph_rules as gr   # portable checker P2: the same rules on the profile reader's graph, no database
    try:
        st_ = gp.Store(); [st_.apply(doc_block(r, mutation)) for r in rnd['documents']]; W = gr.World.from_store(st_)
    except gp.ProfileError as e: W = None; check("the profile reader reads the round's documents (portable checker)", False, str(e))
    verdicts = {}
    def vcheck(g, key, label, ok, d=''):
        check(label, ok, d); verdicts.setdefault(g, {})[key] = bool(ok)
    for g in graphs:
        db.set_graph(g)
        vcheck(g, "§5: every element has a declared type", f"graph {g}: every element has a declared type (§5)", gs.typed(db))
        vcheck(g, "§18: the flat projection rebuilds the graph", f"graph {g}: the flat projection rebuilds the graph (§18)", gs.projects_back(db, g))
        if 'paths' in (rnd.get('rules') or []):
            for l, ok, d in gs.paths_rules(db): vcheck(g, l, f"graph {g}: {l}", ok, d)
        if 'section20' in (rnd.get('rules') or []):
            for l, ok, d in gs.section20(db, switches): vcheck(g, l, f"graph {g}: {l}", ok, d)
        if 'judgements' in (rnd.get('rules') or []) and gs.Q(db, "MATCH (d:Decision) RETURN d LIMIT 1"):
            for l, ok, d in gs.judgements_rules(db, g, graphs) + gs.served_rules(db, g): vcheck(g, l, f"graph {g}: {l}", ok, d)
            db.set_graph(g)
    if W is not None:
        matrix = gs.destination_matrix()
        for g in graphs:
            plain = {l: ok for l, ok, _ in gr.check(W, g, matrix, switches)}; mine = verdicts.get(g, {})
            diff = {l: (ok, plain.get(l)) for l, ok in mine.items() if plain.get(l) != ok}
            check(f"graph {g}: the portable rules give the Grafeo rules' verdicts, with no database — {len(mine)} rules (portable checker P2)", not diff, str(diff)[:300])
    C = build_config(resolve(case['configuration'], confs), switches) if case.get('configuration') else None
    if 'process' in (rnd.get('rules') or []):
        for g in graphs:
            db.set_graph(g)
            if not gs.Q(db, "MATCH (s:State) RETURN s LIMIT 1"): continue
            nodes, edges = structs(db, g, C)
            rule_agreement(C, {'nodes': nodes, 'edges': edges}, lambda l, ok, d='': check(f"graph {g}: {l}", ok, d))
            br = gs.breaches(nodes, edges, C, tuple(c for c in ('cycles', 'cardinality', 'constraints', 'determinism') if c not in switches))
            check(f"graph {g}: §7 and §16 hold — deterministic, one start, finals final, no else over a state above, done where a sub-flow ends", not br, str([b['why'] for b in br][:3]))
    db.set_graph(graphs[0]); E = rnd.get('expect') or {}
    for f in E.get('figures') or []:
        r = gs.FIGURES[f['figure']](db, f['of']); ok = r['result'] == f['result'] and all(same(r.get(k), f[k]) for k in ('value', 'currency') if k in f)
        check(f"{tag(f.get('test'))}{f['figure']} of {f['of']}: {f['result']}" + (f" {f['value']}" if 'value' in f else ''), ok, str(r))
    claims = {r['c']: r['p'] for r in gs.Q(db, "MATCH (c:Claim) RETURN c.id AS c, properties(c) AS p")}
    for c in E.get('claim_values') or []:
        got = claims.get(c['claim'], {}); want = {k: v for k, v in c.items() if k not in ('test', 'claim')}
        check(f"{tag(c.get('test'))}{c['claim']}: " + ', '.join(f"{k} {v}" for k, v in want.items()), all(same(got.get(k), v) for k, v in want.items()), str({k: got.get(k) for k in want}))
    if 'lens' in E:
        got = gs.certainty_lens(db); check(f"{tag(E['lens'].get('test'))}certainty lens: " + ', '.join(f"{k.split(':')[1]} {v}" for k, v in E['lens']['buckets'].items()), got == E['lens']['buckets'], str(got))
    if 'band_values' in E:
        got = {r['t']: [r['lo'], r['hi']] for r in gs.Q(db, "MATCH (b:LikelihoodBand) RETURN b.term AS t, b.low_pct AS lo, b.high_pct AS hi")}
        check(f"{tag(E['band_values'].get('test'))}the scale read from the graph: " + ', '.join(f"{k} {v[0]}–{v[1]}%" for k, v in E['band_values']['of'].items()), all(got.get(k) == v for k, v in E['band_values']['of'].items()), str(got))
    OPS = {'both': lambda a, b, d: gs.both(a, b, d), 'either': lambda a, b, d: gs.either(a, b, d), 'neither': lambda a, b, d: gs.negate(gs.either(a, b, d))}
    import random
    for r in E.get('ranges') or []:
        a, b = gs.RANGE[r['a']], gs.RANGE[r['b']]; iv = OPS[r['op']](a, b, r['dependence'])
        check(f"{tag(r.get('test'))}{r['op']}: {r['a']} and {r['b']}, dependence {r['dependence']} → {r['range'][0]}–{r['range'][1]}%, {r['words']}",
              abs(iv[0] - r['range'][0]) < 1e-9 and abs(iv[1] - r['range'][1]) < 1e-9 and gs.words(iv) == r['words'], f"got {iv} {gs.words(iv)}")
        if r['dependence'] == 'unknown' and r['op'] in ('both', 'either'):
            random.seed(20261004); bad = used = 0
            for _ in range(60000):
                w = [random.random() for _ in range(4)]; t = sum(w); p11, p10, p01, p00 = (x / t * 100 for x in w); pa, pb = p11 + p10, p11 + p01
                if a[0] <= pa <= a[1] and b[0] <= pb <= b[1]:
                    used += 1; v = p11 if r['op'] == 'both' else p11 + p10 + p01; bad += not (iv[0] - 1e-9 <= v <= iv[1] + 1e-9)
            check(f"{tag(r.get('test'))}brute force agrees: random joint probabilities fitting both inputs all land in {r['range'][0]}–{r['range'][1]}%", bad == 0 and used > 100, f"{used} tables, {bad} outside")
    for o in E.get('outcomes') or []:
        got = gs.outcomes(gs.RANGE[o['a']], gs.RANGE[o['b']])
        check(f"{tag(o.get('test'))}joint outcomes of {o['a']} and {o['b']}, independent", all(all(abs(x - y) < 1e-9 for x, y in zip(got[k], v)) for k, v in o['of'].items()), str(got))
    for i in E.get('independence') or []:
        allowed = not (gs.sources_of(db, i['claims'][0]) & gs.sources_of(db, i['claims'][1]))
        check(f"{tag(i.get('test'))}independence of {' and '.join(i['claims'])} {'may' if i['allowed'] else 'may not'} be declared", allowed == i['allowed'])
    if E.get('calibration'):
        cal = gs.calibration(db, 'before-settlement' not in switches)
        for c in E['calibration']:
            got = cal.get((c['assessor'], c['word']))
            if c.get('absent'): check(f"{tag(c.get('test'))}{c['assessor']} has no calibration for {c['word']} — rated after settlement, so not counted", got is None, str(got)); continue
            ok = got and (got['settled'], got['came_true'], list(got['range']), got['verdict']) == (c['settled'], c['came_true'], c['range'], c['verdict'])
            check(f"{tag(c.get('test'))}{c['assessor']} · {c['word']}: {c['came_true']} of {c['settled']} → {c['range'][0]}–{c['range'][1]}%, {c['verdict']}", ok, str(got))
    if E.get('reliability'):
        rel = gs.reliability(db)
        for c in E['reliability']:
            got = rel.get(c['source']); ok = got and (got['backed'], got['came_true'], list(got['range'])) == (c['backed'], c['came_true'], c['range']) and gs.words(got['range']) == c['words']
            check(f"{tag(c.get('test'))}{c['source']}: {c['came_true']} of {c['backed']} → {c['range'][0]}–{c['range'][1]}%, {c['words']}", ok, str(got))
    if 'marker' in E:
        got = gs.calibrated_marker(db); check(f"{tag(E['marker'].get('test'))}trusted for: " + '; '.join(f"{k} {v or 'nothing yet'}" for k, v in E['marker']['of'].items()), got == E['marker']['of'], str(got))
    if E.get('corroboration'):
        cor = gs.corroboration(db, 'one-vote-per-source' not in switches)
        for c in E['corroboration']:
            got = cor.get(c['claim']); check(f"{tag(c.get('test'))}{c['claim']} corroborated: {c['range'][0]}–{c['range'][1]}%, {c['words']}", got and list(got) == c['range'] and gs.words(got) == c['words'], str(got))
    if 'equivalent' in E:
        q = E['equivalent']; restart = 'no-restart' in switches
        db.set_graph(q['flat']); flat = gs.Machine(db); db.set_graph(q['subflow']); sub = gs.Machine(db, restart_on_self=restart)
        mp = {tuple(k.split(' / ')): v for k, v in q['map'].items()}
        dbs = []
        for g in (q['flat'], q['subflow']): db.set_graph(g); dbs.append(g)
        db.set_graph(q['flat']); ev1 = gs.process_events([db], (C['contexts'] if C else {})); db.set_graph(q['subflow']); ev2 = gs.process_events([db], (C['contexts'] if C else {}))
        events = sorted(set(map(lambda x: (x[0], tuple(sorted(x[1].items()))), ev1 + ev2)))
        events = [(e, dict(c)) for e, c in events]
        n, diff = gs.equivalent(flat, sub, lambda conf: mp.get(conf, conf[0]), events)
        check(f"{tag(q.get('test'))}the sub-flow behaves exactly like the flat process — every reachable state, event and guard case ({q.get('reachable_pairs', n)} pairs)",
              diff is None and ('reachable_pairs' not in q or n == q['reachable_pairs']), diff or f"{n} pairs")
    if 'scxml' in E:
        q = E['scxml']; db.set_graph(q['graph']); xml = gs.to_scxml(db); ok, err = gs.scxml_valid(xml, XSD)
        check(f"{tag(q.get('test'))}the SCXML export is valid against the W3C schema", ok, err)
        if 'equivalent' in E:
            n, diff = gs.equivalent(flat, sub, lambda conf: mp.get(conf, conf[0]), events, gs.ScxmlReader(xml))
            check(f"{tag(q.get('test'))}a separate reader running the SCXML export agrees with the engine and the flat process", diff is None, diff or f"{n} triples")
    for q in E.get('lift') or []:   # §22
        got = gs.lift(db, q['from']); check(f"{tag(q.get('test'))}lift from {q['from']}: {' → '.join(q['chain'])}", got == q['chain'], str(got))
    if 'views' in E:
        q = E['views']
        for lv, want in q['of'].items():
            got = gs.view_at(db, q['top'], int(lv)); check(f"{tag(q.get('test'))}{q['top']} seen at altitude {lv}: {len(want)} items", got == want, str(got))
    if 'sideways' in E:
        q = E['sideways']; got = sorted(r['p'] for r in gs.Q(db, f"MATCH (p:Path)-[:INSTANCE_OF]->(:Concept {{id: '{q['concept']}'}}) RETURN p.id AS p"))
        check(f"{tag(q.get('test'))}sideways through {q['concept']}: {', '.join(q['paths'])}", got == sorted(q['paths']), str(got))
    if 'concept_lift' in E:
        q = E['concept_lift']; got = [r['k'] for r in db.execute(f"MATCH (:Concept {{id: '{q['from']}'}})-[:BROADER]->{{1,8}}(k) RETURN k.id AS k")]
        check(f"{tag(q.get('test'))}lift the concept {q['from']}: {' → '.join(q['chain'])}", got == q['chain'], str(got))
    for L in E.get('lenses') or []:   # §15: a lens is a rule; its stored membership is a cache proved against it
        db.set_graph(L['graph']); got = {r['id']: r['grp'] for r in db.execute(L['rule'])}
        lensnode = gs.Q(db, f"MATCH (l:Lens {{id: '{L['lens']}'}}) RETURN l.applies_to AS a, l.buckets AS b")[0]
        declared = [x.strip() for x in lensnode['b'].split(',')]
        check(f"{tag(L.get('test'))}{L['lens']}: " + ', '.join(f"{k.split(':')[1]} {v}" for k, v in L['buckets'].items()), got == L['buckets'], str(got))
        check(f"{tag(L.get('test'))}{L['lens']}: every bucket the rule gives is one the lens declares", set(got.values()) <= set(declared), str(sorted(set(got.values()) - set(declared))))
        per = {r['id']: r['n'] for r in gs.Q(db, f"MATCH (n:{lensnode['a']}) OPTIONAL MATCH (n)-[e:IN_GROUP {{lens: '{L['lens']}'}}]->() RETURN n.id AS id, count(e) AS n")}
        check(f"{tag(L.get('test'))}{L['lens']}: exclusive and exhaustive — every {lensnode['a']} in exactly one bucket", all(v == 1 for v in per.values()), str(per))
        stored = {r['id']: r['g'] for r in gs.Q(db, f"MATCH (n)-[:IN_GROUP {{lens: '{L['lens']}'}}]->(g:LensGroup) RETURN n.id AS id, g.name AS g")}
        check(f"{tag(L.get('test'))}{L['lens']}: the stored membership equals a recompute of the rule", stored == got, str(stored))
    if 'zoom' in E:   # §16: a zoom link is a Ref that must resolve in the graph it names
        z = E['zoom']; db.set_graph(z['graph']); seen = {}; ok = True
        for r in gs.Q(db, "MATCH (p)-[:DETAILED_IN]->(r:Ref) RETURN p.name AS p, r.graph AS g, r.ref AS ref"):
            db.set_graph(r['g']); hit = gs.Q(db, f"MATCH (b {{id: '{r['ref']}'}}) RETURN b.id AS b")
            grp = gs.Q(db, f"MATCH (b {{id: '{r['ref']}'}})-[:IN_GROUP {{lens: '{z['lens']}'}}]->(g:LensGroup) RETURN g.name AS g")
            ok &= len(hit) == 1; seen[r['p']] = grp[0]['g'] if len(grp) == 1 else None; db.set_graph(z['graph'])
        check(f"{tag(z.get('test'))}every zoom link resolves in the graph it names", ok)
        check(f"{tag(z.get('test'))}zooming reads each item's bucket: " + ', '.join(f"{k} {v}" for k, v in z['buckets'].items()), seen == z['buckets'], str(seen))
    if 'scxml_flat' in E:   # a flat process exported to SCXML — valid, and a separate reader of the XML agrees with the engine
        q = E['scxml_flat']; db.set_graph(q['graph']); xml = gs.to_scxml(db); ok, err = gs.scxml_valid(xml, XSD)
        check(f"{tag(q.get('test'))}{q['graph']}: the SCXML export is valid against the W3C schema", ok, err)
        M1 = gs.Machine(db); ev = gs.process_events([db], (C['contexts'] if C else {}))
        n, diff = gs.equivalent(M1, gs.Machine(db), lambda conf: conf[0], ev, gs.ScxmlReader(xml))
        check(f"{tag(q.get('test'))}{q['graph']}: a separate reader running the SCXML export agrees with the engine in every reachable state ({n})", diff is None, diff or '')
    for q in E.get('queries') or []:   # a query written in a document, run against the loaded graphs, with its known answer
        raw = doc_block(q['query'], mutation); name = q['query'].partition('#')[2]
        db.set_graph(re.match(r"\s*// graph: (\S+)", raw).group(1))
        try: got = [dict(r) for r in db.execute(gs.strip(raw))]
        except Exception as e: check(f"{tag(q.get('test'))}query '{name}' runs without error", False, f"{type(e).__name__}: {e}"); continue
        check(f"{tag(q.get('test'))}query '{name}' runs without error", True)
        check(f"{tag(q.get('test'))}query '{name}' returns its known answer", got == q['returns'], str(got))
    for sv in E.get('servings') or []:   # §24 H3: a graph served to an AI — what it sees, what is refused, and what is recorded
        classes = {}
        for ref in rnd['documents']:
            g = re.match(r"\s*// graph: (\S+)", doc_block(ref, mutation)).group(1); c = doc_class(os.path.join(STD, ref.partition('#')[0] + '.md'))
            order = gs.class_order(); classes[g] = min(classes.get(g, c), c, key=order.index)
        vs = gs.ViewServer(db, classes, sv['id'], sv['consumer'], sv['kind'], dt.date.fromisoformat(str(sv['at'])), sv.get('conditions_met', False), switches)
        for st in sv['steps']:
            what = 'treat_as' if 'treat_as' in st else 'serve' if 'serve' in st else 'zoom'
            label = f"{tag(st.get('test'))}{sv['id']}: " + (f"treat {st['treat_as']}" if what == 'treat_as' else f"{what} {st[what]}" + (f" at altitude {st['altitude']} within {st['budget']} tokens" if what == 'serve' else ''))
            try:
                if what == 'treat_as': [vs.stricter(g, c) for g, c in st['treat_as'].items()]; text = ''
                elif what == 'serve': text = vs.serve(st.get('graph', graphs[0]), st['serve'], st['altitude'], st['budget'])
                else: text = vs.zoom(st.get('graph', graphs[0]), st['zoom'], st.get('budget'))
            except (ValueError, PermissionError, KeyError) as e:
                check(label + f" — refused: \"{st.get('refused', '')}\"", bool(st.get('refused')) and st['refused'] in str(e), str(e)); continue
            if st.get('refused'): check(label + f" — refused: \"{st['refused']}\"", False, 'it was served'); continue
            if 'items' in st:
                got = [json.loads(l)['id'] for l in text.split('\n') if l.startswith('{')] if 'view-fence' not in switches else [l.split(' · ')[0][4:] for l in text.split('\n')[1:]]
                check(label + f": {len(st['items'])} items", got == st['items'], str(got))
            if 'shown_at' in st: check(label + f": shown at altitude {st['shown_at']}" + (" and says it was folded" if st['shown_at'] != st['altitude'] else ''), f"altitude {st['shown_at']}" in text.split('\n')[0] and (st['shown_at'] == st['altitude'] or 'folded to fit' in text.split('\n')[0]), text.split('\n')[0])
            for v in st.get('fenced') or []:
                check(label + f": '{v[:40]}' reaches the AI fenced as data, unchanged", gs.fence_holds(text, [v]) and json.dumps(v, ensure_ascii=False)[1:-1] in text, text[:200])
        if 'record' in sv:   # what the server records equals the Serving stored in the judgement graph
            r = sv['record']; db.set_graph(r['graph'])
            stored = {x['x']: (x['e']['reads'], x['e']['hash'], x['e']['as_of'], x['e']['classification']) for x in gs.Q(db, f"MATCH (s:Serving {{id: '{sv['id']}'}})-[e:SERVED]->(x:Ref) RETURN x.id AS x, properties(e) AS e")}
            fresh = {f"ref:{s_['graph']}/{s_['id']}": (s_['reads'], s_['hash'], s_['as_of'], s_['classification']) for s_ in vs.served.values()}
            check(f"{tag(r.get('test'))}{sv['id']}: the Serving stored in {r['graph']} equals what the server records — {len(fresh)} items", stored == fresh, f"only stored {sorted(set(stored) - set(fresh))} · only served {sorted(set(fresh) - set(stored))} · differ {sorted(k for k in set(stored) & set(fresh) if stored[k] != fresh[k])}")
            try: pins = {f"ref:{p_['graph']}/{p_['ref']}": (p_['reads'], p_['hash'], p_['as_of']) for p_ in vs.pins([(c_.split('|')[0], c_.split('|')[1]) for c_ in r['cited']])}
            except PermissionError as e: pins = {'refused': str(e)}
            have = {x['x']: (x['e']['reads'], x['e']['hash'], x['e']['as_of']) for x in gs.Q(db, f"MATCH (p:Proposal {{id: '{r['proposal']}'}})-[e:RESTS_ON]->(x:Ref) RETURN x.id AS x, properties(e) AS e")}
            check(f"{tag(r.get('pins_test', r.get('test')))}{r['proposal']}: its pins are the ones the tool copies from what was served", have == pins, str({k: v for k, v in have.items() if pins.get(k) != v}))
        db.set_graph(graphs[0])
    for c in E.get('changesets') or []:   # §24 H4: a change set dry-run against the round's documents — offered only if every check passes
        base = [(re.match(r"\s*// graph: (\S+)", b).group(1), b) for b in (doc_block(r, mutation) for r in rnd['documents'])]
        res_, h_, after_ = gs.check_changeset(base, doc_block(c['set'], mutation), switches)
        fails = [(l, f) for l, ok, f in res_ if not ok]; name = (h_ or {}).get('id', c['set'])
        import graph_rules as gr_   # portable checker P2: the same dry run with no database must reach the same outcome, refused by the same checks
        pres, ph, pafter = gr_.check_changeset(base, doc_block(c['set'], mutation), gs.destination_matrix(), gs.lint, switches)
        gf, pf = {l for l, ok, _ in res_ if not ok}, {l for l, ok, _ in pres if not ok}
        loaded = 'it loads' not in pf   # the portable reader may be stricter — refuse what is outside the profile — but never more lenient
        agree_ = bool(gf) == bool(pf) and gf <= pf and pf - gf <= {'it loads'} and (not loaded or (after_ == pafter and ((h_ or {}).get('refreshes') or []) == ((ph or {}).get('refreshes') or [])))
        check(f"{tag(c.get('test'))}change set {name}: the portable dry run, no database, reaches the same outcome (portable checker P2)", agree_, f"Grafeo {sorted(l for l, ok, _ in res_ if not ok)} {after_} · portable {sorted(l for l, ok, _ in pres if not ok)} {pafter}")
        if c['outcome'] == 'offered':
            check(f"{tag(c.get('test'))}change set {name}: offered — all {len(res_)} checks pass", not fails, str(fails[:2]))
            if 'refreshes' in c: check(f"{tag(c.get('test'))}change set {name}: applying it refreshes the caches an engine would — {c['refreshes']}", [[x[0], x[1], x[3]] for x in (h_ or {}).get('refreshes', [])] == c['refreshes'], str((h_ or {}).get('refreshes')))
        else:
            check(f"{tag(c.get('test'))}change set {name}: refused — \"{c['says']}\"", any(c['says'] in l for l, _ in fails), str(fails[:2]) or 'nothing refused it')
            check(f"{tag(c.get('test'))}change set {name}: every refusal says what to change (§24 rule 7)", fails and all(f for _, f in fails), str([l for l, f in fails if not f]))
    for q in E.get('review') or []:   # §23: which judgements a rule brings back into view, and why
        got = gs.review(db, q['graph'], switches)
        if W is not None: check(f"{tag(q.get('test'))}the portable review agrees with the Grafeo review (portable checker P2)", gr.review(W, q['graph'], switches) == got, str(gr.review(W, q['graph'], switches)))
        check(f"{tag(q.get('test'))}judgements to review: " + ('; '.join(f"{d} {', '.join(v) or 'none'}" for d, v in q['of'].items())), got == q['of'], str(got))
    for q in E.get('why') or []:
        got = gs.why_layer(db, q['graph'], q['data'], q['top'], q['level'], switches)
        if W is not None: check(f"{tag(q.get('test'))}the portable why layer agrees with Grafeo's (portable checker P2)", gr.why_layer(W, q['graph'], q['data'], q['top'], q['level'], switches) == got, str(gr.why_layer(W, q['graph'], q['data'], q['top'], q['level'], switches)))
        check(f"{tag(q.get('test'))}the why layer on {q['top']} at altitude {q['level']}: {', '.join(q['judgements']) or 'nothing'}", got == q['judgements'], str(got))
    for r in E.get('runs') or []:
        db.set_graph(r.get('graph', graphs[0])); M = gs.Machine(db, restart_on_self='no-restart' in switches, flow=r.get('flow')); c = M.start(); acts = []
        for ev in r['events']: c, a = M.step(c, ev[0], ev[1] if len(ev) > 1 else {}); acts += a
        check(f"{tag(r.get('test'))}runs: {' → '.join(e[0] for e in r['events'])} ends in {' / '.join(r['ends_in'])}", list(c) == r['ends_in'] and ('actions' not in r or acts == r['actions']), f"got {list(c)} {acts}")
    if W is not None and not switches:   # portable checker P3: the plain JavaScript file must give the Python checker's answers
        import subprocess
        matrix = gs.destination_matrix()
        req = {'blocks': [doc_block(r, mutation) for r in rnd['documents']], 'graphs': graphs, 'matrix': matrix,
               'reviews': [q['graph'] for q in E.get('review') or []], 'whys': [{k: q[k] for k in ('graph', 'data', 'top', 'level')} for q in E.get('why') or []],
               'changesets': [{'base': [doc_block(r, mutation) for r in rnd['documents']], 'block': doc_block(q['set'], mutation)} for q in E.get('changesets') or []]}
        try: js = json.loads(subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'graph-spec-check-node.cjs')], input=json.dumps(req, default=str), capture_output=True, text=True, timeout=120).stdout)
        except Exception as e: js = {'error': f"{type(e).__name__}: {e}"}
        check("the JavaScript checker runs (portable checker P3)", not js.get('error'), js.get('error', ''))
        if not js.get('error'):
            for g in graphs:
                check(f"graph {g}: the JavaScript reader builds the same graph — the same canonical hash (portable checker P3)", js['canon'].get(g) == gr.canon(W[g]), f"{js['canon'].get(g)} vs {gr.canon(W[g])}")
                py = [[l, bool(ok)] for l, ok, _ in gr.check(W, g, matrix)]; diff = [(a_, b_) for a_, b_ in zip(py, js['verdicts'].get(g, [])) if a_ != b_]
                check(f"graph {g}: the JavaScript rules give the Python rules' verdicts — {len(py)} rules (portable checker P3)", not diff and len(py) == len(js['verdicts'].get(g, [])), str(diff[:2]) or f"{len(py)} vs {len(js['verdicts'].get(g, []))}")
                pv, jv = gr.views(W[g], None if W[g].labelled('ElementType') else W.schema_for(g)[1]), (js.get('views') or {}).get(g, {})
                check(f"graph {g}: the views — flat projection, relationships and their legend, each path at each altitude — are the same text from Python and JavaScript ({len(pv)} views, portable checker P4)", pv == jv, str(sorted(k for k in set(pv) | set(jv) if pv.get(k) != jv.get(k)))[:200])
            for q, got in zip(E.get('review') or [], js['reviews']):
                check(f"{tag(q.get('test'))}the JavaScript review agrees (portable checker P3)", got == gr.review(W, q['graph']), str(got))
            for q, got in zip(E.get('why') or [], js['whys']):
                check(f"{tag(q.get('test'))}the JavaScript why layer agrees (portable checker P3)", got == gr.why_layer(W, q['graph'], q['data'], q['top'], q['level']), str(got))
            for q, (cs, got) in zip(E.get('changesets') or [], zip(req['changesets'], js['changesets'])):
                pres, ph, pafter = gr.check_changeset([(re.match(r"\s*// graph: (\S+)", b).group(1), b) for b in cs['base']], cs['block'], matrix, gs.lint)
                want = {'failed': sorted(l for l, ok, _ in pres if not ok), 'after': pafter, 'refreshes': [list(x) for x in (ph or {}).get('refreshes') or []]}
                check(f"{tag(q.get('test'))}the JavaScript dry run reaches the same outcome (portable checker P3)", got == want, f"js {got} · py {want}")
    return [(f"{case['case']} · {rnd['name']}: {l}", ok, d) for l, ok, d in res]

def to_cypher(gql):
    """A GQL INSERT block as Cypher CREATE — the Grafeo dialect's differences for declarations (E10)."""
    out = []
    for line in gql.splitlines():
        if line.strip() == 'INSERT': out.append('CREATE'); continue
        line = re.sub(r"(?<=: )DATETIME '([^']*)'", r"datetime('\1')", line); line = re.sub(r"(?<=: )DATE '([^']*)'", r"date('\1')", line)
        out.append(line)
    return "\n".join(out)

def run_engine(path, sources, cypher=False):
    """Run an engine script in rebuild mode, in a temporary folder, on the given source blocks; return its globals."""
    import tempfile, contextlib, io
    eng = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), path), encoding='utf-8').read()
    if cypher:
        hook = "for g in ('ledger', 'process', 'decisions'): G(g, strip(SOURCE[g]))"; assert hook in eng
        eng = eng.replace(hook, "for g in ('ledger', 'process', 'decisions'): db.set_graph(g); db.execute_cypher(strip(SOURCE[g]))")
        sources = {g: to_cypher(t) for g, t in sources.items()}
    here = os.getcwd(); env = {'MODE': 'rebuild', 'SOURCE': sources, '__name__': 'engine'}
    with tempfile.TemporaryDirectory() as tmp:
        os.chdir(tmp)
        try:
            with contextlib.redirect_stdout(io.StringIO()): exec(compile(eng, path, 'exec'), env)
            env['_blobs'] = {f.name: f.read_bytes() for f in __import__('pathlib').Path('blobs/sha256').glob('*/*')}   # read before the folder goes
        finally: os.chdir(here)
    return env

def run_rebuild_round(case, rnd, confs, switches=frozenset(), mutation=None):
    """§17: source plus engine re-creates everything else — rebuilt, round-tripped through Cypher, typed and projected."""
    import hashlib
    res = []
    def check(label, ok, detail=''): res.append((label, bool(ok), detail))
    tag = lambda t: f"[{t}] " if t else ''; E = rnd.get('expect') or {}
    src = {g: doc_block(r, mutation) for g, r in case['sources'].items()}
    built = {g: doc_block(r, mutation) for g, r in case['built'].items()}
    def load_one(g, text, cypher=False):
        d = gs.grafeo.GrafeoDB(); d.execute(f"CREATE GRAPH {g}"); d.set_graph(g); (d.execute_cypher if cypher else d.execute)(gs.strip(text)); return d
    exp = {g: gs.canon_graph(load_one(g, t), g) for g, t in built.items()}
    env = run_engine(case['engine'], {g: src[g] for g in case['engine_graphs']})
    got = {g: gs.canon_graph(env['db'], g) for g in case['engine_graphs']} | {g: gs.canon_graph(load_one(g, src[g]), g) for g in case['sources'] if g not in case['engine_graphs']}
    if case.get('feature_checks') and 'features' in E:   # the engine's features one by one, on what it rebuilt
        import importlib
        # read the published graphs — identical to the rebuild (D1) — so that tampering with what is published reaches every feature check
        pub = gs.grafeo.GrafeoDB()
        for g, text in built.items(): pub.execute(f"CREATE GRAPH {g}"); pub.set_graph(g); pub.execute(gs.strip(text))
        penv = {'db': pub, '_blobs': env['_blobs'], 'built_db': pub}
        for l, ok, d in importlib.import_module(case['feature_checks']).checks(penv, E['features']): check(l, ok, d)
    for r in E.get('rules') or []:   # rules written in GQL, read on what the engine rebuilt — no rows means none broken
        env['db'].set_graph(r['graph']); rows = list(env['db'].execute(r['gql']))
        check(f"{tag(r.get('test'))}{r['graph']}, as rebuilt: {r['why']}", not rows, str(rows[:3]))
    if 'rebuild' in E:
        q = E['rebuild']
        for g in case['built']:
            check(f"{tag(q.get('test'))}{g}: rebuilt from source, identical to the built graph" + (f" ({q['counts'][g][0]}/{q['counts'][g][1]})" if g in q.get('counts', {}) else ''),
                  got[g] == exp[g] and ('counts' not in q or list(got[g][1:]) == q['counts'][g]), f"rebuilt {got[g][1]}/{got[g][2]}, built {exp[g][1]}/{exp[g][2]}")
    if 'known_answers' in E:
        q = E['known_answers']; G = env['G']
        dig = hashlib.sha256(env['canon'](sorted([[r['id'], r['a']] for r in G("ledger", "MATCH (t:Transaction) FILTER t.rule IS NOT NULL RETURN t.id AS id, t.amount_cents AS a")])
                                         + sorted([[r['id'], r['v']] for r in G("ledger", "MATCH (s:Snapshot) RETURN s.id AS id, s.balance_cents AS v")]) + sorted(s[1] for s in env['STATEMENTS']))).hexdigest()[:16]
        m = re.search(r"id: '" + re.escape(q['id']) + r"', digest: '([0-9a-f]+)'", src['catalog'])
        check(f"{tag(q.get('test'))}the known-answer digest the rebuilt engine computes equals the catalog's ({m.group(1) if m else '?'})", m and dig == m.group(1), f"computed {dig}")
    if 'cypher' in E:
        q = E['cypher']
        for g in case['sources']:
            check(f"{tag(q.get('test'))}{g}: loads identically from its Cypher export", gs.canon_graph(load_one(g, to_cypher(src[g]), True), g) == gs.canon_graph(load_one(g, src[g]), g))
        env2 = run_engine(case['engine'], {g: src[g] for g in case['engine_graphs']}, cypher=True)
        check(f"{tag(q.get('test'))}the engine rebuilds identically from the Cypher-loaded source", all(gs.canon_graph(env2['db'], g) == exp[g] for g in case['engine_graphs']))
    for g in case['built']:
        db = load_one(g, built[g])
        if 'types' in E: check(f"{tag(E['types'].get('test'))}{g}: every element declared, every edge type with both its readings (§5)", gs.typed(db))
        if 'projection' in E: check(f"{tag(E['projection'].get('test'))}{g}: the flat projection rebuilds the graph (§18)", gs.projects_back(db, g))
    return [(f"{case['case']} · {rnd['name']}: {l}", ok, d) for l, ok, d in res]

def shortcut_agreement():
    """§3 data shortcut: every plain data block in Standards/, with its INSERT left out, builds the same graph — in the profile reader, in Grafeo through
    graph_spec.strip, and in the JavaScript reader — and to_gql puts the keyword back exactly."""
    import gql_profile as gp, graph_rules as gr, subprocess
    pairs = []
    for path in sorted(glob.glob(os.path.join(STD, '*.md'))):
        for b in re.findall(r"```gql\n(.*?)\n```", open(path, encoding='utf-8').read(), re.S):
            lines = b.split('\n')
            try: g, kind = gp.header(b)
            except gp.ProfileError: continue
            if kind != 'data' or len(lines) < 2 or lines[1].strip() != 'INSERT' or re.search(r"·\s*(BUILT|document)\b", lines[0]): continue
            pairs.append((os.path.basename(path)[:-3], g, b, '\n'.join(lines[:1] + lines[2:])))
    bad = []
    for name, g, full, short in pairs:
        code = lambda t: [l for l in t.split('\n') if not l.strip().startswith('//')]   # INSERT returns after any comment lines; the code must be identical
        if code(gp.to_gql(short)) != code(full): bad.append(f"{name}: to_gql does not restore the block")
        a, b_ = gp.Store(), gp.Store()
        try: a.apply(full); b_.apply(short)
        except gp.ProfileError as e:
            if 'MATCH finds no' in e.message: continue   # builds on another document; checked with it in its case
            bad.append(f"{name}: {e}"); continue
        if gp.canon(a, g) != gp.canon(b_, g): bad.append(f"{name}: the profile reader builds a different graph without INSERT")
        db = gs.grafeo.GrafeoDB(); db.execute(f"CREATE GRAPH {g}"); db.set_graph(g); db.execute(gs.strip(short))
        if gs.canon_graph(db, g) != gp.canon(a, g): bad.append(f"{name}: Grafeo builds a different graph from the converted block")
        r = subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'graph-spec-check-node.cjs')], input=json.dumps({'blocks': [full], 'graphs': [g], 'matrix': {}}), capture_output=True, text=True)
        r2 = subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'graph-spec-check-node.cjs')], input=json.dumps({'blocks': [short], 'graphs': [g], 'matrix': {}}), capture_output=True, text=True)
        try:
            if json.loads(r.stdout)['canon'][g] != json.loads(r2.stdout)['canon'][g]: bad.append(f"{name}: the JavaScript reader builds a different graph without INSERT")
        except Exception as e: bad.append(f"{name}: the JavaScript reader failed — {(r2.stderr or str(e))[:120]}")
    return [(f"suite: the data shortcut — {len(pairs)} plain data blocks, each with INSERT left out, build the same graph in the profile reader, Grafeo and JavaScript, and to_gql restores them (§3)", bool(pairs) and not bad, '; '.join(bad[:3]))]

def names_and_drafts():
    """§3 a thing's name is its id, and §5 a graph is a draft until locked (both decided 6 Oct 2026) — proved on the guide's own
    graph, Standards/How to write a graph note.md, whose steps use names for ids and no MATCH, and whose schema is written last."""
    import gql_profile as gp, graph_rules as gr, subprocess, importlib.util
    js = lambda blocks: json.loads(subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'graph-spec-check-node.cjs')],
                                                  input=json.dumps({'blocks': blocks, 'graphs': ['reader'], 'matrix': {}}), capture_output=True, text=True).stdout)
    text = open(os.path.join(STD, 'How to write a graph note.md'), encoding='utf-8').read()
    blocks = [b for b in re.findall(r"```gql\n(.*?)\n```", text, re.S) if gp.header(b) == ('reader', 'data')]
    steps = [b for b in blocks if 'ElementType' not in b]
    out = []
    def built(bs):
        s = gp.Store()
        for b in bs: s.apply(b)
        return s
    # 1 — names for ids, no MATCH: the same graph in all three readers, and the shortcut really used
    s = built(blocks); db = gs.grafeo.GrafeoDB(); db.execute("CREATE GRAPH reader"); db.set_graph("reader")
    for b in blocks: db.execute(gs.strip(b))
    used = any('MATCH' in gp.to_gql(b) for b in steps[1:]) and not any('MATCH' in b or 'id:' in b for b in steps)
    same = gs.canon_graph(db, 'reader') == gp.canon(s, 'reader') and js(blocks)['canon'].get('reader') == gp.canon(s, 'reader')[0]
    out.append((f"suite: a thing's name is its id — the guide's graph, {len(steps)} steps written with names for ids and no MATCH, builds the same graph in the profile reader, Grafeo (through to_gql) and JavaScript (§3)", used and same, '' if used else 'the guide no longer uses the name shortcut'))
    # 2 — a misspelt name is refused, not made a new thing, in both portable readers
    typo = [steps[0], steps[1].replace('(a4_pages)-[:FAVOURS]->(large_reader)', '(a4_pages)-[:FAVOURS]->(large_raeder)', 1)]
    try: built(typo); py_refused = False
    except gp.ProfileError as e: py_refused = 'no thing called large_raeder' in e.message
    js_refused = 'no thing called large_raeder' in (js(typo).get('error') or '')
    out.append(("suite: a name that names nothing — large_raeder for large_reader — is refused as a probable typo by the profile reader and JavaScript (§3)", typo[1] != steps[1] and py_refused and js_refused, f"profile reader {py_refused}, JavaScript {js_refused}"))
    # 3 — a draft passes; a near-duplicate type in a draft fails, in both
    label = "§5: a draft's kinds and relationship types hold no near-duplicates"
    verdict = lambda bs: (dict((l, ok) for l, ok, _ in gr.check(gr.World.from_store(built(bs)), 'reader')).get(label), dict(map(tuple, js(bs)['verdicts']['reader'])).get(label))
    near = steps[:1] + [steps[1].replace('(costs_nothing)-[:FAVOURS]->(tablet)', '(costs_nothing)-[:FAVORS]->(tablet)', 1)]
    clean, planted = verdict(steps), verdict(near)
    out.append(("suite: the guide's graph without its schema is a draft and passes; with FAVORS planted beside FAVOURS it fails as a probable typo — in the profile reader and JavaScript (§5)", clean == (True, True) and planted == (False, False) and near[1] != steps[1], f"clean {clean}, planted {planted}"))
    # 4 — locking writes a schema that declares exactly what the data uses: the strict §5 check then passes, in both
    sp = importlib.util.spec_from_file_location('lock', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'graph-spec-lock.py')); lk = importlib.util.module_from_spec(sp); sp.loader.exec_module(lk)
    locked = steps + [lk.schema_block('reader', gr.World.from_store(built(steps))['reader'], 'suite')]
    strict = "§5: every element has a declared type"
    py_ok = dict((l, ok) for l, ok, _ in gr.check(gr.World.from_store(built(locked)), 'reader')).get(strict)
    js_ok = dict(map(tuple, js(locked)['verdicts']['reader'])).get(strict)
    out.append(("suite: locking — graph-spec-lock.py writes a schema from the draft's data, and the locked graph passes the strict §5 check in the profile reader and JavaScript (§5)", py_ok is True and js_ok is True, f"profile reader {py_ok}, JavaScript {js_ok}"))
    return out

def completeness_checks():
    """§25 completeness (6 Oct 2026) — proved on Standards/Completeness test — planted gaps.md, whose expected answers are data in
    its '# completeness case' block. Written before the checkers, and seen to fail first: Roger, "specced, tests built and then coded"."""
    import gql_profile as gp, graph_rules as gr, subprocess, importlib.util
    here = os.path.dirname(os.path.abspath(__file__))
    def js(q): return json.loads(subprocess.run(['node', os.path.join(here, 'graph-spec-check-node.cjs')], input=json.dumps(q), capture_output=True, text=True).stdout or '{}')
    text = open(os.path.join(STD, 'Completeness test — planted gaps.md'), encoding='utf-8').read()
    blocks = re.findall(r"```gql\n(.*?)\n```", text, re.S)
    case = yaml.safe_load(next(b for b in re.findall(r"```yaml\n(.*?)\n```", text, re.S) if b.startswith('# completeness case')))
    name, today = case['graph'], str(case['today'])
    def built(bs):
        st = gp.Store()
        for b in bs: st.apply(b)
        return gr.World.from_store(st)
    w = built(blocks); g = w[name]
    def summary(rep):
        if not isinstance(rep, dict) or 'rules' not in rep: return None
        rules = {r['rule']: {'kind': r['kind'], 'counted': r['counted'], 'met': r['met'], 'excused': r['excused'], 'missing': sorted(m['at'] for m in r['missing']),
                             'deferred': sorted(r['deferred']), 'overdue': sorted(r['overdue']), 'malformed': bool(r['malformed'])} for r in rep['rules']}
        return rules, sorted(d['at'] for d in rep['deferred_malformed'])
    want = ({k: dict(v, missing=sorted(v['missing']), deferred=sorted(v['deferred']), overdue=sorted(v['overdue'])) for k, v in case['rules'].items()}, sorted(case['deferred_malformed']))
    fn = getattr(gr, 'completeness', None)
    py = fn(g, today) if fn else None
    out = []
    # 1 — the Python reader finds exactly the planted gaps, parked and overdue items, and malformed rules
    got = summary(py)
    out.append(("suite: §25 completeness — the Python reader reports exactly the planted gaps, parked and overdue items and malformed rules of the planted-gaps test",
                got == want, '' if got == want else f"graph_rules.completeness is not written yet" if fn is None else f"got {got}"))
    # 2 — JavaScript gives the identical report, fix texts included
    jr = js({'blocks': blocks, 'graphs': [name], 'completeness': {'graph': name, 'today': today}}).get('completeness')
    same = py is not None and jr == json.loads(json.dumps(py))
    out.append(("suite: §25 completeness — JavaScript gives the identical report, fixes included (two readers, one answer)", same,
                '' if same else 'graph-spec-check.js has no completeness yet' if jr is None else 'the reports differ'))
    # 3 — reported, never refused: the gapped graph passes every other check
    bad = [l for l, ok, _ in gr.check(w, name) if not ok]
    out.append(("suite: §25 completeness is reported, never refused — the gapped graph passes every other check", not bad, ', '.join(bad)))
    # 4 — a draft carrying completeness rules is still a draft
    out.append(("suite: §25 — a draft that carries completeness rules is still a draft (§5)", gr.is_draft(w, name), ''))
    # 5 — locking carries the rules into the schema unchanged: each declared by the GraphMeta, and the same report
    sp = importlib.util.spec_from_file_location('lock', os.path.join(here, 'graph-spec-lock.py')); lk = importlib.util.module_from_spec(sp); sp.loader.exec_module(lk)
    w2 = built(blocks + [lk.schema_block(name, g, 'suite')]); g2 = w2[name]
    rules = set(g.labelled('Cardinality')) | set(g.labelled('Coverage'))
    declared = {d for s_, t, d, _ in g2.edges if t == 'DECLARES'}
    carried = bool(rules) and rules <= declared and fn is not None and summary(fn(g2, today)) == got
    out.append(("suite: §25 — locking carries every completeness rule into the schema unchanged: declared by the GraphMeta, and the same report", carried,
                '' if carried else f"not declared: {sorted(rules - declared)}"))
    # 6 — the meta-schema declares Cardinality and Coverage
    meta = open(os.path.join(STD, 'Graph spec meta-schema.md'), encoding='utf-8').read()
    names = set(re.findall(r"kind: 'node', name: '(\w+)'", meta))
    out.append(("suite: §25 — the meta-schema declares Cardinality and Coverage, as it declares ElementType", {'Cardinality', 'Coverage'} <= names,
                f"missing: {sorted({'Cardinality', 'Coverage'} - names)}"))
    # 7 — a property named type is refused by the flat projection with a clear message, in both readers (found 6 Oct 2026)
    probe = "// graph: probe\n(x:Thing {type: 'garbled'})"
    try: gr.project(built([probe])['probe']); py_ref = ''
    except ValueError as e: py_ref = str(e)
    js_ref = js({'blocks': [probe], 'project': 'probe'}).get('project_error') or ''
    ok7 = all('type' in m and 'reserved' in m for m in (py_ref, js_ref))
    out.append(("suite: §18 — a property named type is refused by the flat projection with a clear message, in the profile reader and JavaScript", ok7,
                '' if ok7 else f"python: {py_ref or 'not refused'}; javascript: {js_ref or 'not refused'}"))
    return out

def schema_agreement(C_, confs):
    """§5 shared schemas: a join case's configuration types must equal the schema document its documents name — one declaration, never two that drift."""
    import gql_profile as gp, graph_rules as gr
    store = gp.Store()
    for b in re.findall(r"```gql\n(.*?)\n```", open(os.path.join(STD, 'Join test schemas.md'), encoding='utf-8').read(), re.S): store.apply(b)
    schemas = gr.World.from_store(store).schemas
    def declared(G):
        T = [G.p(i) for i in G.labelled('ElementType')]
        return (sorted(t['name'] for t in T if t.get('kind') == 'node'), sorted((t['name'], t.get('reverse_name')) for t in T if t.get('kind') == 'edge'), sorted((t['name'], t.get('reading')) for t in T if t.get('kind') == 'edge'),
                sorted((t['name'], tuple(x.strip() for x in t['identified_by'].split(','))) for t in T if t.get('kind') == 'edge' and t.get('identified_by')))
    out = []
    for c in C_:
        if not c.get('configuration') or c.get('kind') in ('graphs', 'rebuild'): continue
        conf = resolve(c['configuration'], confs); t = conf.get('types') or {}
        want = (sorted(t.get('nodes', [])), sorted((t.get('edges') or {}).items()), sorted((conf.get('readings') or {}).items()), sorted((k, tuple(v)) for k, v in (conf.get('identified_by') or {}).items()))
        refs = list(dict.fromkeys(list(c.get('documents', [])) + [d for r in c['rounds'] for d in r.get('documents', [])] + ([c['base']] if c.get('base') else [])))
        bad = []
        for d in refs:
            if d.endswith('.docx'): continue
            m = re.search(r"//\s*graph:[^\n]*·\s*schema\s+(\S+)", gs.gql_block(os.path.join(STD, d + '.md')))
            if not m: bad.append(f"{d}: names no schema"); continue
            if m.group(1) not in schemas: bad.append(f"{d}: names {m.group(1)}, which no schema document declares"); continue
            got = declared(schemas[m.group(1)])
            if got != want: bad.append(f"{d} ({m.group(1)}): " + '; '.join(f"{k} configuration {w} vs schema {g}" for k, w, g in zip(('nodes', 'reverse readings', 'readings', 'identified_by'), want, got) if w != g))
        out.append((f"{c['case']}: its configuration declares exactly the types of the schema its documents name, held in Join test schemas (§5)", not bad, '; '.join(bad[:2])))
    return out

def profile_agreement(case):
    """Portable checker phase 1: every block a case loads, read both by Grafeo and by the profile reader (no database) — the graphs must be identical."""
    import gql_profile as gp
    loads = []
    if case.get('kind') == 'graphs': loads = [[(r, doc_block(r)) for r in rnd['documents']] for rnd in case['rounds']]
    elif case.get('kind') == 'rebuild': loads = [[(r, doc_block(r))] for r in list(case['sources'].values()) + list(case['built'].values())]
    else:
        refs = list(dict.fromkeys(list(case.get('documents', [])) + [d for r in case['rounds'] for d in r.get('documents', [])] + ([case['base']] if case.get('base') else [])))
        loads = [[(d, gs.gql_block(os.path.join(STD, d if d.endswith('.docx') else d + '.md')))] for d in refs]
    done, bad = 0, []
    for load in loads:
        db = gs.grafeo.GrafeoDB(); made = []; store = gp.Store()
        try:
            for ref, block in load:
                g = re.match(r"\s*// graph: (\S+)", block).group(1)
                if g not in made: db.execute(f"CREATE GRAPH {g}"); made.append(g)
                db.set_graph(g); db.execute(gs.strip(block)); store.apply(block)
        except gp.ProfileError as e: bad.append(f"{ref}: {e}"); continue
        for g in made:
            if gs.canon_graph(db, g) != gp.canon(store, g): bad.append(f"{load[-1][0]} graph {g}: Grafeo {gs.canon_graph(db, g)[1:]} vs reader {gp.canon(store, g)[1:]}")
        done += 1
    return [(f"{case['case']}: the profile reader builds the same graphs as Grafeo, with no database — {done} of {len(loads)} loads (portable checker P1)", not bad, '; '.join(bad[:2]))]

def js_join_agreement(case, rnd, confs):
    """Portable checker P3: the same join in the plain JavaScript file — the same report rows, claims, contradictions, paradoxes and joined graph."""
    import subprocess, graph_rules as gr
    C, log, base, docs = prepare(case, rnd, confs, frozenset())
    J = do_join(case, C, base, docs, rnd.get('findings') or [], frozenset())
    nv = lambda v: gr.norm(v)
    py = {'rows': sorted([[r[0], str(r[1]), str(r[2]), r[4], r[5]] for r in log + J['report']], key=gr.jcs),
          'claims': {k: [c['status'], c['confidence']] for k, c in J['claims'].items()}, 'pairs': [list(p) for p in J['pairs']],
          'paradoxes': sorted([[p[0], p[1], list(p[2])] for p in J['paradoxes']], key=gr.jcs),
          'nodes': {k: [sorted(n['labels']), {x: nv(v) for x, v in n['props'].items()}] for k, n in J['nodes'].items()},
          'edges': {gr.jcs([k[0], k[1], nv(k[2]), [nv(x) for x in k[3]]]): {x: nv(v) for x, v in p.items()} for k, p in J['edges'].items()}}
    path = lambda n: os.path.join(STD, n if n.endswith('.docx') else n + '.md')
    data = merged(resolve(case['configuration'], confs), rnd.get('configuration_changes'))
    req = {'join': {'docs': [gs.gql_block(path(n)) for n in case['documents']], 'base': gs.gql_block(path(case['base'])) if case.get('base') else None,
                    'config': data, 'findings': rnd.get('findings') or [], 'checks': list(CHECKS), 'hold': True, 'switches': []}}
    try: js = json.loads(subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'graph-spec-check-node.cjs')], input=json.dumps(req, default=str), capture_output=True, text=True, timeout=120).stdout).get('join', {})
    except Exception as e: js = {'error': f"{type(e).__name__}: {e}"}
    if js.get('error'): return [(f"{case['case']} · {rnd['name']}: the JavaScript join runs (portable checker P3)", False, js['error'])]
    diff = {k: (py[k], js.get(k)) for k in py if py[k] != js.get(k)}
    detail = '; '.join(f"{k}: only Python {sorted(set(map(str, py[k])) - set(map(str, js.get(k) or [])))[:2]} · only JS {sorted(set(map(str, js.get(k) or [])) - set(map(str, py[k])))[:2]}" for k in diff)
    return [(f"{case['case']} · {rnd['name']}: the JavaScript join gives the same report, claims, contradictions, paradoxes and joined graph (portable checker P3)", not diff, detail[:400])]

def run_reader_round(case, rnd, confs=None, switches=frozenset(), mutation=None):
    """A reader case (14 Oct 2026): each planted test is a short block, read by the portable readers — and by the engine route,
    gs.load, where the rule is about the engine. It joins no documents, so no switch or mutation reaches it."""
    import gql_profile as gp, graph_rules as gr, subprocess
    from graphspec.reader.whitespace import strip as wstrip
    res, by = [], {c['test']: c for c in rnd['checks']}
    def check(t, label, ok, detail=''): res.append((f"{case['case']} · {rnd['name']}: [{t}] {label}", bool(ok), str(detail)[:300]))
    def reader_error(block):
        try: gp.Store().apply(block); return None
        except gp.ProfileError as e: return str(e)
    def engine_text(block):
        st = gp.Store(); st.apply(block); return wstrip(st.corrected(block))
    for c in rnd['checks']:
        t, b = c['test'], c.get('block', '')
        if 'refused' in c:
            e = reader_error(b); r = c['refused']
            check(t, f"refused by the reader — {r['message']}, with the fix that says {r['fix']}", e and r['message'] in e and r['fix'] in e, e or 'read without complaint')
        if 'values' in c:
            st = gp.Store(); st.apply(b); g = gr.World.from_store(st)[re.match(r"\s*// graph: (\S+)", b).group(1)]
            got = {k: {p: g.p(k).get(p) for p in ps} for k, ps in c['values'].items()}
            check(t, "the escapes GQL names are read as GQL reads them", got == c['values'], got)
        if 'engine_refuses_as_reader' in c:
            for o in c['engine_refuses_as_reader']:
                blk = by[o]['block']; want = reader_error(blk)
                try: gs.load(blk); got = None
                except gp.ProfileError as e: got = str(e)
                except Exception as e: got = f"the engine itself: {type(e).__name__}: {e}"
                check(t, f"the engine route refuses {o}'s block with the reader's own words, before the engine sees it", want and got == want, f"reader: {want} · route: {got}")
        if c.get('engine_lines'):
            et = engine_text(b).split('\n'); bl = b.split('\n')
            same = len(et) == len(bl) and all(x.rstrip(',') == y or x == y for x, y in zip(et, bl))
            check(t, "the engine is given the block line for line, adding only commas, INSERT and missing ids", same, '\n'.join(et))
        if 'engine_comments' in c:
            et, bl = engine_text(b).split('\n'), b.split('\n')
            kept = all(n <= len(et) and et[n - 1] == bl[n - 1] for n in c['engine_comments'])   # line numbers, from 1
            try: gs.load(b); loads = True
            except Exception as e: loads = f"{type(e).__name__}: {e}"
            check(t, "each comment line reaches the engine unchanged, on its own line, and the engine reads it", kept and loads is True, f"engine text {et} · load {loads}")
        if 'engine_commas' in c:
            et = engine_text(b).split('\n'); want = c['engine_commas']
            comma = all(et[n - 1].rstrip().endswith(',') for n in want['lines'])   # line numbers, from 1
            ids = sorted(x['i'] for x in gs.load(b).execute("MATCH (n) RETURN n.id AS i"))
            check(t, "the engine gets the comma the reader read in, at the end of the code on its line, and every thing", comma and ids == sorted(want['ids']), f"engine text {et} · ids {ids}")
        if 'owned' in c:
            got = gp.owned_comments(b)
            check(t, "the Python reader owns the notes and //@ lines as the spec says", got == c['owned'], got)
        if 'engine_ids' in c:
            ids = sorted(x['i'] for x in gs.load(b).execute("MATCH (n) RETURN n.id AS i"))
            check(t, "the engine ignores the //@ lines and builds the same things", ids == sorted(c['engine_ids']), ids)
        if 'two_readers' in c:
            blocks = [by[o]['block'] for o in c['two_readers']]
            here = os.path.dirname(os.path.abspath(__file__))
            js = json.loads(subprocess.run(['node', os.path.join(here, 'graph-spec-check-node.cjs')], input=json.dumps({'owned': blocks}), capture_output=True, text=True).stdout)['owned']
            diff = [o for o, b2, j in zip(c['two_readers'], blocks, js) if gp.owned_comments(b2) != j]
            check(t, f"the JavaScript reader owns exactly what the Python reader owns, on all {len(blocks)} blocks", not diff, diff)
        # ── the library's tools on the reader's reading, held to Grafeo (plain-reading case, 14 Oct 2026) ──
        def both(case_id, rnd_i=None):
            """For each round of another case: (round, Grafeo db, its graphs, the reader's World), from that round's documents."""
            other = next(x for x in cases() if x['case'] == case_id)
            for r in other['rounds']:
                refs = r['documents']; db, graphs = load_graphs(refs); st = gp.Store()
                for ref in refs: st.apply(gs.require_graph_line(doc_block(ref), ref))
                yield r, db, graphs, gr.World.from_store(st)
        if 'parser_default' in c:
            prog = "import sys; sys.path.insert(0, sys.argv[1]); import graph_spec; print(graph_spec.PARSER)"
            out = subprocess.run([sys.executable, '-I', '-c', prog, __import__('graph_spec_host').VENDOR_PY], capture_output=True, text=True)
            check(t, "with no host setting the library reads with the portable reader", out.stdout.strip() == c['parser_default'], (out.stdout + out.stderr).strip()[-200:])
            from graphspec.engine.joining.config import RULES
            tw, was, got = c['twin'], gs.PARSER, {}
            try:
                for mode in ('profile', 'grafeo'):
                    gs.PARSER = mode; got[mode] = gs.config_from({'constraints': [tw]})['constraints'][tw['why']] is RULES[tw['reference']]
            finally: gs.PARSER = was
            check(t, f"a GQL constraint with a named twin runs as the twin, {tw['reference']}, under either parser", all(got.values()), got)
        if 'machine' in c:
            q = c['machine']; C = gs.config_from(resolve(q['configuration'], configurations())) if q.get('configuration') else None
            for r, db, graphs, W in both(q['case']):
                for g in graphs:
                    db.set_graph(g); ev = gs.process_events([db], C['contexts'] if C else {})
                    n, diff = gs.equivalent(gs.Machine(db), gs.Machine(W[g]), lambda conf: conf[0], ev)
                    check(t, f"{g}: the process engine on the reader's reading behaves as on Grafeo, in every reachable state ({n})", diff is None, diff or '')
        if 'scxml' in c:
            for r, db, graphs, W in both(c['scxml']['case']):
                for g in graphs:
                    db.set_graph(g); check(t, f"{g}: the SCXML export from the reader's reading is the same XML as from Grafeo", gs.to_scxml(W[g]) == gs.to_scxml(db))
        if 'scxml_notes' in c:   # §26 note_standard: a /// note on a State or a transition is an XML comment directly before it, and the comments change no element
            q = c['scxml_notes']; st_ = gp.Store(); st_.apply(q['block']); g_ = gp.header(q['block'])[0]; Wn = gr.World.from_store(st_)[g_]
            xml, bare = gs.to_scxml(Wn, q['block']), gs.to_scxml(Wn)
            from lxml import etree as ET_
            from graphspec.engine.process.scxml import comment_note
            doc = ET_.fromstring(xml.encode())
            got = [(c_.getnext().get('id') or c_.getnext().get('event'), comment_note(c_.text)) for c_ in doc.iter(ET_.Comment)]
            check(t, "the SCXML export keeps each /// note as an XML comment before its element", got == [tuple(n) for n in q['notes']], f"{got}")
            strip_ = lambda x: [(e.tag, dict(e.attrib)) for e in ET_.fromstring(x.encode()).iter() if isinstance(e.tag, str)]
            check(t, "the comments change no element of the export", strip_(xml) == strip_(bare))
        if 'figure' in c:
            q = c['figure']
            for r, db, graphs, W in both(q['case']):
                db.set_graph(q['graph']); a, b2 = gs.fig_loan_balance(W[q['graph']], q['loan']), gs.fig_loan_balance(db, q['loan'])
                check(t, f"{r['name']}: the loan balance of {q['loan']} from the reader's reading is the same as from Grafeo", a == b2, f"reader {a} · Grafeo {b2}")
        if 'incomplete' in c:
            q = c['incomplete']; st = gp.Store(); st.apply(b); g = re.match(r"\s*// graph: (\S+)", b).group(1)
            for name, src in (("the reader's reading", gr.World.from_store(st)[g]), ('Grafeo', gs.load(b))):
                try: got = gs.fig_loan_balance(src, q['loan'])
                except Exception as e: got = {'raised': f"{type(e).__name__}: {e}"}
                ok = got.get('result') == 'incomplete' and all(n in got.get('depends_on', []) for n in q['names']) and 'value' not in got
                check(t, f"from {name}: a missing fact makes the figure incomplete, naming {', '.join(q['names'])} — no error, never zero", ok, got)
        if 'view_server' in c:
            other = next(x for x in cases() if x['case'] == c['view_server']['case'])
            for r, db, graphs, W in both(c['view_server']['case']):
                classes = {}
                for ref in r['documents']:
                    g = re.match(r"\s*// graph: (\S+)", doc_block(ref)).group(1); cl = doc_class(os.path.join(STD, ref.partition('#')[0] + '.md'))
                    classes[g] = min(classes.get(g, cl), cl, key=gs.class_order().index)
                def run(src):
                    out = []
                    for sv in (r.get('expect') or {}).get('servings') or []:
                        vs = gs.ViewServer(src, classes, sv['id'], sv['consumer'], sv['kind'], dt.date.fromisoformat(str(sv['at'])), sv.get('conditions_met', False))
                        for s2 in sv['steps']:
                            try:
                                if 'treat_as' in s2: [vs.stricter(g2, k2) for g2, k2 in s2['treat_as'].items()]; out.append('treated')
                                elif 'serve' in s2: out.append(vs.serve(s2.get('graph', graphs[0]), s2['serve'], s2['altitude'], s2['budget']))
                                else: out.append(vs.zoom(s2.get('graph', graphs[0]), s2['zoom'], s2.get('budget')))
                            except Exception as e: out.append(f"refused: {type(e).__name__}: {e}")
                        out.append(repr(sorted(vs.served.items())))
                    return out
                a, b2 = run(W), run(db)
                check(t, f"{r['name']}: the view server serves, zooms, refuses and records the same from the reader's world as from Grafeo ({len(a)} steps)", a == b2 and len(a) > 0, next((f"{x[:150]} · {y[:150]}" for x, y in zip(a, b2) if x != y), ''))
        if c.get('fill_parsers'):
            docs = [p for p in sorted(glob.glob(os.path.join(STD, '*.md'))) if gs.FILL_BLOCK.search(open(p, encoding='utf-8').read())]
            was, diff = gs.PARSER, []
            try:
                for p in docs:
                    text = open(p, encoding='utf-8').read(); got = {}
                    for mode in ('profile', 'grafeo'): gs.PARSER = mode; got[mode] = gs.fill(text, STD, VAULT)
                    if got['profile'] != got['grafeo']: diff.append(os.path.basename(p))
            finally: gs.PARSER = was
            check(t, f"the filler computes the same values with the portable reader as with Grafeo, on all {len(docs)} documents with recipes", docs and not diff, diff)
        if c.get('comments_change_nothing'):
            seen, diff = 0, []
            for c2 in cases():
                refs = {c2['_lead']} | set(c2.get('documents', [])) | {d.partition('#')[0] for r2 in c2['rounds'] for d in r2.get('documents', [])}
                for d in sorted(refs):
                    path = os.path.join(STD, d + '.md')
                    if not os.path.exists(path): continue
                    for blk in re.findall(r"```gql\n(.*?)\n```", open(path, encoding='utf-8').read(), re.S):
                        if gs.changeset_header(blk): continue
                        lines = blk.split('\n'); bare = '\n'.join([lines[0]] + [l for l in lines[1:] if not l.lstrip().startswith('//')])
                        try:
                            s1, s2 = gp.Store(), gp.Store(); s1.apply(blk); s2.apply(bare)
                        except gp.ProfileError: continue
                        g = re.match(r"\s*// graph: (\S+)", blk).group(1); seen += 1
                        if gp.canon(s1, g) != gp.canon(s2, g): diff.append(f"{d}: {g}")
            check(t, f"every one of {seen} case blocks reads as the same graph without its comment lines — no extension that changes the graph lives in a comment", seen > 0 and not diff, diff[:3])
        if 'readings' in c:
            st = gp.Store(); st.apply(b); g = re.match(r"\s*// graph: (\S+)", b).group(1); G = gr.World.from_store(st)[g]; R = gr.readings(G)
            got = {k: list(R[k]) if R.get(k) and R[k][0] else list(gr.guess_readings(k)) for k in c['readings']}
            check(t, "a //@ line about a reading changes nothing: the schema's words, or the guess for a draft, stand", got == c['readings'], got)
        if 'style_only_from_style_graph' in c:
            q = c['style_only_from_style_graph']
            def style(texts):
                st, _ = gp.read_for_drawing(texts); return gp.read_style(texts, 'g', gr.World.from_store(st))[0]['nudges']
            in_data, in_style = style([q['data']]), style([q['plain_data'], q['style']])
            check(t, "a nudge written in the data graph is not style; the same nudge in the note's style graph is", in_data == [] and len(in_style) == 1, f"data {in_data} · style {in_style}")
        # with no engine installed: in the repository, CI's python-no-engine job proves it (req:14.no-engine-install);
        # GRAPH_SPEC_NO_ENGINE_PYTHON names a Python with no Grafeo to prove it here too
        if c.get('no_engine') and os.environ.get('GRAPH_SPEC_NO_ENGINE_PYTHON'):
            here = os.path.dirname(os.path.abspath(__file__)); py = os.environ['GRAPH_SPEC_NO_ENGINE_PYTHON']
            prog = ("import sys, os, glob; sys.path.insert(0, sys.argv[1]); import importlib.util\n"
                    "assert importlib.util.find_spec('grafeo') is None, 'grafeo is installed here, so this proves nothing'\n"
                    "import graph_spec as gs, gql_profile as gp, graph_rules as gr\n"
                    "st = gp.Store(); st.apply(\"// graph: g\\nINSERT (a:A {id: 'a'})\"); w = gr.World.from_store(st); gr.check(w, 'g')\n"
                    "std = os.path.join(sys.argv[2], 'Standards'); f = [p for p in sorted(glob.glob(os.path.join(std, '*.md'))) if gs.FILL_BLOCK.search(open(p).read())][0]\n"
                    "assert not gs.fill_check(open(f).read(), std, sys.argv[2]), f'fill_check failed on {f}'\n"
                    "try: gs.load(\"// graph: g\\nINSERT (a:A {id: 'a'})\"); print('the engine call ran without the engine')\n"
                    "except ModuleNotFoundError as e: print('ok' if 'graph-spec[grafeo]' in str(e) else f'unnamed: {e}')\n")
            r = subprocess.run([py, '-c', prog, here, VAULT], capture_output=True, text=True)
            check(t, "with no engine installed the library reads, checks and recomputes filled values, and an engine call names the extra", r.returncode == 0 and r.stdout.strip() == 'ok', (r.stdout + r.stderr).strip()[-300:])
    return res

def run_any(case, rnd, confs, switches=frozenset(), mutation=None):
    """Run one round of any kind of case; an unexpected error is a failed check, never a crash of the suite."""
    try:
        if case.get('kind') == 'rebuild': return run_rebuild_round(case, rnd, confs, switches, mutation)
        if case.get('kind') == 'reader': return run_reader_round(case, rnd, confs, switches, mutation)
        return run_graphs_round(case, rnd, confs, switches, mutation) if case.get('kind') == 'graphs' else run_round(case, rnd, confs, switches)
    except AssertionError: raise
    except Exception as e:
        return [(f"{case['case']} · {rnd['name']}: runs without error", False, f"{type(e).__name__}: {e}")]

def yaml_blocks(path, marker):
    text = open(path, encoding='utf-8').read()
    return [yaml.safe_load(b) for b in re.findall(r"```yaml\n(.*?)\n```", text, re.S) if b.lstrip().startswith(marker)]

def configurations():
    out = {}
    for block in re.findall(r"```yaml\n(.*?)\n```", open(SUITE, encoding='utf-8').read(), re.S):
        m = re.match(r"\s*# configuration: (\S+)", block)
        if m: out[m.group(1)] = yaml.safe_load(block)
    return out

def merged(base, extra):
    """Configuration data merged: lists add up, mappings merge, scalars replace."""
    out = dict(base)
    for k, v in (extra or {}).items():
        if k == 'extends': continue
        if isinstance(v, list): out[k] = list(out.get(k) or []) + v
        elif isinstance(v, dict): out[k] = merged(out.get(k) or {}, v)
        else: out[k] = v
    return out

def resolve(name, confs):
    c = confs[name]
    return merged(resolve(c['extends'], confs), c) if c.get('extends') else dict(c)

def cases():
    out = []
    for path in sorted(glob.glob(os.path.join(STD, '*.md'))):
        for c in yaml_blocks(path, '# conformance case'):
            c['_lead'] = os.path.basename(path)[:-3]; out.append(c)
    return out

def build_config(data, switches):
    d = dict(data)
    if 'unit-maps' in switches: d['unit_maps'] = {}
    if 'time-restatement' in switches: d['time_restatements'] = {}
    if 'edge-keys' in switches: d['identified_by'] = {}
    if 'rule3-every-level' in switches: d['constraints'] = [dict(c, rule='else-over-parent') if c['rule'] == 'else-over-ancestor' else c for c in d.get('constraints') or []]
    return gs.config_from(d)

def prepare(case, rnd, confs, switches, check=None):
    data = merged(resolve(case['configuration'], confs), rnd.get('configuration_changes'))
    C = build_config(data, switches); log = []
    def one(name, base=None):
        d = gs.parse(os.path.join(STD, name if name.endswith('.docx') else name + '.md'), 'straight-quotes' not in switches)
        if base is None: d['_raw'] = gs.raw_props(d)
        d = gs.normalise(d, log, C, base if 'base-dates' not in switches else None)
        if check: rule_agreement(C, d, lambda l, ok, det='': check(f"{d['id']}: {l}", ok, det))   # each document, before it is validated
        if 'validate' not in switches: gs.validate(d, log, C)
        return d
    base = one(case['base']) if case.get('base') else None
    docs = [one(n, base) for n in case['documents']]
    return C, log, base, docs

def do_join(case, C, base, docs, findings, switches):
    checks = tuple(c for c in CHECKS if c not in switches)
    if base is not None and 'base' not in switches:
        return gs.join3(base, docs[0], docs[1], C, findings, checks, hold='hold-removals' not in switches)
    return gs.join(docs, C, findings, checks)

def same(a, b):
    if isinstance(a, (dt.date, dt.datetime)) or isinstance(b, (dt.date, dt.datetime)): return str(a) == str(b)
    return a == b

def rule_agreement(C, U, check):
    """Every rule written in GQL finds exactly the breaches its reference logic finds, on this case's joined graph."""
    norm = lambda bs: sorted((tuple(sorted(map(tuple, b.get('slots') or []))), tuple(sorted(b.get('edges') or [], key=str))) for b in bs)
    for why, ref in (C.get('references') or {}).items():
        g, r = norm(C['constraints'][why](U['nodes'], U['edges'])), norm(ref(U['nodes'], U['edges']))
        check(f"the GQL rule agrees with its reference — {why} ({len(g)} breaches)", g == r, f"GQL {g[:2]} · reference {r[:2]}")

def run_round(case, rnd, confs, switches=frozenset()):
    """One round of one case: the join, then every expected answer and every general property. Returns [(label, ok, detail)]."""
    res = []
    def check(label, ok, detail=''): res.append((label, bool(ok), detail))
    n0 = len(gs.NOTICES)
    try:
        C, log, base, docs = prepare(case, rnd, confs, switches, check)
        findings = rnd.get('findings') or []
        J = do_join(case, C, base, docs, findings, switches)
        all_docs = ([base] if base else []) + docs
        db = gs.load(gs.emit(J, all_docs, C, case['case']))
    except Exception as e:
        return [(f"{case['case']} · {rnd['name']}: the join runs", False, f"{type(e).__name__}: {e}")]
    tag = lambda t: f"[{t}] " if t else ''
    E = rnd.get('expect') or {}
    rule_agreement(C, (gs.merge3(base, docs[0], docs[1], C) if base is not None and 'base' not in switches else gs.union(docs, C)), check)
    nodes = {r['id']: r for r in gs.Q(db, "MATCH (n) RETURN n.id AS id, labels(n) AS l, properties(n) AS p")}
    for q in E.get('notices') or []:
        mine = gs.NOTICES[n0:]; check(f"{tag(q.get('test'))}the reader is told: \"{q['contains']}\"", any(q['contains'] in x for x in mine), str(mine))
    if 'same_as' in E:   # the same join from documents in another format must give the identical graph
        q = E['same_as']; other = [c for c in cases() if c['case'] == q['case']][0]; orn = [r for r in other['rounds'] if r['name'] == q['round']][0]
        C2, _, b2, d2 = prepare(other, orn, confs, switches); J2 = do_join(other, C2, b2, d2, orn.get('findings') or [], switches)
        check(f"{tag(q.get('test'))}identical to the graph joined from the Markdown documents ({q['case']} · {q['round']})", gs.canon(gs.load(gs.emit(J2, ([b2] if b2 else []) + d2, C2, case['case']))) == gs.canon(db))
    if 'report' in E:
        want = Counter(tuple(r[:3]) for r in E['report']); got = Counter((r[0], r[1], r[2]) for r in log + J['report'])
        check("the report holds exactly the expected rows", want == got, f"missing {sorted((want - got).elements())} · unexpected {sorted((got - want).elements())}" if want != got else f"{sum(got.values())} rows")
    for k, n in (('claims', len(J['claims'])), ('contradicts', len(J['pairs'])), ('paradoxes', len(J['paradoxes']))):
        if k in E: check(f"{E[k]} {k}", n == E[k], f"got {n}")
    if 'paradox_sizes' in E: check(f"paradox sizes {E['paradox_sizes']}", sorted(len(p[2]) for p in J['paradoxes']) == sorted(E['paradox_sizes']), str([len(p[2]) for p in J['paradoxes']]))
    if 'statuses' in E:
        st = Counter(c['status'] for c in J['claims'].values()); check(f"claim outcomes {E['statuses']}", dict(st) == E['statuses'], str(dict(st)))
    for a in E.get('asserted') or []:
        v = nodes.get(a['element'], {}).get('p', {}).get(a['property'])
        check(f"{tag(a.get('test'))}{a['element']}.{a['property']} = {a['value']}", same(v, a['value']), f"got {v!r}")
    for a in E.get('absent') or []:
        check(f"{tag(a.get('test'))}{a['element']}.{a['property']} is not asserted", a['property'] not in nodes.get(a['element'], {}).get('p', {}))
    for a in E.get('nodes') or []:
        for x in a.get('present') or []: check(f"{tag(a.get('test'))}{x} is present", x in nodes)
        for x in a.get('absent') or []: check(f"{tag(a.get('test'))}{x} is absent", x not in nodes)
    for e in E.get('edges') or []:
        ident = tuple(e.get('id') or ())
        keys = [k for k in J['edges'] if k[:3] == (e['from'], e['type'], e['to']) and (not ident or k[3] == ident)]
        label = f"{tag(e.get('test'))}{e['from']} {e['type']} {e['to']}" + (f" [{', '.join(str(x) for x in ident)}]" if ident else '')
        if e.get('present', True) is False: check(label + " is not asserted", not keys); continue
        ok = len(keys) == 1
        if ok and 'props' in e: ok = all(same(J['edges'][keys[0]].get(p), v) for p, v in e['props'].items())
        if ok and 'absent_props' in e: ok = not any(p in J['edges'][keys[0]] for p in e['absent_props'])
        if ok and 'stated_in' in e: ok = J['esrc'][keys[0]] == sorted(e['stated_in'])
        check(label + " is asserted as expected", ok, str([J['edges'][k] for k in keys]))
    for f in E.get('figures') or []:
        r = gs.FIGURES[f['figure']](db, f['of'])
        ok = r['result'] == f['result'] and all(same(r.get(k), f[k]) for k in ('value', 'currency') if k in f)
        check(f"{tag(f.get('test'))}{f['figure']} of {f['of']}: {f['result']}" + (f" {f['value']}" if 'value' in f else ''), ok, str(r))
    for c in E.get('claim_details') or []:
        hits = [x for x in J['claims'].values() if x['_about'][0][1] == c['element'] and (('property' in c and x.get('claimed_property') == c['property'] and same(x.get('claimed_value'), c['value'])) or ('label' in c and x.get('claimed_label') == c['label']))]
        ok = len(hits) == 1 and all(hits[0]['_docs'] == sorted(c[k]) if k == 'stated_in' else hits[0].get(k) == c[k] for k in ('stated_in', 'confidence') if k in c)
        check(f"{tag(c.get('test'))}claim on {c['element']} {c.get('property', 'label')} = {c.get('value', c.get('label'))}" + (f" ({c['confidence']})" if 'confidence' in c else ''), ok, str([(h['_docs'], h['confidence']) for h in hits]))
    for l in E.get('linked') or []:
        ids = {str(x.get('claimed_value')): x['id'] for x in J['claims'].values() if x['_about'][0][1] == l['element'] and x.get('claimed_property') == l['property']}
        a, b = (ids.get(str(v)) for v in l['values'])
        check(f"{tag(l.get('test'))}{' and '.join(map(str, l['values']))} {'contradict' if l['linked'] else 'do not contradict'}", a and b and ((tuple(sorted((a, b))) in J['pairs']) == l['linked']))
    if 'no_loop_alone' in E:   # §16: no document, and no pair of documents, nests sub-flows in a loop on its own
        q = E['no_loop_alone']; found = [d['id'] for d in docs if gs.nesting_loop(d['nodes'], d['edges'])]
        for i in range(len(docs)):
            for j in range(i + 1, len(docs)):
                U = gs.union([docs[i], docs[j]], C)
                if gs.nesting_loop(U['nodes'], U['edges']): found.append(f"{docs[i]['id']} + {docs[j]['id']}")
        check(f"{tag(q.get('test'))}no document, and no pair of documents, nests sub-flows in a loop", not found, str(found))
    for p in E.get('pairs_clean') or []:
        clean = True
        for i in range(len(docs)):
            for j in range(i + 1, len(docs)):
                Jp = gs.join([docs[i], docs[j]], C, (), tuple(c for c in CHECKS if c not in switches))
                clean &= not any(r[0] == 'cycle' and r[1] in p['elements'] for r in Jp['report'])
        check(f"{tag(p.get('test'))}no pair of documents forms the paradox among {', '.join(p['elements'])}", clean)
    if 'about_removed' in E:
        n = len(gs.Q(db, "MATCH (c:Claim) WHERE c.about_removed IS NOT NULL RETURN c"))
        check(f"{tag(E['about_removed'].get('test'))}{E['about_removed']['count']} claims name a removed node, with no dangling link", n == E['about_removed']['count'], f"got {n}")
    for r in E.get('runs') or []:
        try:
            M = gs.Machine(db, flow=r.get('flow')); c = M.start(); acts = []
            for ev in r['events']: c, a = M.step(c, ev[0], ev[1] if len(ev) > 1 else {}); acts += a
            ok = list(c) == r['ends_in'] and ('actions' not in r or acts == r['actions'])
            check(f"{tag(r.get('test'))}runs on the §16 engine: {' → '.join(e[0] for e in r['events'])} ends in {' / '.join(r['ends_in'])}", ok, f"got {list(c)} {acts}")
        except Exception as e:
            check(f"{tag(r.get('test'))}runs on the §16 engine", False, f"{type(e).__name__}: {e}")
    if 'unreachable' in E:
        roots = {n for n, x in J['nodes'].items() if x['props'].get('initial') and x['props'].get('flow') not in gs.flow_parents(J['nodes'], J['edges'])}
        seen, todo = set(roots), list(roots)
        while todo:
            a = todo.pop()
            for k in J['edges']:
                if k[0] == a and k[2] not in seen: seen.add(k[2]); todo.append(k[2])
        un = sorted(n for n, x in J['nodes'].items() if 'flow' in x['props'] and n not in seen)
        check(f"{tag(E['unreachable'].get('test'))}unreachable, for a person to decide: {', '.join(E['unreachable']['states'])}", un == sorted(E['unreachable']['states']), str(un))
    # general properties — every case, every round
    check("every element has a declared type (§5)", gs.typed(db))
    ref = gs.canon(db)
    if base is not None and 'base' not in switches:
        alt = gs.join3(base, docs[1], docs[0], C, findings, tuple(c for c in CHECKS if c not in switches), hold='hold-removals' not in switches)
        check("order-free: the revisions in either order give the same graph", gs.canon(gs.load(gs.emit(alt, all_docs, C, case['case']))) == ref)
    else:
        check(f"order-free: all {len(list(permutations(docs)))} orders of the documents give the same graph",
              all(gs.canon(gs.load(gs.emit(gs.join(list(p), C, findings, tuple(c for c in CHECKS if c not in switches)), all_docs, C, case['case']))) == ref for p in permutations(docs)))
        Ji = gs.join([docs[0], docs[0]], C, (), tuple(c for c in CHECKS if c not in switches))
        check("idempotent: a document joined with itself has no conflicts and loses nothing", not Ji['claims'] and not gs.lost(Ji, docs[0]))
    lost = {d['id']: gs.lost(J, d) for d in docs}
    check("nothing any document said is lost", not any(lost.values()), str({k: v[:2] for k, v in lost.items() if v}))
    inv = gs.invented(J, docs); check("nothing is invented", not inv, str(inv[:3]))
    check("the flat projection rebuilds the graph (§18)", gs.projects_back(db))
    br = gs.breaches(J['nodes'], J['edges'], C, ('cycles', 'cardinality', 'constraints', 'determinism'))
    check("nothing asserted breaks §7, §12, §16 or a declared rule", not br, str([b['why'] for b in br][:3]))
    return [(f"{case['case']} · {rnd['name']}: {l}", ok, d) for l, ok, d in res]

def table_ids(path):
    if path.endswith('.docx.md') and not os.path.exists(path): return set()
    if path.endswith('.docx'): path += '.md'   # a Word document's planted conditions are in its companion note
    text = open(path, encoding='utf-8').read()
    if not re.search(r"^tags: \[[^\]]*\btest\b", text, re.M): return set()   # only test documents plant conditions
    text = text.split('## Conformance case')[0]
    return set(re.findall(r"^\| ([A-Z]\d+[a-z]?) \|", text, re.M))

def yaml_ids(c):
    ids = set()
    def walk(x):
        if isinstance(x, dict):
            ids.update(str(v) for k, v in x.items() if (k == 'test' or str(k).endswith('_test')) and isinstance(v, str))
            if isinstance(x.get('tests'), dict): ids.update(str(v) for v in x['tests'].values())
            for v in x.values(): walk(v)
        elif isinstance(x, list):
            if len(x) == 4 and all(isinstance(v, str) for v in x) and re.fullmatch(r"[A-Z]\d+[a-z]?", x[3]): ids.add(x[3])
            for v in x: walk(v)
    walk(c.get('rounds')); return ids

def main():
    check_only = '--check' in sys.argv
    confs, C_ = configurations(), cases()
    results = schema_agreement(C_, confs) + shortcut_agreement() + names_and_drafts() + completeness_checks()
    for c in C_:
        for rnd in c['rounds']:
            got = run_any(c, rnd, confs); results += got
            if c.get('kind') not in ('graphs', 'rebuild', 'reader'):   # portable checker P2: the same join, its documents read by the profile reader — no database
                gs.PARSER = 'profile'   # documents read by the portable reader, and GQL constraints run as their named twins — no database for checking
                try: again = run_any(c, rnd, confs)
                finally: gs.PARSER = 'grafeo'
                results += js_join_agreement(c, rnd, confs)
                diff = [(l, ok) for (l, ok, _), (l2, ok2, _) in zip(got, again) if (l, ok) != (l2, ok2)] + ([('count', len(got), len(again))] if len(got) != len(again) else [])
                results.append((f"{c['case']} · {rnd['name']}: the join gives the same {len(got)} results with documents read by the portable reader, no database (portable checker P2)", not diff, str(diff[:2])))
            for m in rnd.get('mutations') or []:   # a tampered document must make the case fail
                try: r = run_any(c, rnd, confs, mutation=m) if c.get('kind') in ('graphs', 'rebuild') else []
                except AssertionError as e: r = [('mutation target', True, str(e))]; results.append((f"{c['case']} · {rnd['name']}: [{m.get('test')}] the mutation applies — {m['name']}", False, str(e))); continue
                if any('portable checker P3' in l for l, _, _ in r):
                    disagree3 = [l for l, ok, _ in r if not ok and 'portable checker P3' in l]
                    results.append((f"{c['case']} · {rnd['name']}: [{m.get('test')}] the JavaScript checker agrees with Python on the tampered copy — {m['name']}", not disagree3, str(disagree3[:2])))
                r = [(l, ok, d) for l, ok, d in r if 'portable checker P3' not in l]
                if any('portable checker P2' in l for l, _, _ in r):   # the portable rules must agree with Grafeo on a tampered copy too — where rules fail
                    disagree = [l for l, ok, _ in r if not ok and 'portable checker P2' in l]
                    results.append((f"{c['case']} · {rnd['name']}: [{m.get('test')}] the portable rules agree with Grafeo on the tampered copy — {m['name']}", not disagree, str(disagree[:2])))
                r = [(l, ok, d) for l, ok, d in r if 'portable checker P2' not in l]
                caught = [(l.split(': ', 1)[1], d) for l, ok, d in r if not ok]
                said = (not m.get('expect_message') or any(m['expect_message'] in d for _, d in caught)) and (not m.get('expect_check') or any(m['expect_check'] in l for l, _ in caught))
                if m.get('silent'):   # §24 H1: the trap is real — with the linter off, Grafeo answers wrongly and raises nothing
                    r2 = run_any(c, rnd, confs, frozenset({'dialect-lint'}), mutation=m); bad = [l for l, ok, _ in r2 if not ok]
                    loud = [l for l in bad if 'runs without error' in l or 'the documents load' in l]
                    results.append((f"{c['case']} · {rnd['name']}: [{m.get('test')}] without the linter, {m['name']} gives a wrong answer and no error", bool(bad) and not loud, f"failed: {bad[:2]}" if bad else 'nothing failed'))
                results.append((f"{c['case']} · {rnd['name']}: [{m.get('test')}] tampering is caught — {m['name']}" + (f" — and says \"{m['expect_message']}\"" if m.get('expect_message') else '') + (f" — by the {m['expect_check']} check" if m.get('expect_check') else ''),
                                bool(caught) and said, f"caught by: {caught[0][0]} — {caught[0][1][:120]}" if caught else 'not caught'))
    # the prose tables and the data name the same tests
    docs = sorted({c['_lead'] for c in C_} | {d for c in C_ for d in c.get('documents', [])} | {c['base'] for c in C_ if c.get('base')}
                  | {d.partition('#')[0] for c in C_ for r in c['rounds'] for d in r.get('documents', [])}
                  | {d.partition('#')[0] for c in C_ for d in list((c.get('sources') or {}).values()) + list((c.get('built') or {}).values())})
    prose = set().union(*(table_ids(os.path.join(STD, d if d.endswith('.docx') else d + '.md')) for d in docs)); data = set().union(*(yaml_ids(c) for c in C_))
    results.append(("suite: the planted-conditions tables and the case data name the same tests", prose == data, f"only in prose {sorted(prose - data)} · only in data {sorted(data - prose)}"))
    plant, together = {}, []   # one test id names one planted condition: the documents that plant an id must be read together by some case
    for c_ in C_:
        cd = {c_['_lead']} | set(c_.get('documents', [])) | ({c_['base']} if c_.get('base') else set()) | {d.partition('#')[0] for r in c_['rounds'] for d in r.get('documents', [])}
        together.append(cd)
        for d in cd:
            for i_ in table_ids(os.path.join(STD, d if d.endswith('.docx') else d + '.md')): plant.setdefault(i_, set()).add(d)
    dup = {i_: sorted(ds) for i_, ds in plant.items() if len(ds) > 1 and not any(ds <= cd for cd in together)}
    results.append(("suite: every planted test id names one condition — documents sharing an id are read together by a case", not dup, str(dict(sorted(dup.items())[:4]))))
    # §24 H1: every GQL block in every case document, and every query held in case data, passes the dialect linter
    found = []
    for d in docs:
        if d.endswith('.docx'): continue
        for i, b in enumerate(re.findall(r"```gql\n(.*?)\n```", open(os.path.join(STD, d + '.md'), encoding='utf-8').read(), re.S)):
            if gs.changeset_header(b): continue   # a change set is linted by its own dry run, which may be meant to refuse it
            found += [f"{d} block {i + 1}, {x}" for x in [lint_detail([f]) for f in gs.lint(b)]]
    def strings(o): return [o] if isinstance(o, str) else [x for v in (o.values() if isinstance(o, dict) else o if isinstance(o, list) else []) for x in strings(v)]
    for o in [c for c in C_] + list(confs.values()):
        found += [f"{o.get('case', 'configuration')}: {lint_detail([f])}" for t in strings({k: v for k, v in o.items() if k != 'rounds'} | {'r': [{k: v for k, v in r.items() if k != 'mutations'} for r in o.get('rounds') or []]}) if re.search(r"\bMATCH\b", t) for f in gs.lint(t)]
    results.append((f"suite: every GQL block in the {len(docs)} case documents, and every query in the case data, passes the dialect linter (§24 H1)", not found, '; '.join(found[:3])))
    here = os.path.dirname(os.path.abspath(__file__)); found, n = [], 0
    for f in sorted(glob.glob(os.path.join(here, 'graph_spec*.py')) + glob.glob(os.path.join(here, 'graph-spec-*.py'))):
        for line, q in gs.embedded_queries(f):
            n += 1; found += [f"{os.path.basename(f)}:{line} {x['trap']} — {x['fix']}" for x in gs.lint(q)]
    results.append((f"suite: every GQL query written inside the graph spec's scripts ({n}) passes the dialect linter (§24 H1)", n > 0 and not found, '; '.join(found[:3])))
    # §24 H2: every computed value in a case document equals its recipe; a hand edit is caught; ni: ids match RFC 6920's own example
    filled = [d for d in docs if os.path.exists(os.path.join(STD, d + '.md')) and gs.FILL_BLOCK.search(open(os.path.join(STD, d + '.md'), encoding='utf-8').read())]   # a Word file's companion is <name>.docx.md
    bad = {d: gs.fill_check(open(os.path.join(STD, d + '.md'), encoding='utf-8').read(), STD, VAULT) for d in filled}
    results.append((f"suite: every computed value in the {len(filled)} case documents with recipes recomputes unchanged (§24 H2)", bool(filled) and not any(bad.values()), str({d: b for d, b in bad.items() if b})))
    if filled:
        t = open(os.path.join(STD, filled[0] + '.md'), encoding='utf-8').read(); v = next(iter(gs.fill_recipes(t).values()))['value']
        i = t.index(v); edited = t[:i] + v[:-1] + ('0' if v[-1] != '0' else '1') + t[i + len(v):]
        results.append((f"suite: a computed value edited by hand is caught — {filled[0]} (§24 H2)", bool(gs.fill_check(edited, STD, VAULT)), ''))
    import subprocess
    # the plugin and the vault lay every graph out from the same Graphviz source (test_layout_parity, 8 Oct 2026)
    par = subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'graph-spec-layout-parity.py'), '--summary'], capture_output=True, text=True)
    results.append(("suite: every vault graph is laid out byte for byte the same by the plugin's core and by graph-spec-draw.py, both ways round (graph-spec-layout-parity.py)", par.returncode == 0, par.stdout.strip() or par.stderr.strip()[:300]))
    results.append(("suite: an ni: id equals RFC 6920's own example for \"Hello World!\" (§13, §24 H2)", gs.ni_uri(b'Hello World!') == 'ni:///sha-256;f4OxZX_x_FO5LcGBSKHWXfwtSx-j1ncoSt3SABJtkGk', gs.ni_uri(b'Hello World!')))
    # derivatives in the vault regenerate from vault scripts: the demo's data note from the engine, and the spec's diagrams from that note
    import importlib.util
    def mod(f):
        sp = importlib.util.spec_from_file_location(f.replace('-', '_')[:-3], os.path.join(os.path.dirname(os.path.abspath(__file__)), f)); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m
    pub, dia = mod('graph-spec-demo-publish.py'), mod('graph-spec-diagrams.py')
    bench = mod('graph-spec-ai-bench.py')   # §24 H9: the AI tasks' grader — a right answer passes and a wrong one fails, with no model called
    for tid, what, right_ok, wrong_fails in bench.self_test():
        results.append((f"suite: AI task {tid} ({what}) — its grader passes the right answer and fails a wrong one (§24 H9)", right_ok and wrong_fails, f"right passes {right_ok}, wrong fails {wrong_fails}"))
    trace = mod('graph-spec-trace.py')   # the spec describes itself: its meta-schema and its requirements graph (decision of 6 Oct 2026)
    traced = trace.checks(); results += [(f"suite: {l}", ok, d) for l, ok, d in traced]
    import gql_profile as gp
    meta_b, req_b = trace.blocks(trace.META)[0], trace.req_blocks()[1]
    mdb = gs.load(meta_b); results.append(("suite: self-description: Grafeo — the meta-schema types itself, and a node labelled only Meta is untyped", gs.typed(mdb) and not gs.typed(gs.load("// graph: meta\nINSERT (x:Meta {id: 'x'})")) and gs.untyped(gs.load("// graph: meta\nINSERT (x:Meta {id: 'x'})"))[0] == ['Meta'], ''))
    st = gp.Store(); st.apply(req_b); a, b = gs.canon_graph(gs.load(req_b), 'joined'), gp.canon(st, 'requirements')
    results.append(("suite: self-description: Grafeo builds the requirements graph exactly as the portable reader does", a == b, f"Grafeo {a[1:]} · reader {b[1:]}"))
    if not check_only: trace.write_report([(l.split(': ', 1)[1], ok, d) for l, ok, d in traced])
    note = open(pub.NOTE, encoding='utf-8').read(); spec = open(dia.SPEC, encoding='utf-8').read()
    results.append(("suite: Lending demo graph data matches a fresh rebuild by the vault's engine, in its published format (graph-spec-demo-publish.py)", pub.compose(note, *pub.build(note)) == note, ''))
    results.append(("suite: the spec's 14 example diagrams and E4's SCXML match a fresh drawing from the demo's data (graph-spec-diagrams.py)", dia.place(spec, dia.draw()) == spec, ''))
    # every safeguard is necessary: switched off, at least one case must fail
    necessary = {}
    for sw in SAFEGUARDS:
        fails = []
        for c in C_:
            if c.get('kind') in ('rebuild', 'reader'): continue   # no switch reaches the engine or the readers; its own checks stand
            for rnd in c['rounds']:
                if not all(ok for _, ok, _ in run_any(c, rnd, confs, frozenset([sw]))): fails.append(f"{c['case']} · {rnd['name']}"); break
        necessary[sw] = fails
        results.append((f"safeguard needed — without {SAFEGUARDS[sw]}, a case fails", bool(fails), ', '.join(fails[:3]) if fails else 'no case fails without it'))
    for c_ in C_: results += profile_agreement(c_)
    passed = sum(ok for _, ok, _ in results)
    for l, ok, d in results:
        if not ok or '-v' in sys.argv: print(f"{'ok  ' if ok else 'FAIL'} {l}" + (f" — {d}" if d and not ok else ''))
    print(f"{passed} of {len(results)} checks passed · {len(C_)} cases · {len(SAFEGUARDS)} safeguards")
    if not check_only: write_report(C_, results, necessary)
    return 0 if passed == len(results) else 1

def write_report(C_, results, necessary):
    now = dt.datetime.now().strftime('%Y-%m-%dT%H:%M')
    by_case = {}
    for l, ok, d in results: by_case.setdefault(l.split(' · ')[0] if ' · ' in l else 'suite', []).append((l, ok, d))
    lines = [f"""---
uuid: "{REPORT_UUID}"
created: 2026-10-04T23:30
modified: {now}
modified_by: "script/graph-spec-conformance.py@mac14"
status: active
classification: Public
regenerable: true
generated_by: "zzSupport/_scripts/graph-spec-conformance.py"
tags: [graph-model, test, generated]
human_reviewed: false
---

# Graph spec conformance — report

> [!warning] Generated — do not hand-edit
> Regenerated by `zzSupport/_scripts/graph-spec-conformance.py` from the cases in the test documents and the configurations in [[Graph spec conformance suite]]. §17 of [[Graph spec model]] makes passing this suite a condition of conformance.

**{sum(ok for _, ok, _ in results)} of {len(results)} checks passed** · {len(C_)} cases · {len(necessary)} safeguards · run {now.replace('T', ' ')}.

## Cases

| Case | Lead document | Rounds | Checks passed |
|---|---|---|---|"""]
    for c in C_:
        rs = by_case.get(c['case'], [])
        lines.append(f"| {c['title']} | [[{c['_lead']}]] | {len(c['rounds'])} | {sum(ok for _, ok, _ in rs)} of {len(rs)} |")
    notes = sorted(set(gs.NOTICES))
    if notes: lines += ["", "## Notices", "", "Not failures — things a reader should know."] + [f"- {n}" for n in notes]
    lines += ["", "## Every safeguard is needed", "", "Each safeguard switched off in turn; at least one case must then fail.", "", "| Safeguard | A case that fails without it |", "|---|---|"]
    lines += [f"| {SAFEGUARDS[s]} | {f[0] if f else '**none — not shown to be needed**'} |" for s, f in necessary.items()]
    for c in C_:
        lines += ["", f"## {c['title']}", ""]
        lines += [f"- {'✅' if ok else '❌'} {l.split(': ', 1)[1] if ': ' in l else l}" + (f" — {d}" if d and not ok else '') for l, ok, d in by_case.get(c['case'], [])]
    lines += ["", "## Suite", ""] + [f"- {'✅' if ok else '❌'} {l.split(': ', 1)[1] if l.startswith('suite: ') else l}" + (f" — {d}" if d and not ok else '') for l, ok, d in results if not any(l.startswith(c['case'] + ' · ') for c in C_)]
    open(REPORT, 'w', encoding='utf-8').write("\n".join(lines) + "\n")

if __name__ == '__main__':
    sys.exit(main())
