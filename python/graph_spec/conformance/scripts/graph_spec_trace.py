#!/usr/bin/env python3
"""Checks that the graph spec describes itself — its meta-schema types itself and equals every checker's built-in copy, and its requirements graph quotes every rule in the spec and names a real test for each proof — and that every written test of the graph note editor was seen to fail first, then writes the rule card.

Usage:
  python3 zzSupport/_scripts/graph_spec_trace.py            # check, and write the trace report
  python3 zzSupport/_scripts/graph_spec_trace.py --check    # check only, write nothing; exit 1 on any failure
  python3 zzSupport/_scripts/graph_spec_trace.py -v         # also print the checks that pass

Writes: Standards/Graph spec requirements — trace report.md (generated, regenerable); nothing with --check. Exit 1 if any check fails.
Reads, never writes: the tests-first record in ~/Dev/graph-note, when that repo is on this machine — test/tests-first/ through the
repo's own scripts/tests-first-records.mjs summary() (run with node, read-only), or the old test/tests-first.json and test/seen-failing.json.

Category: Checks — graph model

WHY (6 Oct 2026): Roger asked "Is it possible to write the spec using the spec format?" and chose option A —
Standards/2026-10-06 The graph spec describes itself — its vocabulary and its rules are graphs.decision.md.
Two documents carry it: Standards/Graph spec meta-schema.md (the types every schema is written in) and
Standards/Graph spec requirements.md (every rule as a node). The checkers keep a built-in copy of the vocabulary,
because a browser page has no vault to read; this script proves the copies equal the document. The requirements
graph is an index of the prose, so drift is checked both ways: every must/should line in §§1–24 is quoted, and every
quote is still in its section. Each drift check is shown to bite on a tampered copy. Standard library only; needs
node for the JavaScript checker. The conformance suite runs checks() and fails if any check here fails.
"""
import os, re, sys, json, subprocess, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import gql_profile as gp, graph_rules as gr
VAULT = os.path.abspath(os.path.join(HERE, '..')); STD = os.path.join(VAULT, 'Standards')
SPEC = os.path.join(STD, 'Graph spec model.md')
META = os.path.join(STD, 'Graph spec meta-schema.md')
REQS = os.path.join(STD, 'Graph spec requirements.md')
REPORT = os.path.join(STD, 'Graph spec requirements — trace report.md')
REPORT_UUID = '449f986c-7262-4b5f-ae9c-5e0e77eff0fa'
KEYWORD = re.compile(r"\b(must|should)\b", re.I)
ITEM = re.compile(r"^\s*(?:>\s*)*(?:[-*]|\d+[a-z]?\.)\s")
GENERAL = {'case:every-case', 'case:suite'}

def blocks(path): return re.findall(r"```gql\n(.*?)\n```", open(path, encoding='utf-8').read(), re.S)

# In the repository the requirements graph is one file: requirements/graph-spec.gql.
# It is read in place of the marker line in Standards/Graph spec requirements.md.
# So the suite and the repository's own checks read the same rules.
REQS_GQL = os.path.join(__import__('graph_spec_host').REPO, 'requirements', 'graph-spec.gql')
REQS_MARK = '<!-- the requirements graph: requirements/graph-spec.gql -->'
def reqs_text():
    return open(REQS, encoding='utf-8').read().replace(REQS_MARK, '```gql\n' + open(REQS_GQL, encoding='utf-8').read().rstrip('\n') + '\n```')
def req_blocks(): return re.findall(r"```gql\n(.*?)\n```", reqs_text(), re.S)

# ── the meta-schema ──────────────────────────────────────────────────────────────────────────
def declared(G):
    T = [G.p(i) for i in G.labelled('ElementType')]
    return ({t['name'] for t in T if t.get('kind') == 'node'}, {t['name'] for t in T if t.get('kind') == 'node' and t.get('marker') is True},
            {t['name'] for t in T if t.get('kind') == 'edge'})

def meta_graph(text=None):
    st = gp.Store()
    for b in ([text] if text is not None else blocks(META)): st.apply(b)
    w = gr.World.from_store(st)
    return w.schemas.get(gr.SPEC_SCHEMA), st

def js_builtins(meta_block):
    """The JavaScript checker's built-in vocabulary, and whether it types the meta-schema on its own and refuses a node labelled only Meta."""
    js = """const C = require(process.argv[1]); const b = require('fs').readFileSync(0, 'utf8');
const w = C.worldFromStore(C.read([b])), G = w.__schemas[C.SPEC_SCHEMA];
const lone = C.worldFromStore(C.read(["// graph: g\\nINSERT (x:Meta {id: 'x'})"])).g;
process.stdout.write(JSON.stringify({schema: C.SPEC_SCHEMA, nodes: C.SPEC_NODES, markers: C.SPEC_MARKERS, edges: C.SPEC_EDGES,
  self_typed: G ? C.typed(G, undefined, false) : null, lone_meta_typed: C.typed(lone)}));"""
    try:
        r = subprocess.run(['node', '-e', js, __import__('graph_spec_host').VENDOR_JS], input=meta_block, capture_output=True, text=True, timeout=60)
        return json.loads(r.stdout) if r.returncode == 0 else {'error': r.stderr.strip()[:200]}
    except (OSError, ValueError, subprocess.TimeoutExpired) as e: return {'error': f"{type(e).__name__}: {e}"}

def meta_checks():
    out = []; add = lambda l, ok, d='': out.append((l, bool(ok), '' if ok else d))
    bs = blocks(META); add("the meta-schema note holds exactly one block", len(bs) == 1, f"{len(bs)} blocks")
    if len(bs) != 1: return out
    G, _ = meta_graph()
    add(f"the meta-schema declares the schema {gr.SPEC_SCHEMA}, the name the checkers build in", G is not None, "no SCHEMA block of that name")
    if G is None: return out
    nodes, markers, edges = declared(G)
    add("the meta-schema types itself with the built-in vocabulary switched off — every node and edge in it is declared by it (§5)", gr.typed(G, None, builtin=False), str(gr.untyped(G, None, builtin=False)))
    add("the meta-schema declares both readings for every edge type it declares (§5)", not gr.types(G, None, builtin=False)[2], str([t['name'] for t in gr.types(G, None, builtin=False)[2]]))
    add("Python's built-in vocabulary (graph_rules.SPEC_*) equals the meta-schema", (set(gr.SPEC_NODES), set(gr.SPEC_MARKERS), set(gr.SPEC_EDGES)) == (nodes, markers, edges),
        f"built in {sorted(gr.SPEC_NODES)} {sorted(gr.SPEC_MARKERS)} {sorted(gr.SPEC_EDGES)} · declared {sorted(nodes)} {sorted(markers)} {sorted(edges)}")
    lone = gr.World.from_store((lambda s: (s.apply("// graph: g\nINSERT (x:Meta {id: 'x'})"), s)[1])(gp.Store()))['g']
    add("Python: a node labelled only Meta is untyped — a marker never types a node by itself", not gr.typed(lone) and gr.untyped(lone)[0] == ['Meta'], str(gr.untyped(lone)))
    j = js_builtins(bs[0])
    if 'error' in j: add("JavaScript: the checker runs under node", False, j['error'])
    else:
        add("JavaScript's built-in vocabulary (graph-spec-check.js SPEC_*) equals the meta-schema", j['schema'] == gr.SPEC_SCHEMA and (set(j['nodes']), set(j['markers']), set(j['edges'])) == (nodes, markers, edges), json.dumps(j))
        add("JavaScript: the meta-schema types itself with the built-in vocabulary switched off", j['self_typed'] is True, json.dumps(j))
        add("JavaScript: a node labelled only Meta is untyped", j['lone_meta_typed'] is False, json.dumps(j))
    copies = []   # the vocabulary is written once per language — graph_spec.py imports Python's
    for f, allowed in (('graph_rules.py', r"^SPEC_(NODES|MARKERS|EDGES) = "), ('graph_spec.py', None), ('graph-spec-check.js', r"^\s*(?:(?:const|var|let)\s+)?SPEC_(?:SCHEMA|SCHEMA_NODES|AGENTS|NODES|MARKERS|EDGES)\s*=")):
        for n, line in enumerate(open(__import__('graph_spec_host').VENDOR_JS if f.endswith('.js') else os.path.join(__import__('graph_spec_host').VENDOR_PY, f), encoding='utf-8'), 1):
            if re.search(r"""['"](DECLARES|GraphMeta)['"]\s*[,}\]]""", line) and re.search(r"[{\[]\s*['\"](GraphMeta|ElementType|DECLARES)", line) and not (allowed and re.search(allowed, line)):
                copies.append(f"{f}:{n}")
    add("no checker carries a second copy of the vocabulary — graph_spec.py reads Python's", not copies, ', '.join(copies))
    bad, _ = meta_graph(re.sub(r"\n \(t_DECLARES:[^\n]*", "", bs[0]).rstrip().rstrip(','))   # tampered: DECLARES no longer declared
    add("tampering is caught — the meta-schema with its DECLARES declaration removed no longer types itself", bad is not None and not gr.typed(bad, None, builtin=False), '')
    return out

# ── the spec's text ──────────────────────────────────────────────────────────────────────────
def spec_lines(text=None):
    """(lines, sections {num: (title, first, stop)}, start, stop) for the Specification part — §§1–24 and the preamble above §1."""
    L = (text if text is not None else open(SPEC, encoding='utf-8').read()).splitlines()
    start = next(i for i, l in enumerate(L) if l.strip() == '## Specification'); stop = next(i for i, l in enumerate(L) if l.strip() == '## Examples')
    secs, cur = {}, None
    for i in range(start, stop):
        m = re.match(r"### (\d+)\. (.+)$", L[i])
        if m:
            if cur: secs[cur] = (secs[cur][0], secs[cur][1], i)
            cur = m.group(1); secs[cur] = (m.group(2).strip(), i, stop)
    if cur: secs[cur] = (secs[cur][0], secs[cur][1], stop)
    return L, secs, start, stop

def normative(L, start, stop):
    """Line numbers that must be quoted: every non-heading line using must or should, and every list item a must/should line ending ':' introduces, or a '**Rules —' line."""
    out, i = [], start
    while i < stop:
        l = L[i]
        if l.lstrip().startswith('#'): i += 1; continue
        if KEYWORD.search(l): out.append(i)
        lead = KEYWORD.search(l) and (l.rstrip().endswith(':') or l.lstrip().startswith('**Rules —'))
        if lead:
            j = i + 1
            while j < stop and not L[j].strip(): j += 1
            while j < stop and (ITEM.match(L[j]) or (L[j].startswith('  ') and L[j].strip() and not L[j].lstrip().startswith('#'))):
                if ITEM.match(L[j]) and j not in out: out.append(j)
                j += 1
            i = j; continue
        i += 1
    return sorted(set(out))

# ── the requirements graph ───────────────────────────────────────────────────────────────────
def req_world(text=None):
    st = gp.Store()
    for b in (re.findall(r"```gql\n(.*?)\n```", text, re.S) if text is not None else req_blocks()): st.apply(b)
    return gr.World.from_store(st)

def suite_cases():
    """{case id: (title, lead document, case data text)} from every '# conformance case' block in Standards/."""
    out = {}
    for f in sorted(os.listdir(STD)):
        if not f.endswith('.md'): continue
        for b in re.findall(r"```yaml\n(# conformance case.*?)\n```", open(os.path.join(STD, f), encoding='utf-8').read(), re.S):
            c, t = re.search(r"^case:\s*(.+)$", b, re.M), re.search(r"^title:\s*(.+)$", b, re.M)
            if c: out[c.group(1).strip()] = (t.group(1).strip() if t else '', f[:-3], b)
    return out

def decisions():
    out = {}
    for root, dirs, files in os.walk(VAULT):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules',)]
        for f in files:
            if f.endswith('.decision.md'): out['note:' + f[:-3].replace("'", '')] = f[:-3]
    return out

def req_checks(spec_text=None, req_text=None):
    out = []; add = lambda l, ok, d='': out.append((l, bool(ok), '' if ok else d))
    L, secs, start, stop = spec_lines(spec_text)
    w = req_world(req_text); name = 'requirements'
    if name not in w.graphs: add("the requirements note holds the requirements graph", False, f"graphs: {sorted(w.graphs)}"); return out
    g = w[name]
    for l, ok, d in gr.check(w, name): add(f"the requirements graph keeps the spec's own rules — {l}", ok, d)
    part = {e[0]: e[2] for e in g.edges if e[1] == 'PART_OF'}
    R, W = g.labelled('Requirement'), g.labelled('Wording')
    num = {s: g.p(s).get('num') for s in g.labelled('Section')}
    def lines_of(i):
        s = part.get(i); n = num.get(s)
        return range(secs[n][1], secs[n][2]) if n in secs else range(start, stop)
    lost = [i for i in R + W if not any(g.p(i).get('quote', '\0') in L[k] for k in lines_of(i))]
    add(f"every quote is still in the spec, in the section it is part of — {len(R)} requirements, {len(W)} wordings", not lost, ', '.join(lost[:6]))
    quotes = [g.p(i)['quote'] for i in R + W if g.p(i).get('quote')]
    lines = normative(L, start, stop)
    unquoted = [k for k in lines if not any(q in L[k] for q in quotes)]
    add(f"every must or should line in §§1–24, and every item such a line introduces, is quoted — {len(lines)} lines", not unquoted,
        '; '.join(f"line {k + 1}: {L[k].strip()[:90]}" for k in unquoted[:4]))
    multi = [i for i in R if sum(1 for e in g.out(i, 'PART_OF')) != 1]
    add("every requirement is part of exactly one section", not multi, ', '.join(multi[:6]))
    badlevel = [i for i in R if g.p(i).get('level') not in ('must', 'should') or not g.p(i).get('statement')]
    add("every requirement says must or should, and states its rule in a line", not badlevel, ', '.join(badlevel[:6]))
    badsec = [s for s in g.labelled('Section') if num[s] not in secs or secs[num[s]][0] != g.p(s).get('title')]
    add("every section named is a heading of the spec, with the same title", not badsec, ', '.join(f"{s} ({g.p(s).get('title')})" for s in badsec))
    # The decision notes stay in the owner's vault, so in the repository this check runs only where some are present.
    # Explaining each decision in the repository is GS6's spec_decisions_explained.
    D = decisions(); badd = [d for d in g.labelled('Decision') if d not in D]
    if D: add("every decision a requirement names is a decision note in the vault", not badd, ', '.join(badd[:4]))
    s19 = '\n'.join(L[secs['19'][1]:secs['19'][2]]) if '19' in secs else ''
    bads = [s for s in g.labelled('Standard') if g.p(s).get('name', '\0') not in s19]
    add("every standard a requirement references is listed in §19", not bads, ', '.join(bads))
    C = suite_cases(); badc = [c for c in g.labelled('ConformanceCase') if c not in GENERAL and (c[5:] not in C or C[c[5:]][0] != g.p(c).get('title'))]
    add(f"every conformance case named is a case in the suite, with the same title — {len(C)} cases", not badc, ', '.join(badc))
    badt = []
    for e in (e for e in g.edges if e[1] == 'PROVED_BY'):
        t = e[3].get('test')
        if e[2] in GENERAL: ok = t == 'general'
        else: ok = e[2][5:] in C and t != 'general' and re.search(rf"(?<![A-Za-z0-9]){re.escape(str(t))}(?![0-9a-z])", C[e[2][5:]][2])
        if not ok: badt.append(f"{e[0]} → {e[2]} {t}")
    add("every planted test a proof names is in that case's data; general proofs point only at the suite's general checks", not badt, ', '.join(badt[:5]))
    badr = [e[0] for e in g.edges if e[1] == 'RESTATES' and (e[0] == e[2] or not g.has(e[2], 'Requirement'))]
    add("every restatement points at another requirement", not badr, ', '.join(badr))
    return out

def req_mutations():
    """Each drift check bites: a reworded rule, a new must line and a test that does not exist are each caught."""
    out = []; spec = open(SPEC, encoding='utf-8').read(); reqs = reqs_text()
    w = req_world(); g = w['requirements']; q = g.p(sorted(g.labelled('Requirement'))[0])['quote']
    def caught(label, s=spec, r=reqs, want=''):
        fails = [l for l, ok, _ in req_checks(s, r) if not ok]
        out.append((f"tampering is caught — {label}", bool(fails) and (not want or any(want in f for f in fails)), f"failed: {fails[:2]}" if fails else 'not caught'))
    caught("a quoted rule reworded in the spec", s=spec.replace(q, q.upper(), 1), want='every quote is still in the spec')
    i = spec.index('### 9. Time'); caught("a new must line added to the spec, quoted by nothing", s=spec[:i] + "- **A new rule nobody indexed must be found.**\n\n" + spec[i:], want='is quoted')
    m = re.search(r"PROVED_BY \{test: '([A-Z]\d+)'", reqs); caught("a proof naming a planted test that does not exist", r=reqs[:m.start(1)] + 'Z99' + reqs[m.end(1):], want='planted test')
    return out

# ── the editor's tests, seen to fail first ─────────────────────────────────────────────────────
# Added 8 Oct 2026, for tests_first in Standards/Graph note editor requirements.md. Its rule: "Every test is written
# first, and seen to fail before its code is written." The repository proves it mechanically.
# scripts/tests-first.mjs replays each commit's new tests against its parent's code, and records the result.
# Each test that passed first is excused there, with its reason. This reads both, read-only.
# Every written test of the editor that lives in the repo must be fully proved or explained.
# A repo that is not on this machine is said so, never passed.
EDITOR_REQS = os.path.join(STD, 'Graph note editor requirements.md')
REPO = __import__('graph_spec_host').REPO

def editor_test_files(text=None):
    """{test id: [repo test files]} for each written test of the editor that lives in the repo — test files only,
    since a workflow or a checklist is not replayed."""
    t = text if text is not None else open(EDITOR_REQS, encoding='utf-8').read()
    out = {}
    for m in re.finditer(r"\((test_\w+):Test \{proves: '(?:[^'\\]|\\.)*', file: '([^']*)', status: 'written'\}\)", t):
        tid, f = m.groups()
        if f.startswith('graph-note: '):
            out[tid] = re.findall(r"[\w./-]+\.(?:test\.m?js|py)\b", f)
    return out

def editor_tests_first(record, text=None):
    """One check per written test of the editor: every file it names has an entry, and every test that passed against its
    parent is excused with a reason. A count not replayed passes: the repo keeps only a new test that failed at its own
    commit, its code following in the next (Roger, 10 Oct 2026), and fails its record on any other (16 Oct 2026). `record` is {'files': {file: {'notReplayed': n,
    'passedFirst': n, 'excused': n}}}, as normalised from either form of the repo's record."""
    out = []; add = lambda l, ok, d='': out.append((l, bool(ok), '' if ok else d))
    for tid, files in sorted(editor_test_files(text).items()):
        if not files: continue
        bad = []
        for f in files:
            e = record['files'].get(f)
            if e is None: bad.append(f"{f} has no entry in the tests-first record"); continue
            if e['passedFirst'] > e['excused']: bad.append(f"{f}: {e['passedFirst'] - e['excused']} test(s) passed first, with no reason")
        add(f"editor tests first: {tid} — each new test seen failing against its parent, or excused with its reason", not bad, '; '.join(bad[:3]))
    return out

def read_tests_first():
    """The repo's tests-first record, normalised, or (None, why). Two forms: the record kept per commit in test/tests-first/
    with reasons in test/seen-failing/ (from graph-note #69, 11 Oct 2026), read through the repo's own summary() so the
    tally is never written twice; or the old single files test/tests-first.json and test/seen-failing.json."""
    shards, rec, exc = (os.path.join(REPO, 'test', p) for p in ('tests-first', 'tests-first.json', 'seen-failing.json'))
    if os.path.isdir(shards):
        mod = os.path.join(REPO, 'scripts', 'tests-first-records.mjs')
        js = ("const {summary}=await import(process.argv[1]);"
              "process.stdout.write(JSON.stringify(summary(process.argv[2])))")
        try:
            r = subprocess.run(['node', '--input-type=module', '-e', js, 'file://' + mod, REPO],
                               capture_output=True, text=True, timeout=300)
        except (OSError, subprocess.TimeoutExpired) as e:
            return None, f"the repo's summary() could not be run: {e}"
        if r.returncode != 0: return None, f"the repo's summary() failed: {r.stderr.strip()[:300]}"
        files = json.loads(r.stdout)['files']
        return {'files': {f: {'notReplayed': e['notReplayed'], 'passedFirst': len(e['passedFirst']), 'excused': e['excused']}
                          for f, e in files.items()}}, None
    if os.path.exists(rec) and os.path.exists(exc):
        record, excused = json.load(open(rec, encoding='utf-8')), json.load(open(exc, encoding='utf-8'))
        return {'files': {f: {'notReplayed': e['notReplayed'], 'passedFirst': len(e['passedFirst']),
                              'excused': sum(1 for p in e['passedFirst'] if p['name'] in excused.get(f, {}))}
                          for f, e in record['files'].items()}}, None
    return None, "neither test/tests-first/ nor test/tests-first.json is there"

def editor_checks():
    # In the repository this is CI's own job: scripts/tests-first.mjs --check and --complete run on every pull request,
    # against requirements/editor-requirements.md. The vault's copy of the editor requirements is not here.
    if not os.path.exists(EDITOR_REQS): return []
    if not os.path.isdir(os.path.join(REPO, '.git')):
        print(f"editor tests first: not checked — {REPO} is not on this machine", file=sys.stderr)
        return []
    record, why = read_tests_first()
    # the repo is here, so a record that cannot be read fails, never passes quietly (11 Oct 2026: #69 moved the record
    # and this check went on reporting "not on this machine" and passing)
    if record is None: return [("editor tests first: the repo's tests-first record is read", False, why)]
    out = editor_tests_first(record)
    # each check is shown to bite on a tampered record
    named = {x for fs in editor_test_files().values() for x in fs}
    f = next((f for f, e in sorted(record['files'].items()) if e['excused'] and f in named), None)
    if f:
        cut = json.loads(json.dumps(record)); cut['files'][f]['excused'] -= 1
        out.append(("tampering is caught — a test that passed first with no reason fails its editor check",
                    any(not ok for _, ok, _ in editor_tests_first(cut)), ''))
    first = next((fs[0] for fs in editor_test_files().values() if fs), None)
    if first:
        gone = json.loads(json.dumps(record)); gone['files'].pop(first, None)
        out.append(("tampering is caught — a test file missing from the record fails its editor check",
                    any(not ok for _, ok, _ in editor_tests_first(gone)), ''))
    return out

def checks():
    return [(f"self-description: {l}", ok, d) for l, ok, d in meta_checks() + req_checks() + req_mutations() + editor_checks()]

# ── the rule card ───────────────────────────────────────────────────────────────────────────
def write_report(results):
    now = dt.datetime.now().strftime('%Y-%m-%dT%H:%M')
    w = req_world(); g = w['requirements']; L, secs, _, _ = spec_lines(); C = suite_cases(); D = decisions()
    R = g.labelled('Requirement'); part = {e[0]: e[2] for e in g.edges if e[1] == 'PART_OF'}
    proofs = lambda i: [(e[2], e[3].get('test'), e[3].get('partial') is True) for e in g.out(i, 'PROVED_BY')]
    status = lambda i: 'proved' if any(not p for _, _, p in proofs(i)) else 'partial' if proofs(i) else 'unproved'
    restated = {}
    for e in g.edges:
        if e[1] == 'RESTATES': restated.setdefault(e[2], []).append(e[0])
    def link(c, t):
        if c == 'case:every-case': return 'every case'
        if c == 'case:suite': return 'the suite'
        lead = C.get(c[5:], ('', c[5:], ''))[1]; return f"[[{lead}\\|{c[5:]}]]" + (f" {t}" if t and t != 'general' else '')
    by = {}
    for i in R: by.setdefault(g.p(part[i]).get('num'), []).append(i)
    order = sorted(by, key=int); n = {k: sum(status(i) == k for i in R) for k in ('proved', 'partial', 'unproved')}
    passed = sum(ok for _, ok, _ in results)
    bar = lambda a, b, c, width=20: '█' * round(width * a / max(a + b + c, 1)) + '▒' * round(width * b / max(a + b + c, 1))
    lines = [f"""---
uuid: "{REPORT_UUID}"
created: 2026-10-06T15:52
modified: {now}
modified_by: "script/graph_spec_trace.py@mac14"
status: active
classification: Public
regenerable: true
generated_by: "zzSupport/_scripts/graph_spec_trace.py"
bundle: Graph spec requirements
bundle_role: derivative
tags: [graph-model, requirements, generated]
human_reviewed: false
---

# Graph spec requirements — trace report

> [!warning] Generated — do not hand-edit
> Regenerated by `zzSupport/_scripts/graph_spec_trace.py` from [[Graph spec requirements]] and [[Graph spec meta-schema]], checked against [[Graph spec model]]. To change a rule, change the spec and the requirement that quotes it; to change a proof, change the requirement. This is §24's helper H6, the rule card.

| Bundle member | Role |
|---|---|
| [[Graph spec requirements]] | source — the rules as a graph |
| [[Graph spec meta-schema]] | source — the vocabulary every schema is written in |
| Graph spec requirements — trace report | derivative — this view |

## Overview

**{len(R)} requirements · {n['proved']} proved · {n['partial']} proved in part · {n['unproved']} not yet proved** · self-description checks {passed} of {len(results)} passed · run {now.replace('T', ' ')}.

`█` proved · `▒` proved in part · blank not yet proved

```
""" + "\n".join(f"§{k:<3} {secs[k][0][:44]:<44} {bar(*(sum(status(i) == s for i in by[k]) for s in ('proved', 'partial', 'unproved'))):<20}  {sum(status(i) == 'proved' for i in by[k])}/{len(by[k])}" for k in order) + "\n```"]
    fails = [(l, d) for l, ok, d in results if not ok]
    if fails: lines += ["", "> [!failure] Checks failing", ">"] + [f"> - {l} — {d}" for l, d in fails]
    lines += ["", "## Working — what is not yet proved", "", "Each needs a planted test in a conformance case, or a reason it cannot have one."]
    for k in order:
        todo = [i for i in by[k] if status(i) != 'proved']
        if todo:
            lines += ["", f"**§{k} {secs[k][0]}**", ""]
            lines += [f"- `{i[4:]}` ({g.p(i)['level']}) — {g.p(i)['statement']}" + (f" · in part by {', '.join(link(c, t) for c, t, _ in proofs(i))}" if proofs(i) else '') for i in sorted(todo)]
    lines += ["", "## Full — every rule, with its proof and its decision"]
    for k in order:
        lines += ["", f"### §{k}. {secs[k][0]}", ""]
        for i in sorted(by[k], key=lambda x: [int(p) if p.isdigit() else p for p in re.split(r'(\d+)', x)]):
            p = g.p(i); mark = {'proved': '✅', 'partial': '◐', 'unproved': '⬜'}[status(i)]
            ds = [D[e[2]] for e in g.out(i, 'DECIDED_IN') if e[2] in D]
            extra = ([f"proved by {', '.join(link(c, t) + (' (in part)' if pp else '') for c, t, pp in proofs(i))}"] if proofs(i) else ['not yet proved']) \
                + ([f"restates `{e[2][4:]}`" for e in g.out(i, 'RESTATES')]) + ([f"restated by {', '.join('`' + x[4:] + '`' for x in sorted(restated[i]))}"] if i in restated else []) \
                + ([f"decided in {', '.join(f'[[{d}]]' for d in ds)}"] if ds else [])
            lines.append(f"- {mark} **`{i[4:]}`** ({p['level']}) — {p['statement']} · " + ' · '.join(extra))
    W = g.labelled('Wording')
    lines += ["", "## Wording that states no requirement", "", "Lines that use *must* or *should* without stating a rule of their own, and why.", ""]
    lines += [f"- *{g.p(i)['quote']}* — {g.p(i)['why']}" for i in sorted(W)]
    lines += ["", "## Self-description checks", ""] + [f"- {'✅' if ok else '❌'} {l}" + (f" — {d}" if d and not ok else '') for l, ok, d in results]
    open(REPORT, 'w', encoding='utf-8').write("\n".join(lines) + "\n")

def main():
    results = checks()
    for l, ok, d in results:
        if not ok or '-v' in sys.argv: print(f"{'ok  ' if ok else 'FAIL'} {l}" + (f" — {d}" if d and not ok else ''))
    passed = sum(ok for _, ok, _ in results); print(f"{passed} of {len(results)} self-description checks passed")
    if '--check' not in sys.argv: write_report([(l.split(': ', 1)[1], ok, d) for l, ok, d in results])
    return 0 if passed == len(results) else 1

if __name__ == '__main__':
    sys.exit(main())
