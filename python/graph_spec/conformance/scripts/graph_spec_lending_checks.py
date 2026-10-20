#!/usr/bin/env python3
"""Checks the lending demo's engine feature by feature — postings, schedules, closes, known answers, statements and provenance — on what the engine rebuilt.

Usage:
  ~/.venvs/graphspec/bin/python zzSupport/_scripts/graph_spec_conformance.py   # the runner calls checks() for the lending-demo case

Writes: nothing (read-only).

Category: Checks — graph model

WHY (5 Oct 2026): Roger agreed to check the demo engine's features one by one, not only through the
rebuild digest. Each check reads the rebuilt graph and the stored document bytes — never the engine's
own code — so a break says which feature broke. The expected figures are data in the case
(Standards/Lending demo test — rebuild from source.md); this module holds the rules of the domain only.
"""
import hashlib, base64, re, datetime as dt
from zoneinfo import ZoneInfo
UTC = dt.timezone.utc
SIGN = {'Drawdown': 1, 'InterestCharge': 1, 'DefaultInterestCharge': 1, 'Repayment': -1}
CASH = ('Drawdown', 'Repayment', 'Payment')

def _q(db, g, q): db.set_graph(g); return list(db.execute_cypher(q))
def _local(t, tz): return t.replace(tzinfo=UTC).astimezone(ZoneInfo(tz))
def _kind(labels): return next((l for l in labels if l in SIGN or l in CASH), None)

def checks(env, expect):
    db, out = env['db'], []
    def check(label, ok, detail=''): out.append((label, bool(ok), detail))
    tag = lambda t: f"[{t}] " if t else ''
    loans = {r['id']: r for r in _q(db, 'ledger', "MATCH (l:Loan) RETURN l.id AS id, l.balance_cents AS bal, l.status AS st, l.cache_through AS ct, l.tz AS tz, l.grace_days AS gd")}
    tx = _q(db, 'ledger', "MATCH (t:Transaction)-[:APPLIES_TO]->(l:Loan) RETURN t.id AS id, labels(t) AS lb, t.amount_cents AS a, t.at AS at, t.value_date AS v, l.id AS loan")
    t_ = expect.get('tests', {})
    # posting — every cached loan value equals a replay of its transactions (§11)
    bad = []
    for lid, L in loans.items():
        mine = sorted((t for t in tx if t['loan'] == lid), key=lambda t: (t['at'], t['id']))
        bal = sum(SIGN.get(_kind(t['lb']), 0) * t['a'] for t in mine)
        drawn = any(_kind(t['lb']) == 'Drawdown' for t in mine)
        st = 'repaid' if drawn and bal == 0 else L['st']
        if (bal, mine[-1]['id'] if mine else None, st) != (L['bal'], L['ct'], L['st']): bad.append((lid, bal, L['bal'], mine[-1]['id'] if mine else None, L['ct']))
    check(f"{tag(t_.get('posting'))}posting: every loan's cached balance, status and cache-through equal a replay of its transactions", not bad, str(bad))
    legs = {}
    for r in _q(db, 'ledger', "MATCH (t:Transaction)-[:FROM_ACCOUNT]->(a) RETURN t.id AS t, a.id AS a"): legs.setdefault(r['t'], {}).setdefault('from', []).append(r['a'])
    for r in _q(db, 'ledger', "MATCH (t:Transaction)-[:TO_ACCOUNT]->(a) RETURN t.id AS t, a.id AS a"): legs.setdefault(r['t'], {}).setdefault('to', []).append(r['a'])
    every = _q(db, 'ledger', "MATCH (t:Transaction) RETURN t.id AS id, labels(t) AS lb")
    bad = [t['id'] for t in every if (_kind(t['lb']) in CASH) != (len(legs.get(t['id'], {}).get('from', [])) == 1 and len(legs.get(t['id'], {}).get('to', [])) == 1)
           or (_kind(t['lb']) not in CASH and t['id'] in legs)]
    check(f"{tag(t_.get('posting'))}posting: every cash transaction moves money from exactly one account to exactly one other; interest moves none", not bad, str(bad))
    # scheduler — times and dates in the right zone (§9)
    sched = {r['id']: r for r in _q(db, 'process', "MATCH (s:Schedule) RETURN s.id AS id, s.runs AS runs, s.tz AS tz")}
    daily = sched.get('schedule/arrears-check'); hh, mm = map(int, re.search(r"(\d\d):(\d\d)", daily['runs']).groups())
    bad = []
    for t in tx:
        if _kind(t['lb']) in ('InterestCharge', 'DefaultInterestCharge') and t['v'] is not None and ':payout:' not in t['id']:
            loc = _local(t['at'], loans[t['loan']]['tz']); last = (t['v'].replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)
            if not (loc.date() == t['v'] == last and loc.time() == dt.time(23, 59, 59)): bad.append((t['id'], str(loc)))
    check(f"{tag(t_.get('scheduler'))}scheduler: every month-end interest charge falls at 23:59:59 on the last day of the month, in the loan's own zone", not bad, str(bad))
    inst = {r['id']: r for r in _q(db, 'ledger', "MATCH (l:Loan)-[:SCHEDULES]->(i:Instalment) RETURN i.id AS id, i.due_date AS due, l.id AS loan")}
    bad = []
    for e in _q(db, 'ledger', "MATCH (e)-[:APPLIES_TO]->(l:Loan) WHERE e:InstalmentMissed OR e:GraceExpired RETURN e.id AS id, labels(e) AS lb, e.at AS at, l.id AS loan"):
        i = inst[e['loan'] + '/' + e['id'].split('/')[-1]]; loc = _local(e['at'], daily['tz'])
        want = i['due'] + dt.timedelta(days=1 if 'InstalmentMissed' in e['lb'] else loans[e['loan']]['gd'] + 1)
        if not (loc.time() == dt.time(hh, mm) and loc.date() == want): bad.append((e['id'], str(loc), str(want)))
    check(f"{tag(t_.get('scheduler'))}scheduler: every missed instalment and grace expiry is raised by the {daily['runs']} {daily['tz']} check, on the right day", not bad, str(bad))
    # close proofs — snapshots recompute; archived decisions unchanged
    closes = {r['s']: r for r in _q(db, 'ledger', "MATCH (c:Close)-[:PRODUCED]->(s:Snapshot) RETURN s.id AS s, c.as_of AS asof, c.id AS c")}
    snaps = _q(db, 'ledger', "MATCH (s:Snapshot)-[:OF]->(x) RETURN s.id AS s, labels(s) AS lb, s.balance_cents AS b, x.id AS of")
    opening = {r['of']: r['b'] for r in snaps if r['s'].startswith('snap:2026-08/') and 'AccountBalance' in r['lb']}
    cash = _q(db, 'ledger', "MATCH (t:Transaction) RETURN t.id AS id, t.amount_cents AS a, t.at AS at")
    bad = []
    for s in snaps:
        if s['s'].startswith('snap:2026-08/'): continue
        asof = closes[s['s']]['asof']
        if 'LoanBalance' in s['lb']: want = sum(SIGN.get(_kind(t['lb']), 0) * t['a'] for t in tx if t['loan'] == s['of'] and t['at'] <= asof)
        else: want = opening.get(s['of'], 0) + sum(c['a'] * ((s['of'] in legs.get(c['id'], {}).get('to', [])) - (s['of'] in legs.get(c['id'], {}).get('from', []))) for c in cash if c['at'] <= asof)
        if want != s['b']: bad.append((s['s'], s['b'], want))
    check(f"{tag(t_.get('closes'))}close proofs: every one of {len([s for s in snaps if not s['s'].startswith('snap:2026-08/')])} snapshots recomputes from the transactions up to its close", not bad, str(bad))
    bad = [r['id'] for r in _q(env.get('built_db', db), 'decisions', "MATCH (d:Decision) RETURN d.id AS id, d.title AS t, d.statement AS s, d.rationale AS r, d.content_hash AS h")   # the published graph — an engine recomputes its own
           if 'sha-256-64:' + hashlib.sha256('|'.join([r['t'], r['s'], r['r']]).encode()).hexdigest()[:16] != r['h']]
    check(f"{tag(t_.get('closes'))}close proofs: every decision's content hash still matches its text", not bad, str(bad))
    # known answers, one by one
    kn = _q(db, 'catalog', f"MATCH (k:KnownAnswers {{id: '{expect['known_answers']}'}}) RETURN k.figures AS f")[0]['f'] if expect.get('known_answers') else ''
    for f in expect.get('figures') or []:
        g, rows = f.get('graph', 'ledger'), None
        rows = _q(db, g, f"MATCH (x {{id: '{f['element']}'}}) RETURN x.{f['property']} AS v")
        got = rows[0]['v'] if rows else None
        check(f"{tag(f.get('test'))}known answer — {f['figure']}: {f['value'] / 100:,.2f}", got == f['value'] and (not kn or f"{f['value'] / 100:.2f}" in kn), f"got {got}; catalog says: {kn[:80]}")
    # statements — bytes hash to their names; every statement has both blobs; deliveries well-formed
    blobs, store = _q(db, 'ledger', "MATCH (b:Blob) RETURN b.id AS id, b.sha256 AS h, b.bytes AS n"), env.get('_blobs', {})
    ni = lambda h: "ni:///sha-256;" + base64.urlsafe_b64encode(bytes.fromhex(h)).decode().rstrip("=")
    bad = [b['id'] for b in blobs if b['h'] not in store or hashlib.sha256(store[b['h']]).hexdigest() != b['h'] or len(store[b['h']]) != b['n'] or ni(b['h']) != b['id']]
    check(f"{tag(t_.get('statements'))}statements: every one of {len(blobs)} stored documents' bytes hash to its name (RFC 6920 ni: URI)", not bad, str(bad))
    pay = {r['s']: r['n'] for r in _q(db, 'ledger', "MATCH (s:Statement)-[:HAS_PAYLOAD]->(b:Blob) RETURN s.id AS s, count(b) AS n")}
    ren = {r['s']: r['n'] for r in _q(db, 'ledger', "MATCH (s:Statement)-[:HAS_RENDITION]->(b:Blob) RETURN s.id AS s, count(b) AS n")}
    sts = [r['s'] for r in _q(db, 'ledger', "MATCH (s:Statement) RETURN s.id AS s")]
    check(f"{tag(t_.get('statements'))}statements: every one of {len(sts)} statements keeps exactly one payload and one rendition", all(pay.get(s) == 1 and ren.get(s) == 1 for s in sts), str({s: (pay.get(s), ren.get(s)) for s in sts if (pay.get(s), ren.get(s)) != (1, 1)}))
    import json, rfc8785   # RFC 8785 — a payload's bytes are exactly the canonical JSON of what they say
    pays = [r['h'] for r in _q(db, 'ledger', "MATCH (:Statement)-[:HAS_PAYLOAD]->(b:Blob) RETURN b.sha256 AS h")]
    canon = lambda b: rfc8785.dumps(json.loads(b)) == b
    bad = [h for h in pays if h not in store or not canon(store[h])]
    sharp = all(not canon(json.dumps(json.loads(store[h]), indent=1).encode()) for h in pays if h in store)   # the test can tell: a re-indented copy is not canonical
    check(f"{tag(t_.get('canonical'))}statements: every one of {len(pays)} payloads is canonical JSON (RFC 8785), checked with the reference library", not bad and sharp and pays, str(bad))
    dl = _q(db, 'ledger', "MATCH (d:Delivery) RETURN d.id AS id, d.message_id AS m")
    bad = [d['id'] for d in dl if not re.fullmatch(r"<[^<>@\s]+@[^<>@\s]+>", d['m'] or '')]
    check(f"{tag(t_.get('statements'))}statements: every one of {len(dl)} deliveries carries an RFC 5322 Message-ID", not bad, str(bad))
    # provenance — everything the engine made names the run that made it (PROV-O)
    made = {r['id'] for r in _q(db, 'ledger', "MATCH (x) WHERE x.engine IS NOT NULL AND NOT x:Activity RETURN x.id AS id")}
    gen = {r['id'] for r in _q(db, 'ledger', "MATCH (x)-[:WAS_GENERATED_BY]->(:Activity) RETURN DISTINCT x.id AS id")}
    check(f"{tag(t_.get('provenance'))}provenance: every one of {len(made)} elements the engine made names the run that made it (PROV-O)", made <= gen, str(sorted(made - gen)[:3]))
    return out
