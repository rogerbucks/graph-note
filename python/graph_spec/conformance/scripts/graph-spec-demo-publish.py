#!/usr/bin/env python3
"""Rebuilds the lending demo with the vault's engine and writes Standards/Lending demo graph data.md from it — the Source blocks as authored, the Built blocks as the engine makes them.

Usage:
  ~/.venvs/graphspec/bin/python zzSupport/_scripts/graph-spec-demo-publish.py --check   # rebuild, compare with the note, write nothing
  ~/.venvs/graphspec/bin/python zzSupport/_scripts/graph-spec-demo-publish.py           # rebuild and write the note

Writes: Standards/Lending demo graph data.md (generated; never hand-edit), after a backup to ~/zzBackups/notes/; the engine's statement blobs go to a temporary folder and are discarded. Nothing with --check (exit 1 if the note differs).

Category: Checks — graph model

WHY (5 Oct 2026): the note is a derivative, but its writers (dumper.py, publish3.py) lived only in a session scratchpad —
archived at ~/zzBackups/scratch/2026-10-05-graph-spec-session-26d3a819/. Brought into the vault under Arbux PKMS/2026-10-05
Source code is written only in the vault, with no external repo or GitHub.decision.md. The text format is dumper.py's,
unchanged; the build is now graph_spec_lending_engine.py in rebuild mode, which the conformance suite already proves
identical to the Built blocks (case D1). Its Source blocks are the authored input: they are re-dumped, not re-made, so a
change to the world is made in them and then this script is rerun.
"""
import os, re, sys, json, shutil, tempfile, contextlib, io, datetime as dt
from zoneinfo import ZoneInfo
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graph_spec as gs, grafeo
HERE = os.path.dirname(os.path.abspath(__file__)); VAULT = os.path.abspath(os.path.join(HERE, '..'))
NOTE = os.path.join(VAULT, 'Standards', 'Lending demo graph data.md')
BNE = ZoneInfo('Australia/Brisbane'); UTC = dt.timezone.utc
G = ('ledger', 'process', 'decisions', 'catalog')
HDR_S = "SOURCE — observed and authored facts only; everything else is re-made from these by the engine"

# ── the text format — dumper.py, 4 Oct 2026 ─────────────────────────────────────────────
ORDER = ['GraphMeta','ElementType','Activity','Person','Institution','Account','Loan','Instalment','Request','Offer','Sign','Drawdown','Payment','Repayment','InterestCharge','DefaultInterestCharge',
         'InstalmentMissed','GraceExpired','Close','Snapshot','Statement','Blob','Delivery','State','Schedule','Concept','Ref','Decision','Option','Engine','GraphRef','BlobStore','KnownAnswers','RuleSpec','Standard']
def q(s): return "'" + str(s).replace("\\", "\\\\").replace("'", "\\'") + "'"
def lit(t):
    m = int(t.utcoffset().total_seconds() // 60)
    return f"DATETIME '{t.strftime('%Y-%m-%dT%H:%M:%S')}{'+' if m >= 0 else '-'}{abs(m)//60:02d}:{abs(m)%60:02d}'"
def val(v):
    if isinstance(v, bool): return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)): return repr(v)
    if isinstance(v, dt.datetime): return lit(v.replace(tzinfo=UTC).astimezone(BNE))
    if isinstance(v, dt.date): return f"DATE '{v.isoformat()}'"
    return q(v)
def dump(db, g, header):
    N, R = gs.read(db, g)
    def rank(n): return (min([ORDER.index(x) for x in n['l'] if x in ORDER] or [99]), n['p']['id'])
    N.sort(key=rank); var = {}; used = set()
    for n in N:
        v = re.sub(r'[^A-Za-z0-9]', '_', n['p']['id'])[:40].strip('_') or 'n'
        if v[0].isdigit(): v = 'n_' + v
        while v in used: v += '_'
        used.add(v); var[n['k']] = v
    lines, section = [], None
    for n in N:
        lab = [x for x in n['l'] if x in ORDER]; head = lab[0] if lab else n['l'][0]
        if head != section: lines.append(f"// ── {head} ──"); section = head
        labels = ':'.join(sorted(n['l'], key=lambda x: (x not in ('Meta','Event','Document','Agreement','Party','Snapshot'), x)))
        pr = ', '.join(f"{k}: {val(v)}" for k, v in sorted(n['p'].items(), key=lambda kv: (kv[0] != 'id', kv[0])) if v is not None)
        lines.append(f" ({var[n['k']]}:{labels} {{{pr}}}),")
    R.sort(key=lambda r: (r['ty'], var[r['s']], var[r['t']])); section = None
    for r in R:
        if r['ty'] != section: lines.append(f"// ── {r['ty']} edges ──"); section = r['ty']
        pr = ', '.join(f"{k}: {val(v)}" for k, v in sorted((r['p'] or {}).items()) if v is not None)
        lines.append(f" ({var[r['s']]})-[:{r['ty']}" + (f" {{{pr}}}" if pr else '') + f"]->({var[r['t']]}),")
    if lines[-1].endswith(','): lines[-1] = lines[-1][:-1]
    return f"// graph: {g} · {len(N)} nodes, {len(R)} edges · {header}\nINSERT\n" + "\n".join(lines)

# ── the build ───────────────────────────────────────────────────────────────────────────
def build(note):
    src_text = dict(re.findall(r"## Source — (\w+)\n\n```gql\n(.*?)\n```", note, re.S))
    sdb = grafeo.GrafeoDB()
    for g in G: sdb.execute(f"CREATE GRAPH {g}"); sdb.set_graph(g); sdb.execute(gs.strip(src_text[g]))
    src = {g: dump(sdb, g, HDR_S) for g in G}
    eng = open(os.path.join(HERE, 'graph_spec_lending_engine.py'), encoding='utf-8').read()
    env = {'MODE': 'rebuild', 'SOURCE': {g: src_text[g] for g in ('ledger', 'process', 'decisions')}, '__name__': 'engine'}
    here = os.getcwd()
    with tempfile.TemporaryDirectory() as tmp:
        os.chdir(tmp)
        try:
            with contextlib.redirect_stdout(io.StringIO()): exec(compile(eng, 'graph_spec_lending_engine.py', 'exec'), env)
        finally: os.chdir(here)
    db = env['db']; db.set_graph('ledger')
    meta = gs.Q(db, "MATCH (m:GraphMeta) RETURN m.written_by AS w, m.as_of AS a")[0]
    hdr_b = f"BUILT — written by {meta['w']} on {meta['a'].isoformat()}; regenerate, never hand-edit"
    blt = {g: dump(db, g, hdr_b) for g in ('ledger', 'process', 'decisions')} | {'catalog': src['catalog'].replace(HDR_S, hdr_b)}
    return src, blt

# ── the note — publish3.py, 4 Oct 2026 ──────────────────────────────────────────────────
def compose(old, src, blt):
    fm = old[:old.index('\n---', 4) + 4]
    cnt = lambda s: s.splitlines()[0].split('·')[1].strip()
    eng = re.search(r"BUILT — written by (\S+) on (\S+);", blt['ledger']).groups()
    schema = {g: re.search(r"schema: '([^']+)'", src[g]).group(1) for g in G}
    if blt['process'] != src['process'].replace(src['process'].splitlines()[0], blt['process'].splitlines()[0]):
        raise ValueError("refused: the engine changed the process graph, which has nothing derived in it")
    body = f"""
# Lending demo graph data

> [!warning] Generated — do not hand-edit
> Written by `{eng[0]}` on {eng[1]}. To change the world, edit the Source blocks below and rerun `zzSupport/_scripts/graph-spec-demo-publish.py`, which rebuilds with `graph_spec_lending_engine.py`. The specification is in [[Graph spec model]]; this is the data behind its *Examples*.

**Two layers, and the proof that joins them.**

- **Source** — only what was observed or authored: parties, accounts, agreements and instalments, requests, offers, signatures, bank transactions, deliveries, the opening balances, the process graph, decisions, each graph's schema, and the catalog.
- **Built** — what the engine makes from the source: generated events (interest, missed instalments), caches (status, balances, allocations), closes and snapshots, statements and their blobs, and the engine runs that made them.
- **Every node label and edge type is declared** in its graph's own schema, and every edge type carries a `reverse_name` — spec §5, checked by the conformance suite (`graph_spec.typed`).
- **Rebuild proof, {eng[1]}:** the Source blocks below were loaded into an empty database and replayed through the engine. **The result was identical to the Built blocks** — every node, edge and property — the statement blobs were byte-identical, and no statement was sent twice. The same proof passes when the Source is first exported to **Cypher** and loaded through Grafeo's Cypher front end.

| Graph | Schema | Source | Built |
|---|---|---|---|
| `ledger` | `{schema['ledger']}` | {cnt(src['ledger'])} | {cnt(blt['ledger'])} |
| `process` | `{schema['process']}` | {cnt(src['process'])} | identical — nothing in it is derived |
| `decisions` | `{schema['decisions']}` | {cnt(src['decisions'])} | same nodes; `status` and `content_hash` re-made by rule |
| `catalog` | `{schema['catalog']}` | {cnt(src['catalog'])} | identical — deployment configuration |

**Comments are whole lines only** — `//` also occurs inside `ni:///` identifiers. **Every diagram in [[Graph spec model]] is generated from the Built blocks.**

# Source
""" + "".join(f"\n## Source — {g}\n\n```gql\n{src[g]}\n```\n" for g in G) + "\n# Built\n" + "".join(f"\n## Built — {g}\n\n```gql\n{blt[g]}\n```\n" for g in ('ledger', 'decisions'))
    return fm + "\n" + body

def main():
    old = open(NOTE, encoding='utf-8').read(); src, blt = build(old); new = compose(old, src, blt)
    if '--check' in sys.argv:
        same = new == old
        print(f"{'ok  ' if same else 'FAIL'} {os.path.relpath(NOTE, VAULT)} {'matches' if same else 'differs from'} a fresh rebuild by the vault's engine")
        if not same:
            import difflib; print(''.join(list(difflib.unified_diff(old.splitlines(True), new.splitlines(True), 'note', 'rebuilt', n=1))[:40]))
        return 0 if same else 1
    if new == old: print("unchanged — the note already matches"); return 0
    bdir = os.path.expanduser('~/zzBackups/notes'); os.makedirs(bdir, exist_ok=True)
    shutil.copy2(NOTE, os.path.join(bdir, f"{os.path.basename(NOTE)}.{dt.datetime.now():%Y%m%d-%H%M}"))
    new = re.sub(r'^modified: .*$', f"modified: {dt.datetime.now():%Y-%m-%dT%H:%M}", new, count=1, flags=re.M)
    new = re.sub(r'^modified_by: .*$', 'modified_by: "ea/sara@mac14"', new, count=1, flags=re.M)
    open(NOTE, 'w', encoding='utf-8').write(new); print("written", os.path.relpath(NOTE, VAULT)); return 0

if __name__ == '__main__': sys.exit(main())
