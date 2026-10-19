#!/usr/bin/env python3
"""Checks every document in the vault that holds a GQL graph — reads each data block with the portable reader (no database), runs the graph spec's rules, writes a report note and a status shard.

Usage:
  python3 zzSupport/_scripts/graph_spec_check_docs.py            # check, write the report and the status shard
  python3 zzSupport/_scripts/graph_spec_check_docs.py --check    # check and print; write nothing; exit 1 if any document fails
  python3 zzSupport/_scripts/graph_spec_check_docs.py --if-changed            # the Stop hook: run only if a graph document changed since the report, or it is 12 h old
  python3 zzSupport/_scripts/graph_spec_check_docs.py --file "Standards/X.md"  # one document, with the vault's shared schemas; writes nothing (the graph-check mod)

Writes: Standards/Graph documents — check report.md (generated; never hand-edit) and the status shard graph-spec-docs (via status-emit.sh); nothing with --check or --file, nor with --if-changed when nothing changed.

Category: Checks — graph model

WHY (5 Oct 2026): phase 5 of Standards/Graph spec portable checker.aiplan.md — checking runs centrally as well as on each system
(Roger: "all of those"). Standard library only (gql_profile.py, graph_rules.py), so it runs under macOS's own Python too.
A document is read block by block, in order. A block that finds a node another document wrote ("MATCH finds no …") is
reported as depending on that document — it is checked with it, in its conformance case — not as a failure. Query blocks are
skipped (they need an engine); change sets are counted, not applied (they are proposals; graph-spec-changeset.py dry-runs them).
Scans the vault only — never the sealed folders, which are outside it.
6 Oct 2026 (Roger chose "mod + Stop hook"): --file serves the graph-check mod, which warns the moment Claude writes a graph
document; --if-changed serves the Stop hook, which keeps the vault-wide report current and catches edits made in Obsidian.
The 12-hour floor keeps the 24-hour dashboard cadence honest when no graph document changes for a day.
6 Oct 2026, later: a graph that declares completeness rules (§25) gets its completeness report printed under --file —
reported, never failed, each gap named by the thing's own words, with its fix.
"""
import os, re, sys, subprocess, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import gql_profile as gp, graph_rules as gr
VAULT = os.path.abspath(os.path.join(HERE, '..')); REPORT = os.path.join(VAULT, 'Standards', 'Graph documents — check report.md')
SKIP = {'.trash', '.obsidian', 'node_modules', '.git', '.venv'}

def documents():
    """(path, blocks, is a test document) for every live note with a GQL block — a historical note records what was true then, and is skipped."""
    for root, dirs, files in os.walk(VAULT):
        dirs[:] = sorted(d for d in dirs if d not in SKIP)
        for f in sorted(files):
            if f.endswith('.md') and os.path.join(root, f) != REPORT:
                p = os.path.join(root, f); t = open(p, encoding='utf-8', errors='replace').read()
                bs = re.findall(r"```gql\n(.*?)\n```", t, re.S)
                if bs and not re.search(r"^status:\s*(historical|superseded)\s*$", t, re.M):
                    yield os.path.relpath(p, VAULT), bs, bool(re.search(r"^tags: \[[^\]]*\btest\b", t, re.M))

def schema_blocks(docs):
    """Every shared schema in the vault (§5) — blocks marked SCHEMA <name> — so a graph that names one can be typed."""
    out = []
    for _, bs, _ in docs:
        for b in bs:
            try:
                if gp.header(b)[1] == 'schema': out.append(b)
            except gp.ProfileError: pass
    return out
def check_one(blocks, matrix, is_test=True, schemas=()):
    """{'graphs', 'failed': [(graph, rule)], 'depends': [why], 'outside': [why], 'queries', 'changesets'}"""
    def fresh():
        s = gp.Store()
        for sb in schemas: s.apply(sb)
        return s
    st = fresh(); stores = [st]; out = {'graphs': [], 'failed': [], 'depends': [], 'outside': [], 'queries': 0, 'changesets': 0, 'unnamed': 0, 'illustrations': 0}
    for b in blocks:
        try: g, kind = gp.header(b)
        except gp.ProfileError:
            if is_test: out['unnamed'] += 1
            else: out['illustrations'] += 1   # a design note's example with no graph line — reported, not failed
            continue
        if kind == 'excerpt': out['illustrations'] += 1; continue
        if kind == 'query': out['queries'] += 1; continue
        if kind == 'schema': out.setdefault('schemas', 0); out['schemas'] += 1; continue   # loaded for every document already
        if re.search(r"·\s*document \S+", b.splitlines()[0]) and st.graphs.keys() - {'schema ' + n for n in st.schemas}: st = fresh(); stores.append(st)   # another document's graph, shown alongside — checked on its own
        if kind == 'changeset': out['changesets'] += 1; continue
        if re.search(r"·\s*BUILT\b", b.splitlines()[0]): st.graphs.pop(g, None)   # a built version replaces the source it was made from (§6)
        try: st.apply(b)
        except gp.ProfileError as e:
            (out['depends'] if 'MATCH finds no' in e.message else out['outside']).append(f"graph {g}: {e.message}")
    if out['depends']: return out   # it builds on another document — checked with it, in its conformance case
    for st in stores:
        check_store(st, matrix, out)
    return out
def check_store(st, matrix, out):
    w = gr.World.from_store(st)
    for g in sorted(w.graphs):
        G = w[g]
        if not G.labelled('ElementType') and w.named.get(g) and w.schema_for(g)[1] is None:   # §5: its header names a schema, and none was found
            out.setdefault('elsewhere', []).append(g); continue
        if gr.is_draft(w, g): out.setdefault('drafts', []).append(g)   # §5: no schema at all — a draft, checked with types worked out from the data
        out['graphs'].append(g)
        try: res = gr.check(w, g, matrix)
        except Exception as e: res = [(f"the rules could not run — {type(e).__name__}: {e}", False, '')]
        out['failed'] += [(g, l) for l, ok, _ in res if not ok]
        if G.labelled('Cardinality') or G.labelled('Coverage'): out.setdefault('completeness', {})[g] = (gr.completeness(G), G)   # §25: reported, never failed
    return out
def completeness_lines(rep, G=None, limit=12):
    """§25 — the completeness report in plain lines: one per rule, then each gap with its fix."""
    lines = []
    def named(i):   # a thing named by what it says, not only its id
        t = next((str(G.p(i)[k]) for k in ('title', 'text', 'name', 'statement') if G is not None and G.p(i).get(k)), '')
        return f"{i} ({t[:60] + ('…' if len(t) > 60 else '')})" if t else i
    for r in rep['rules']:
        if r['malformed']: lines.append(f"  ✗ {r['rule']}: malformed — {r['malformed']}"); continue
        what = 'pairings' if r['kind'] == 'coverage' else 'things'
        parts = [f"{r['met']} of {r['counted']} {what} met"] + ([f"{r['excused']} excused"] if r['excused'] else []) + \
                ([f"{len(r['deferred'])} parked"] if r['deferred'] else []) + ([f"{len(r['overdue'])} overdue"] if r['overdue'] else []) + ([f"{len(r['missing'])} missing"] if r['missing'] else [])
        lines.append(f"  {'✓' if not (r['missing'] or r['overdue']) else '·'} {r['rule']} — {r['says']}: " + ', '.join(parts))
        for m in r['missing'][:limit]: lines.append(f"      missing {named(m['at']) if r['kind'] == 'cardinality' else m['at']} — {m['fix']}")
        for o in r['overdue'][:limit]: lines.append(f"      overdue {named(o) if r['kind'] == 'cardinality' else o} — revisit it, or move its revisit_by date")
        if len(r['missing']) > limit: lines.append(f"      … and {len(r['missing']) - limit} more")
    for d in rep['deferred_malformed']: lines.append(f"  ✗ {d['at']}: a Deferred must say what is needed and why it waits — {d['fix']}")
    return lines

def changed_since_report(floor_hours=12):
    """Whether the report is due: missing, older than the floor, or older than some live note holding a GQL block. Reads only notes newer than the report."""
    if not os.path.exists(REPORT): return 'no report yet'
    since = os.path.getmtime(REPORT)
    if dt.datetime.now().timestamp() - since > floor_hours * 3600: return f"report older than {floor_hours} h"
    for root, dirs, files in os.walk(VAULT):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for f in files:
            p = os.path.join(root, f)
            if f.endswith('.md') and p != REPORT and os.path.getmtime(p) > since and '```gql' in open(p, encoding='utf-8', errors='replace').read():
                return os.path.relpath(p, VAULT)
    return None

def check_file(rel):
    """One document, checked as the report would check it — the vault's shared schemas loaded first. Exit 1 only if it fails."""
    import graph_spec as gs
    p = rel if os.path.isabs(rel) else os.path.join(VAULT, rel)
    t = open(p, encoding='utf-8', errors='replace').read(); bs = re.findall(r"```gql\n(.*?)\n```", t, re.S)
    if not bs or re.search(r"^status:\s*(historical|superseded)\s*$", t, re.M): print('no live graph'); return 0
    r = check_one(bs, gs.destination_matrix(), bool(re.search(r"^tags: \[[^\]]*\btest\b", t, re.M)), schema_blocks(list(documents())))
    if r['failed'] or r['outside'] or r['unnamed']:
        print(f"FAILS — {len(r['failed']) + len(r['outside']) + (1 if r['unnamed'] else 0)} problem(s)" + ''.join(f"\n  {g}: {l}" for g, l in r['failed'][:8]) + ''.join(f"\n  {x}" for x in r['outside'][:8]) + (f"\n  {r['unnamed']} block(s) name no graph" if r['unnamed'] else ''))
        return 1
    if r['depends']: print(f"depends on another document — checked with it in its conformance case ({r['depends'][0]})"); return 0
    if r.get('elsewhere'): print(f"passes, but {', '.join(r['elsewhere'])} name(s) a schema no schema document declares (§5) — cannot be typed"); return 0
    d = r.get('drafts') or []
    print(f"passes — {len(r['graphs'])} graph(s): {', '.join(r['graphs'])}" + (f" · draft: {', '.join(d)} (no schema yet — say \"Lock the graph\" when it is settled)" if d else ''))
    for g, (rep, G) in (r.get('completeness') or {}).items(): print(f"completeness of {g} (§25 — reported, never failed):", *completeness_lines(rep, G), sep='\n')
    return 0

def main():
    if '--file' in sys.argv: return check_file(sys.argv[sys.argv.index('--file') + 1])
    if '--if-changed' in sys.argv:
        why = changed_since_report()
        if not why: return 0
    check_only = '--check' in sys.argv
    import graph_spec as gs
    matrix = gs.destination_matrix()
    docs = list(documents()); schemas = schema_blocks(docs)
    results = {p: check_one(bs, matrix, t, schemas) for p, bs, t in docs}
    bad = {p: r for p, r in results.items() if r['failed'] or r['outside'] or r['unnamed']}
    dep = {p: r for p, r in results.items() if r['depends'] and p not in bad}
    away = {p: r for p, r in results.items() if r.get('elsewhere') and p not in bad and p not in dep}
    for p, r in results.items():
        mark = 'FAIL' if p in bad else 'dep ' if p in dep else 'away' if p in away else 'ok  '
        print(f"{mark} {p} — {len(r['graphs'])} graphs" + ''.join(f"\n     {g}: {l}" for g, l in r['failed']) + ''.join(f"\n     {x}" for x in r['outside']) + (f"\n     {r['unnamed']} block(s) name no graph" if r['unnamed'] else ''))
    print(f"{len(results)} documents · {len(bad)} failing · {len(dep)} depend on another document · {len(away)} keep their schema outside the graph")
    if check_only: return 1 if bad else 0
    now = dt.datetime.now().strftime('%Y-%m-%dT%H:%M')
    old = open(REPORT, encoding='utf-8').read() if os.path.exists(REPORT) else ''
    m = re.search(r'^uuid: "([^"]+)"', old, re.M); u = m.group(1) if m else __import__('uuid').uuid4()
    created = (re.search(r"^created: (\S+)", old, re.M) or [None, now])[1]
    link = lambda p: f"[[{os.path.splitext(p)[0].split('/')[-1]}]]"
    rows = [f"| {link(p)} | {'❌ fails' if p in bad else '↪ depends on another document' if p in dep else '⚠️ schema not in the graph (§5)' if p in away else '✅ passes'} | {', '.join(r['graphs']) or '—'} | "
            + ('; '.join([f'{g}: {l}' for g, l in r['failed']] + r['outside'] + ([f"{r['unnamed']} block(s) name no graph"] if r['unnamed'] else []) + r['depends'][:1]) or '—').replace('|', '/')[:300]
            + f" | {r['queries']} | {r['changesets']} |" for p, r in results.items()]
    open(REPORT, 'w', encoding='utf-8').write(f'''---
uuid: "{u}"
created: {created}
modified: {now}
modified_by: "ea/sara@mac14"
status: active
classification: Public
tags: [graph-model, report]
human_reviewed: false
---

# Graph documents — check report

> [!warning] Generated by `zzSupport/_scripts/graph_spec_check_docs.py` — do not hand-edit
> Every document in the vault that holds a GQL graph, read with the portable reader (no database) and checked against [[Graph spec model]]'s rules. A document that builds on nodes another document wrote is checked with it, in its conformance case ([[Graph spec conformance suite]]).

**{len(results)} documents · {len(bad)} failing · {len(dep)} depend on another document · {len(away)} keep their schema outside the graph** — checked {now}.

| Document | Result | Graphs | What failed, or what it depends on | Queries | Change sets |
|---|---|---|---|---|---|
''' + '\n'.join(rows) + '\n')
    subprocess.run(['bash', os.path.join(HERE, 'status-emit.sh'), '--job', 'graph-spec-docs', '--finish', 'failed' if bad else 'ok', '--every', '24',
                    '--detail', f"{len(results)} documents, {len(bad)} failing", '--stat', f"documents={len(results)}", '--stat', f"failing={len(bad)}"], check=False)
    print('written', os.path.relpath(REPORT, VAULT)); return 0

if __name__ == '__main__': sys.exit(main())
