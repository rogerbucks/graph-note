#!/usr/bin/env python3
"""Draws the Graph spec model's example diagrams — E3's process, E7's decision graph, E9.1–E9.11's ledger, catalog and schema views — and E4's SCXML export, from the lending demo's GQL, and places them in the spec.

Usage:
  ~/.venvs/graphspec/bin/python zzSupport/_scripts/graph_spec_diagrams.py --check   # regenerate, compare with the spec, write nothing
  ~/.venvs/graphspec/bin/python zzSupport/_scripts/graph_spec_diagrams.py           # regenerate and place them

Writes: Standards/Graph spec model.md — only the generated Mermaid blocks inside E3, E7 and E9, the legend line under each, E9's heading counts, and E4's SCXML block — after a backup to ~/zzBackups/notes/; nothing with --check (exit 1 if the spec differs).

Category: Checks — graph model

WHY (5 Oct 2026): the spec's diagrams are derivatives of Standards/Lending demo graph data.md, but the scripts that
drew them (diagrams.py, scxml.py, place3.py) lived only in a session scratchpad — archived at ~/zzBackups/scratch/2026-10-05-
graph-spec-session-26d3a819/. Roger: "Shouldn't all dev be in the Obsidian vault", now binding in Arbux PKMS/2026-10-05
Source code is written only in the vault, with no external repo or GitHub.decision.md. This is those three scripts,
merged and unchanged in what they draw. E4's exporter is the flat one used for the demo; graph_spec.to_scxml is the
suite's, which also handles sub-flows and names states by flow — the two are deliberately not merged. Mermaid in the note is what Obsidian renders (CLAUDE.md, Show the shape).
"""
import os, re, sys, json, shutil, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graph_spec as gs, grafeo
VAULT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
DATA = os.path.join(VAULT, 'Standards', 'Lending demo graph data.md')
SPEC = os.path.join(VAULT, 'Standards', 'Graph spec model.md')
NOTICES = []

def draw():
    """Every diagram, from the lending demo's source and built GQL — as diagrams.py drew them on 4 Oct 2026."""
    note = open(DATA, encoding='utf-8').read()
    src = dict(re.findall(r"## Source — (\w+)\n\n```gql\n(.*?)\n```", note, re.S)); blt = dict(re.findall(r"## Built — (\w+)\n\n```gql\n(.*?)\n```", note, re.S))
    blocks = {g: blt.get(g, src[g]) for g in src}
    db = grafeo.GrafeoDB(); data = {}
    for g, txt in blocks.items():
        db.execute(f"CREATE GRAPH {g}"); db.set_graph(g); db.execute(gs.strip(txt))
        N = list(db.execute_cypher("MATCH (n) RETURN id(n) AS k, labels(n) AS l, properties(n) AS p"))
        R = list(db.execute_cypher("MATCH (a)-[r]->(b) RETURN id(a) AS s, id(b) AS t, type(r) AS ty, properties(r) AS p"))
        data[g] = (N, R)
    money = lambda c: f"${c/100:,.2f}"
    def d10(v): return v.isoformat()[:10] if hasattr(v, 'isoformat') else str(v)[:10]
    def local(v):   # engine stores UTC; show Brisbane date
        return (v.replace(tzinfo=dt.timezone.utc) + dt.timedelta(hours=10)).date().isoformat() if isinstance(v, dt.datetime) else d10(v)
    SH = {'party': ('(["','"])'), 'account': ('[("','")]'), 'agreement': ('[["','"]]'), 'event': ('["','"]'), 'generated': ('{{"','"}}'),
          'snapshot': ('[/"','"/]'), 'issued': ('[/"','"\\]'), 'blob': ('[\\"','"/]'), 'meta': ('("','")'),
          'current': ('["','"]'), 'superseded': ('("','")'), 'review': ('{{"','"}}'), 'concept': ('(("','"))'), 'ref': ('>"','"]'), 'option': ('[/"','"/]'),
          'engine': ('{{"','"}}'), 'activity': ('(("','"))'), 'std': ('["','"]'), 'graphref': ('[("','")]'), 'store': ('[("','")]'), 'rule': ('["','"]'), 'ka': ('[/"','"/]')}
    def fam(g, n):
        L, p = set(n['l']), n['p']
        if 'Meta' in L:
            return 'meta', (f"Schema {p['schema']}<br/>owner {p['owner_engine']}" if 'GraphMeta' in L else f"{p['name']}<br/>{p['origin']}" + (f" · {p['rule']}" if p.get('rule') else '') + (f"<br/>reads: {p['reading']}" if p.get('reading') else '') + (f"<br/>reverse: {p['reverse_name']}" if p.get('reverse_name') else ''))
        if g == 'ledger':
            if 'Activity' in L: return 'activity', f"Run {p['id'][4:]}<br/>{p['engine']}"
            if L & {'Person', 'Institution'}: return 'party', p['name']
            if 'Account' in L: return 'account', p['name']
            if 'Loan' in L: return 'agreement', f"{p['id'][5:]} loan {p['rate_pa']*100:g}%<br/>{p['status']} · {money(p['balance_cents'])}"
            if 'Instalment' in L: return 'agreement', f"{p['id'][5:]} due {d10(p['due_date'])}<br/>{money(p['amount_cents'])}" + (" · payout" if p.get('amount_rule') else '')
            if 'Close' in L: return 'snapshot', f"Close {p['period']}"
            if 'Snapshot' in L: return 'snapshot', f"{p['id'].split('/',1)[1]}<br/>{money(p['balance_cents'])}"
            if 'Statement' in L: return 'issued', f"Statement {p['id'][5:]}<br/>issued {local(p['issued_at'])}"
            if 'Blob' in L: return 'blob', f"{p['role']} · {p['media_type'].split('/')[1]}<br/>sha256 {p['sha256'][:10]}…"
            if 'Delivery' in L: return 'event', f"{p['id']} {p['channel']} {p['status']}<br/>{local(p['at'])}"
            kind = [x for x in n['l'] if x not in ('Event', 'Transaction')][0]
            gen = kind in ('InterestCharge', 'DefaultInterestCharge', 'InstalmentMissed', 'GraceExpired')
            return ('generated' if gen else 'event'), f"{p['id']} {kind}" + (f" {money(p['amount_cents'])}" if 'amount_cents' in p else '') + f"<br/>{local(p['at'])}"
        if g == 'decisions':
            if 'Decision' in L:
                f = 'review' if p['id'] == 'decision:2026-08-27/arrears' else ('current' if p['status'] == 'current' else 'superseded')
                return f, f"{p['title']}<br/>{p['status']} · {local(p['decided_at'])}"
            if 'Concept' in L: return 'concept', p['name']
            if 'Ref' in L: return 'ref', f"→ {p['ref']} in {p['graph']}"
            if 'Option' in L: return 'option', f"Option: {p['text']}<br/>rejected"
        if g == 'catalog':
            if 'Engine' in L: return 'engine', f"{p['id']}<br/>{p['status']}"
            if 'GraphRef' in L: return 'graphref', f"{p['id']}<br/>{p['schema']}"
            if 'BlobStore' in L: return 'store', f"{p['id']}<br/>{p.get('status','active')}"
            if 'KnownAnswers' in L: return 'ka', f"{p['id']}<br/>digest {p['digest']}"
            if 'RuleSpec' in L: return 'rule', p['id']
            if 'Standard' in L: return 'std', p['name']
        if g == 'process':
            if 'Schedule' in L: return 'event', p['id']
            return 'event', p['id']
    RD = {g: {n['p']['name']: n['p']['reading'] for n in data[g][0] if 'ElementType' in n['l'] and n['p'].get('kind') == 'edge' and n['p'].get('reading')} | {'DECLARES': 'declares'} for g in data}   # §5 readings label the relationships
    def flow(g, title, nodes_k, edges, direction='LR'):
        N, _ = data[g]; byk = {n['k']: n for n in N}; out = [f"flowchart {direction}"]; used = set()
        for k in sorted(nodes_k, key=lambda k: byk[k]['p']['id']):
            f, lab = fam(g, byk[k]); o, c = SH[f]; out.append(f'    n{k}{o}{lab.replace(chr(34), chr(39))}{c}')
        for r in edges:
            lab = RD[g].get(r['ty'], r['ty']); used.add(r['ty'])
            if r['ty'] == 'ALLOCATED': lab = f"{lab} {money(r['p']['cents'])}"
            if r['ty'] == 'SUPERSEDES': lab = f"{lab} — " + r['p']['why']
            dotted = r['ty'] in ('WAS_GENERATED_BY', 'WAS_DERIVED_FROM', 'OF', 'PRODUCED', 'DECLARES', 'HAS_PAYLOAD', 'HAS_RENDITION', 'ABOUT', 'GOVERNS', 'DECIDED_BY', 'CONSIDERED')
            out.append(f'    n{r["s"]} {"-.->" if dotted else "-->"}|"{lab.replace(chr(34), chr(39))}"| n{r["t"]}')
        out.append('%% legend: ' + ' · '.join(f"*{RD[g].get(t, t)}* = `{t}`" for t in sorted(used)))   # placed under the diagram by put()
        return "\n".join(out)
    # ── ledger views ─────────────────────────────────────────────────────────
    N, R = data['ledger']; byk = {n['k']: n for n in N}; L = lambda k: set(byk[k]['l']); P = lambda k: byk[k]['p']
    loan_of = {}
    for r in R:
        if r['ty'] in ('APPLIES_TO', 'COVERS'): loan_of[r['s']] = P(r['t'])['id']
    for r in R:
        if r['ty'] == 'DELIVERED': loan_of[r['s']] = loan_of[r['t']]
    for r in R:
        if r['ty'] in ('HAS_PAYLOAD', 'HAS_RENDITION'): loan_of[r['t']] = loan_of[r['s']]
    STRUCT = {'Person', 'Institution', 'Account', 'Loan', 'Instalment'}
    def period(k):
        p = P(k); return p.get('period') or p['id'].split('/')[0].split(':')[1]
    VIEWS = [
     ("Structure — parties, accounts, loans and instalments", lambda r: L(r['s']) & STRUCT and L(r['t']) & STRUCT),
     ("Loan L1 — Alice lends Bob $500 — events and allocations", lambda r: 'Event' in L(r['s']) and 'Delivery' not in L(r['s']) and loan_of.get(r['s']) == 'loan:L1'),
     ("Loan L2 — Dan lends Carol $200, and Carol's $120 payment to Dan", lambda r: 'Event' in L(r['s']) and 'Delivery' not in L(r['s']) and (loan_of.get(r['s']) == 'loan:L2' or P(r['s'])['id'] == 'T2')),
     ("Loan L3 — Carol borrows $600 from Alice — events and allocations", lambda r: 'Event' in L(r['s']) and 'Delivery' not in L(r['s']) and loan_of.get(r['s']) == 'loan:L3'),
     ("Closes and snapshots — August to October", lambda r: ('Close' in L(r['s']) or 'Snapshot' in L(r['s'])) and period(r['s']) in ('2026-08', '2026-09', '2026-10')),
     ("Closes and snapshots — November to January", lambda r: ('Close' in L(r['s']) or 'Snapshot' in L(r['s'])) and period(r['s']) in ('2026-11', '2026-12', '2027-01')),
     ("Statements issued for loans L1 and L2", lambda r: (L(r['s']) & {'Statement', 'Delivery', 'Blob'}) and loan_of.get(r['s']) in ('loan:L1', 'loan:L2')),
     ("Statements issued for loan L3", lambda r: (L(r['s']) & {'Statement', 'Delivery', 'Blob'}) and loan_of.get(r['s']) == 'loan:L3'),
     ("The ledger graph's own schema", lambda r: 'Meta' in L(r['s'])),
    ]
    out, ce, cn = [], set(), set()
    for title, f in VIEWS:
        es = [r for r in R if f(r)]; ns = {r['s'] for r in es} | {r['t'] for r in es}
        out.append({'title': title, 'n': len(ns), 'e': len(es), 'mm': flow('ledger', title, ns, es)})
        ce |= {(r['s'], r['t'], r['ty']) for r in es}; cn |= ns
    NOTICES.append(("ledger coverage: nodes", len(cn), len(N), "edges", len(ce), len(R)))
    # ── process: state diagram + its schema ──────────────────────────────────
    PN, PR = data['process']; pk = {n['k']: n for n in PN}
    pm = ["stateDiagram-v2", "    direction LR"]
    for n in PN:
        if n['p'].get('initial'): pm.append(f"    [*] --> {n['p']['id'].split('/')[1]}")
    for r in PR:
        if r['ty'] != 'TRANSITION': continue
        p = r['p']; lab = f"{p['event']} · {p['trigger']}" + (f" [{p['guard']}]" if p.get('guard') else '') + (f" / {p['do'].replace(';', ',')}" if p.get('do') else '')
        pm.append(f"    {pk[r['s']]['p']['id'].split('/')[1]} --> {pk[r['t']]['p']['id'].split('/')[1]}: {lab}")
    for n in PN:
        if n['p'].get('final'): pm.append(f"    {n['p']['id'].split('/')[1]} --> [*]")
    for n in PN:
        if 'Schedule' in n['l']:
            tgt = 'in_arrears' if 'arrears' in n['p']['id'] else 'active'
            pm.append(f"    note right of {tgt}\n        {n['p']['id']} — {n['p']['runs']}, {n['p']['tz']}\n    end note")
    proc_mm = "\n".join(pm)
    pmeta = [r for r in PR if r['ty'] == 'DECLARES']; proc_meta = flow('process', '', {r['s'] for r in pmeta} | {r['t'] for r in pmeta}, pmeta, 'LR')
    # ── decisions and catalog ────────────────────────────────────────────────
    DN, DR = data['decisions']
    dmain = [r for r in DR if r['ty'] != 'DECLARES']; dmeta = [r for r in DR if r['ty'] == 'DECLARES']
    dec_mm = flow('decisions', '', {r['s'] for r in dmain} | {r['t'] for r in dmain}, dmain, 'TB')
    dec_meta = flow('decisions', '', {r['s'] for r in dmeta} | {r['t'] for r in dmeta}, dmeta, 'LR')
    CN, CR = data['catalog']
    cat_mm = flow('catalog', '', {n['k'] for n in CN}, CR, 'LR')
    return {'ledger': out, 'process': proc_mm, 'process_meta': proc_meta, 'decisions': dec_mm, 'decisions_meta': dec_meta, 'catalog': cat_mm}

def e4_scxml():
    """E4: the demo's flat process as SCXML, validated against the W3C schema — as scxml.py exported it on 4 Oct 2026."""
    from lxml import etree
    note = open(DATA, encoding='utf-8').read()
    block = re.search(r"## Source — process\n\n```gql\n(.*?)\n```", note, re.S).group(1)
    db = grafeo.GrafeoDB(); db.execute(gs.strip(block))
    S = {r['k']: r for r in db.execute_cypher("MATCH (s:State) RETURN id(s) AS k, s.id AS id, s.initial AS i, s.final AS f")}
    T = list(db.execute_cypher("MATCH (a:State)-[t:TRANSITION]->(b:State) RETURN id(a) AS s, id(b) AS d, properties(t) AS p"))
    SCH = list(db.execute_cypher("MATCH (x:Schedule) RETURN properties(x) AS p"))
    NS = "http://www.w3.org/2005/07/scxml"; E = lambda tag, **a: etree.Element(f"{{{NS}}}{tag}", **{k: str(v) for k, v in a.items()})
    name = lambda k: S[k]['id'].split('/')[1]
    root = etree.Element(f"{{{NS}}}scxml", nsmap={None: NS}, version="1.0", datamodel="ecmascript", initial=[name(k) for k in S if S[k]['i']][0], name="loan")
    root.append(etree.Comment(" Generated from graph process in [[Lending demo graph data]]. Guards are ECMAScript over the engine's context; transitions are in document order, so 'else' comes last and the first enabled transition wins — SCXML's own priority rule. "))
    for sc in SCH: root.append(etree.Comment(f" schedule {sc['p']['id']}: {sc['p']['runs']} {sc['p']['tz']} — raises events into this machine "))
    for k in sorted(S, key=lambda k: S[k]['id']):
        el = E('final' if S[k]['f'] else 'state', id=name(k)); root.append(el)
        for t in sorted([t for t in T if t['s'] == k], key=lambda t: (t['p']['event'], t['p'].get('guard') == 'else')):
            p = t['p']; attrs = {'event': p['event'], 'target': name(t['d'])}
            if p.get('guard') and p['guard'] != 'else': attrs['cond'] = p['guard'].replace(' = ', ' === ').replace(' and ', ' && ')
            tr = E('transition', **attrs); el.append(tr); tr.append(etree.Comment(f" trigger: {p['trigger']} "))
            for act in (p['do'].replace(';', ',').split(',') if p.get('do') else []): tr.append(E('raise', event=f"action.{act.strip().replace(' ', '_')}"))
    xml = etree.tostring(root, pretty_print=True, xml_declaration=True, encoding='UTF-8').decode()
    ok, err = gs.scxml_valid(xml, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'graph_spec_xsd'))
    if not ok: raise ValueError(f"refused: E4's SCXML is not valid against the W3C schema — {err}")
    return xml

FENCE = re.compile(r'```(mermaid|xml)\n.*?\n```', re.S)
def section(text, head):
    a = text.index(head); m = re.compile(r'^#{2,4} ', re.M).search(text, a + len(head)); return a, (m.start() if m else len(text))
def put(text, head, blocks, lang='mermaid'):
    a, b = section(text, head); part = text[a:b]; found = [m for m in FENCE.finditer(part) if m.group(1) == lang]
    if len(found) != len(blocks): raise ValueError(f"refused: '{head}' holds {len(found)} {lang} blocks, {len(blocks)} expected")
    LEG = '*Relationships drawn:* '
    for m, blk in reversed(list(zip(found, blocks))):
        body = blk.strip().split('\n'); leg = [l[len('%% legend: '):] for l in body if l.startswith('%% legend: ')]; body = [l for l in body if not l.startswith('%% legend: ')]
        rest = part[m.end():]
        if rest.startswith('\n\n' + LEG): rest = rest[rest.index('\n', 2):]   # the legend this script wrote last time
        part = part[:m.start()] + f"```{lang}\n" + '\n'.join(body) + "\n```" + (f"\n\n{LEG}{leg[0]}" if leg and leg[0] else '') + rest
    return text[:a] + part + text[b:]

def place(t, d):
    """The diagrams put into the spec's text — as place3.py did, without the SCXML block (E4 is checked by the suite)."""
    for i, v in enumerate(d['ledger'], 1):
        m = re.search(rf'^#### E9\.{i} .*$', t, re.M)
        if not m: raise ValueError(f"refused: no heading E9.{i} in the spec")
        head = f"#### E9.{i} {v['title']} — {v['n']} nodes, {v['e']} edges"
        t = put(t[:m.start()] + head + t[m.end():], head, [v['mm']])
    t = put(t, '#### E9.10 Catalog', [d['catalog']])
    t = put(t, "#### E9.11 Process and decision graphs' own schemas", [d['process_meta'], d['decisions_meta']])
    t = put(t, '### E3. The loan process', [d['process']])
    t = put(t, '### E7. The decision graph', [d['decisions']])
    return put(t, '### E4. The process exported to SCXML', [e4_scxml()], 'xml')

def main():
    old = open(SPEC, encoding='utf-8').read(); new = place(old, draw())
    if '--check' in sys.argv:
        same = new == old
        print(f"{'ok  ' if same else 'FAIL'} 14 diagrams and E4's SCXML in the spec {'match' if same else 'differ from'} a fresh drawing from {os.path.relpath(DATA, VAULT)}")
        return 0 if same else 1
    if new == old: print("unchanged — the spec's diagrams already match"); return 0
    bdir = os.path.expanduser('~/zzBackups/notes'); os.makedirs(bdir, exist_ok=True)
    shutil.copy2(SPEC, os.path.join(bdir, f"Graph spec model.md.{dt.datetime.now():%Y%m%d-%H%M}"))
    new = re.sub(r'^modified: .*$', f"modified: {dt.datetime.now():%Y-%m-%dT%H:%M}", new, count=1, flags=re.M)
    open(SPEC, 'w', encoding='utf-8').write(new); print("placed 14 diagrams and E4's SCXML"); return 0

if __name__ == '__main__': sys.exit(main())
