#!/usr/bin/env python3
"""Runs the lending demo's engine (v0.3) — rebuilding every derived element of the demo's graphs from their source data, or running the clock forward.

Usage:
  ~/.venvs/graphspec/bin/python zzSupport/_scripts/graph_spec_conformance.py   # runs this engine in rebuild mode, in a temporary folder

Writes: blobs/sha256/<hash> — the issued statements' bytes — under the current working directory; the conformance runner points that at a temporary folder. Nothing else.

Category: Checks — graph model

WHY (4 Oct 2026): the Graph spec model's E8 proof — source plus engine re-creates everything else —
needs the engine itself in the vault, so the conformance suite (spec §17) can run it. Executed, not
imported: set MODE = 'rebuild' and SOURCE = {graph: GQL text} in the globals, then exec this file.
'forward' mode reads the session's original inputs and is kept only as the record of how the demo was built.
Needs Grafeo 0.5.43 in ~/.venvs/graphspec.
"""
import grafeo, re, json, hashlib, pathlib, base64, calendar, heapq, datetime as dt, sys
from zoneinfo import ZoneInfo
UTC = dt.timezone.utc; BNE = ZoneInfo('Australia/Brisbane'); SYD = ZoneInfo('Australia/Sydney')
MODE = globals().get('MODE', 'forward'); ROUNDING = globals().get('ROUNDING', 'per-month')
ENGINE_V = 'engine:mac14@0.3'
db = grafeo.GrafeoDB()
for g in ('ledger', 'process', 'decisions', 'catalog'): db.execute(f"CREATE GRAPH {g}")
def strip(src): return "\n".join(l for l in src.splitlines() if not l.strip().startswith("//"))
def G(g, s): db.set_graph(g); return list(db.execute(s))
def lit(t):
    m = int(t.utcoffset().total_seconds() // 60)
    return f"DATETIME '{t.strftime('%Y-%m-%dT%H:%M:%S')}{'+' if m >= 0 else '-'}{abs(m)//60:02d}:{abs(m)%60:02d}'"
def aware(x): return x.replace(tzinfo=UTC)
def q(s): return "'" + str(s).replace("\\", "\\\\").replace("'", "\\'") + "'"
canon = lambda o: json.dumps(o, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
def ni(h): return "ni:///sha-256;" + base64.urlsafe_b64encode(bytes.fromhex(h)).decode().rstrip("=")
SIGN = {'Drawdown': 1, 'InterestCharge': 1, 'DefaultInterestCharge': 1, 'Repayment': -1}
GENERATED = {'InterestCharge', 'DefaultInterestCharge', 'InstalmentMissed', 'GraceExpired'}
# ── load ─────────────────────────────────────────────────────────────────
if MODE == 'forward':
    base = open('ledger3.gql').read().replace("amount_cents: 16000, note:'balance plus interest'", "amount_cents: 0, amount_rule:'payout', note:'the balance on the day'")
    G("ledger", strip(base)); G("process", strip(open('process2.gql').read())); G("decisions", strip(open('decisions2.gql').read()))
    # keep only what is source: drop the September interest and close made by engine 0.1; reset caches
    G("ledger", "MATCH (t:Transaction {id:'T7'}) DETACH DELETE t")
    G("ledger", "MATCH (c:Close {id:'close:2026-09'})-[:PRODUCED]->(s:Snapshot) DETACH DELETE s")
    G("ledger", "MATCH (c:Close {id:'close:2026-09'}) DETACH DELETE c")
    G("ledger", "MATCH (c:Close {id:'close:2026-08'}) SET c.origin = 'source', c.note = 'opening balances carried in'")
    G("ledger", "MATCH (l:Loan) SET l.status = 'new', l.balance_cents = 0, l.cache_through = NULL")
    G("decisions", "MATCH (d:Decision) SET d.status = NULL")
else:
    for g in ('ledger', 'process', 'decisions'): G(g, strip(SOURCE[g]))
T = G("process", "MATCH (a:State)-[t:TRANSITION]->(b:State) RETURN a.id AS src, t.event AS ev, t.guard AS g, t.do AS act, b.id AS dst")
ALERTS, LOG = [], []
def loan(lid): return G("ledger", f"MATCH (l:Loan {{id:{q(lid)}}}) RETURN l.status AS st, l.balance_cents AS bal, l.tz AS tz, l.rate_pa AS r, l.default_rate_pa AS dr, l.grace_days AS gd")[0]
def insts(lid): return sorted((r['due'], r['amt'], r['id'], r['rule']) for r in G("ledger", f"MATCH (:Loan {{id:{q(lid)}}})-[:SCHEDULES]->(i:Instalment) RETURN i.due_date AS due, i.amount_cents AS amt, i.id AS id, i.amount_rule AS rule"))
def charges_due(lid): return sorted((r['due'], r['a'], r['id']) for r in G("ledger", f"MATCH (t:DefaultInterestCharge)-[:APPLIES_TO]->(:Loan {{id:{q(lid)}}}) RETURN t.due_date AS due, t.amount_cents AS a, t.id AS id"))
def repaid_through(lid, until, exclude=None):
    return sum(r['a'] for r in G("ledger", f"MATCH (t:Repayment)-[:APPLIES_TO]->(:Loan {{id:{q(lid)}}}) RETURN t.id AS id, t.at AS at, t.amount_cents AS a") if aware(r['at']) <= until and r['id'] != exclude)
def due_before(lid, today): return sum(a for d, a, _, rule in insts(lid) if d < today and rule != 'payout') + sum(a for d, a, _ in charges_due(lid) if d < today)
def step(state, ev, bal, clr):
    opts = [t for t in T if t['src'] == state and t['ev'] == ev]
    for t in opts:
        g = t['g']
        if g is None or (g == 'balance_after > 0' and bal > 0) or (g == 'balance_after = 0' and bal == 0) or (g == 'balance_after > 0 and arrears_cleared' and bal > 0 and clr): return t
    for t in opts:
        if t['g'] == 'else': return t
    raise ValueError(f"illegal move: {ev} while {state}")
def activity(kind, key, at):
    aid = f"run:{kind}:{key}"
    if not G("ledger", f"MATCH (a:Activity {{id:{q(aid)}}}) RETURN a.id AS i"):
        G("ledger", f"INSERT (:Activity {{id:{q(aid)}, kind:{q(kind)}, started_at: {lit(at)}, engine:{q(ENGINE_V)}}})")
    return aid
def generated_by(nid_, aid): G("ledger", f"MATCH (x {{id:{q(nid_)}}}), (a:Activity {{id:{q(aid)}}}) INSERT (x)-[:WAS_GENERATED_BY]->(a)")
def allocate(lid, at, amount):
    paid = {r['id']: r['p'] or 0 for r in G("ledger", f"MATCH (x)<-[a:ALLOCATED]-(:Repayment)-[:APPLIES_TO]->(:Loan {{id:{q(lid)}}}) RETURN x.id AS id, sum(a.cents) AS p")}
    items = [(d, 0, a, i) for d, a, i in charges_due(lid)] + [(d, 1, a, i) for d, a, i, rule in insts(lid) if rule != 'payout'] + [(d, 2, None, i) for d, a, i, rule in insts(lid) if rule == 'payout']
    out, left = [], amount
    for d, kind, owed, iid in sorted(items):
        if left == 0: break
        x = left if owed is None else min(left, owed - paid.get(iid, 0))
        if x > 0: out.append((iid, x)); left -= x
    return out
def apply(eid):
    """Run one stored event through the process graph: state, caches, allocations — all in one transaction."""
    e = G("ledger", f"MATCH (e:Event {{id:{q(eid)}}})-[:APPLIES_TO]->(l:Loan) RETURN labels(e) AS lb, e.at AS at, e.amount_cents AS a, e.memo AS memo, l.id AS lid")
    if not e: return
    e = e[0]; at = aware(e['at']); lid = e['lid']; kind = [x for x in e['lb'] if x not in ('Event', 'Transaction')][0]; amount = e['a'] or 0
    if kind == 'Repayment' and e['memo'] == 'Payout': payout_interest(lid, at)
    L = loan(lid); bal = (L['bal'] or 0) + SIGN.get(kind, 0) * amount
    today = at.astimezone(ZoneInfo(L['tz'])).date()
    clr = repaid_through(lid, at, exclude=eid) + (amount if kind == 'Repayment' else 0) >= due_before(lid, today)
    t = step('loan/' + L['st'], kind, bal, clr); new = t['dst'].split('/')[1]
    alloc = allocate(lid, at, amount) if kind == 'Repayment' else []
    db.set_graph("ledger"); tx = db.begin_transaction()
    try:
        for iid, cents in alloc:
            tx.execute(f"MATCH (e:Repayment {{id:{q(eid)}}}), (x {{id:{q(iid)}}}) INSERT (e)-[:ALLOCATED {{cents:{cents}, rule:'rule:allocation@1'}}]->(x)")
        if kind == 'Repayment' and bal == 0:
            for d, a, iid, rule in insts(lid):
                if rule == 'payout':
                    got = sum(c for i, c in alloc if i == iid) + (G("ledger", f"MATCH (:Repayment)-[a:ALLOCATED]->(:Instalment {{id:{q(iid)}}}) RETURN sum(a.cents) AS s")[0]['s'] or 0)
                    tx.execute(f"MATCH (i:Instalment {{id:{q(iid)}}}) SET i.amount_cents = {got}")
        tx.execute(f"MATCH (l:Loan {{id:{q(lid)}}}) SET l.status = {q(new)}, l.balance_cents = {bal}, l.cache_through = {q(eid)}")
        tx.commit()
    except Exception:
        tx.rollback(); raise
    if t['act']:
        for who in (['borrower', 'lender'] if 'both' in t['act'] else ['borrower'] if 'borrower' in t['act'] else ['lender']):
            ALERTS.append((at.astimezone(BNE).strftime('%d %b %H:%M'), lid, kind, who))
    LOG.append((at.astimezone(BNE).strftime('%a %d %b %Y %H:%M'), eid, lid, kind, amount, L['st'], new, bal, alloc))
def insert_event(eid, kind, lid, at, amount=None, props="", frm=None, to=None, by=None, ref=None):
    money = kind in SIGN
    p = f"id:{q(eid)}, at: {lit(at)}, recorded_at: {lit(at)}"
    if money: p += f", amount_cents: {amount}, currency:'AUD', status:" + ("'posted'" if kind in GENERATED else "'settled'")
    p += props
    m = [f"(l:Loan {{id:{q(lid)}}})"]; ins = [f"(e:{'Event:Transaction:' if money else 'Event:'}{kind} {{{p}}})", "(e)-[:APPLIES_TO]->(l)"]
    for var, node, label, edge in (('fa', frm, 'Account', 'FROM_ACCOUNT'), ('ta', to, 'Account', 'TO_ACCOUNT'), ('bp', by, 'Person', 'BY'), ('ri', ref, 'Instalment', 'ABOUT')):
        if node: m.append(f"({var}:{label} {{id:{q(node)}}})"); ins.append(f"(e)-[:{edge}]->({var})")
    G("ledger", "MATCH " + ", ".join(m) + " INSERT " + ", ".join(ins))
def generate(eid, kind, lid, at, run, amount=None, props="", ref=None, value_date=None, rule=None):
    """A generated event: natural id, so a rebuild recreates exactly the same node."""
    if G("ledger", f"MATCH (e:Event {{id:{q(eid)}}}) RETURN e.id AS i"): return
    extra = (f", value_date: DATE {q(value_date.isoformat())}" if value_date else "") + f", rule:{q(rule)}, engine:{q(ENGINE_V)}" + props
    insert_event(eid, kind, lid, at, amount, extra, ref=ref); generated_by(eid, activity(*run, at)); apply(eid)
def accrue(lid, first, last, kind):
    L = loan(lid); tz = ZoneInfo(L['tz']); rate = L['r'] if kind == 'InterestCharge' else L['dr']
    ev = G("ledger", f"MATCH (t:Transaction)-[:APPLIES_TO]->(:Loan {{id:{q(lid)}}}) RETURN t.at AS at, labels(t) AS lb, t.amount_cents AS a")
    total, per_day, d = 0, 0, first
    while d <= last:
        eod = dt.datetime.combine(d, dt.time(23, 59, 59), tz)
        if kind == 'InterestCharge':
            day = sum(SIGN[[x for x in e['lb'] if x in SIGN][0]] * e['a'] for e in ev if aware(e['at']) <= eod)
        else:
            paid = repaid_through(lid, eod); cum = 0; day = 0
            for due, amt, _, rule in insts(lid):
                if rule == 'payout': continue
                cum += amt
                if (d - due).days > L['gd']: day += max(0, min(amt, cum - paid))
        total += day; per_day += round(day * rate / 365); d += dt.timedelta(days=1)
    return round(total * rate / 365) if ROUNDING == 'per-month' else per_day
def last_charged(lid):
    r = G("ledger", f"MATCH (t:InterestCharge)-[:APPLIES_TO]->(:Loan {{id:{q(lid)}}}) RETURN max(t.value_date) AS d")[0]['d']
    if r: return r
    first = G("ledger", f"MATCH (t:Drawdown)-[:APPLIES_TO]->(:Loan {{id:{q(lid)}}}) RETURN min(t.at) AS a")[0]['a']
    return aware(first).astimezone(ZoneInfo(loan(lid)['tz'])).date() - dt.timedelta(days=1)
def payout_interest(lid, at):
    L = loan(lid); tz = ZoneInfo(L['tz']); upto = at.astimezone(tz).date() - dt.timedelta(days=1); start = last_charged(lid) + dt.timedelta(days=1)
    a = accrue(lid, start, upto, 'InterestCharge') if start <= upto else 0
    if a: generate(f"int:{lid}:payout:{upto.isoformat()}", 'InterestCharge', lid, at - dt.timedelta(minutes=1), ('payout', at.astimezone(BNE).date().isoformat()), a, ", basis:'accrued to payout'", value_date=upto, rule='rule:interest@1')
def next_instalment_after(lid, day): return min(d for d, a, i, r in insts(lid) if d > day)
# ── scheduled work ───────────────────────────────────────────────────────
def daily(run):
    for r in G("ledger", "MATCH (l:Loan) FILTER l.status IN ['active','in_arrears'] RETURN l.id AS id ORDER BY id"):
        lid = r['id']; L = loan(lid); today = run.astimezone(ZoneInfo(L['tz'])).date()
        for due, amt, iid, rule in insts(lid):
            if today <= due: continue
            short = (L['bal'] > 0) if rule == 'payout' else (repaid_through(lid, run) < due_before(lid, due + dt.timedelta(days=1)))
            if not short: continue
            key = ('daily-check', run.astimezone(BNE).date().isoformat())
            if not G("ledger", f"MATCH (e:InstalmentMissed)-[:ABOUT]->(:Instalment {{id:{q(iid)}}}) RETURN e.id AS i"):
                generate(f"missed:{iid}", 'InstalmentMissed', lid, run, key, ref=iid, rule='rule:arrears-check@1')
            elif (today - due).days == L['gd'] + 1:
                generate(f"grace:{iid}", 'GraceExpired', lid, run, key, ref=iid, rule='rule:arrears-check@1')
def loan_month_end(tzname, last):
    for r in G("ledger", f"MATCH (l:Loan) FILTER l.status IN ['active','in_arrears'] AND l.tz = {q(tzname)} RETURN l.id AS id ORDER BY id"):
        lid = r['id']; at = dt.datetime.combine(last, dt.time(23, 59, 59), ZoneInfo(tzname)); first = last.replace(day=1)
        start = last_charged(lid) + dt.timedelta(days=1); run = ('close', at.astimezone(BNE).strftime('%Y-%m'))
        a = accrue(lid, start, last, 'InterestCharge') if start <= last else 0
        if a: generate(f"int:{lid}:{last.strftime('%Y-%m')}", 'InterestCharge', lid, at, run, a, ", basis:'daily balance, ACT/365'", value_date=last, rule='rule:interest@1')
        d = accrue(lid, first, last, 'DefaultInterestCharge')
        if d: generate(f"dint:{lid}:{last.strftime('%Y-%m')}", 'DefaultInterestCharge', lid, at, run, d, f", due_date: DATE {q(next_instalment_after(lid, last).isoformat())}, basis:'overdue amounts beyond grace, ACT/365'", value_date=last, rule='rule:default-interest@1')
ACCTS = ['acct:alice-everyday', 'acct:bob-everyday', 'acct:carol-everyday', 'acct:dan-everyday']
OPEN = dt.datetime(2026, 8, 31, 23, 59, 59, tzinfo=BNE)
def acct_balance(acc, until):
    op = G("ledger", f"MATCH (:Close {{id:'close:2026-08'}})-[:PRODUCED]->(s:AccountBalance)-[:OF]->(:Account {{id:{q(acc)}}}) RETURN s.balance_cents AS o")[0]['o']
    i = sum(r['a'] for r in G("ledger", f"MATCH (t:Transaction)-[:TO_ACCOUNT]->(:Account {{id:{q(acc)}}}) RETURN t.at AS at, t.amount_cents AS a") if OPEN < aware(r['at']) <= until)
    o = sum(r['a'] for r in G("ledger", f"MATCH (t:Transaction)-[:FROM_ACCOUNT]->(:Account {{id:{q(acc)}}}) RETURN t.at AS at, t.amount_cents AS a") if OPEN < aware(r['at']) <= until)
    return op + i - o
def loan_balance(lid, until):
    return sum(SIGN[[x for x in r['lb'] if x in SIGN][0]] * r['a'] for r in G("ledger", f"MATCH (t:Transaction)-[:APPLIES_TO]->(:Loan {{id:{q(lid)}}}) RETURN t.at AS at, labels(t) AS lb, t.amount_cents AS a") if aware(r['at']) <= until)
def close(last):
    period = last.strftime('%Y-%m'); as_of = dt.datetime.combine(last, dt.time(23, 59, 59), BNE)
    closed_at = dt.datetime.combine(last + dt.timedelta(days=1), dt.time(8, 0), BNE)
    G("ledger", f"INSERT (:Close {{id:{q('close:' + period)}, period:{q(period)}, as_of: {lit(as_of)}, closed_at: {lit(closed_at)}, status:'closed', rule:'rule:snapshot@1', engine:{q(ENGINE_V)}}})")
    aid = activity('close', period, as_of); generated_by('close:' + period, aid)
    loans = [r['id'] for r in G("ledger", "MATCH (t:Drawdown)-[:APPLIES_TO]->(l:Loan) RETURN l.id AS id, min(t.at) AS a ORDER BY id") if aware(r['a']) <= as_of] if False else \
            sorted({r['id'] for r in G("ledger", "MATCH (t:Drawdown)-[:APPLIES_TO]->(l:Loan) RETURN l.id AS id, t.at AS a") if aware(r['a']) <= as_of})
    items = [(a, 'AccountBalance', 'Account', acct_balance(a, as_of)) for a in ACCTS] + [(l, 'LoanBalance', 'Loan', loan_balance(l, as_of)) for l in loans]
    for iid, lab, tl, v in items:
        sid = f"snap:{period}/{iid}"
        G("ledger", f"MATCH (c:Close {{id:{q('close:' + period)}}}), (x:{tl} {{id:{q(iid)}}}) INSERT (s:Snapshot:{lab} {{id:{q(sid)}, balance_cents:{v}}}), (c)-[:PRODUCED]->(s), (s)-[:OF]->(x)")
        generated_by(sid, aid)
BLOBS = pathlib.Path('blobs/sha256')
def put(b):
    h = hashlib.sha256(b).hexdigest(); p = BLOBS / h[:2] / h; p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists(): p.write_bytes(b)
    return h, len(b)
def statement_payload(lid, first, last):
    L = loan(lid); tz = ZoneInfo(L['tz']); rows, opening = [], 0
    for e in G("ledger", f"MATCH (t:Transaction)-[:APPLIES_TO]->(:Loan {{id:{q(lid)}}}) RETURN t.id AS id, t.at AS at, labels(t) AS lb, t.amount_cents AS a, t.value_date AS vd ORDER BY t.at"):
        k = [x for x in e['lb'] if x in SIGN][0]; d = e['vd'] or aware(e['at']).astimezone(tz).date()
        if d < first: opening += SIGN[k] * e['a']
        elif d <= last: rows.append({'id': e['id'], 'date': d.isoformat(), 'kind': k, 'cents': SIGN[k] * e['a']})
    closing = opening + sum(r['cents'] for r in rows)
    nxt = [{'id': i, 'date': d.isoformat(), 'cents': a if rule != 'payout' else None} for d, a, i, rule in insts(lid) if d > last][:1] if closing else []
    return {'statement': f"stmt:{lid}/{last.strftime('%Y-%m')}", 'loan': lid, 'period': [first.isoformat(), last.isoformat()], 'tz': L['tz'],
            'opening_cents': opening, 'lines': rows, 'closing_cents': closing, 'next_due': nxt, 'rule': 'rule:statement@1', 'schema': 'schema:ledger@6'}
def render(p):
    md = [f"# Loan statement {p['loan']} — {p['period'][0][:7]}", "", f"Period {p['period'][0]} to {p['period'][1]}, {p['tz']}", "",
          f"Opening balance ${p['opening_cents']/100:,.2f}", "", "| Date | Ref | Item | Amount |", "|---|---|---|---|"]
    md += [f"| {l['date']} | {l['id']} | {l['kind']} | ${l['cents']/100:,.2f} |" for l in p['lines']]
    md += ["", f"Closing balance ${p['closing_cents']/100:,.2f}"]
    if p['next_due']: n = p['next_due'][0]; md.append(f"Next instalment {n['id']} due {n['date']}: " + (f"${n['cents']/100:,.2f}" if n['cents'] else "the balance on the day"))
    return ("\n".join(md) + "\n").encode()
STATEMENTS = []; DSEQ = [0]
def issue_statements(last):
    first = last.replace(day=1); issued = dt.datetime.combine(last + dt.timedelta(days=1), dt.time(9, 0), BNE); period = last.strftime('%Y-%m')
    aid = activity('statements', period, issued)
    for r in G("ledger", "MATCH (l:Loan)-[:BORROWER]->(b:Person) RETURN l.id AS id, b.id AS who ORDER BY id"):
        p = statement_payload(r['id'], first, last)
        if not p['lines'] and p['opening_cents'] == 0: continue
        hp, np_ = put(canon(p)); hr, nr = put(render(p)); sid = p['statement']
        G("ledger", f"""MATCH (l:Loan {{id:{q(r['id'])}}}), (who:Person {{id:{q(r['who'])}}}), (c:Close {{id:{q('close:' + period)}}})
INSERT (s:Document:Statement {{id:{q(sid)}, period:{q(period)}, issued_at: {lit(issued)}, status:'issued', rule:'rule:statement@1', engine:{q(ENGINE_V)}, template:'loan-statement@1', retain_until: DATE '2033-12-31'}}),
 (bp:Blob {{id:{q(ni(hp))}, sha256:{q(hp)}, stored_in:'store:mac14', media_type:'application/json', bytes:{np_}, role:'payload'}}),
 (br:Blob {{id:{q(ni(hr))}, sha256:{q(hr)}, stored_in:'store:mac14', media_type:'text/markdown', bytes:{nr}, role:'rendition'}}),
 (s)-[:COVERS]->(l), (s)-[:WAS_DERIVED_FROM]->(c), (s)-[:ADDRESSED_TO]->(who), (s)-[:HAS_PAYLOAD]->(bp), (s)-[:HAS_RENDITION]->(br)""")
        for x in (sid, ni(hp), ni(hr)): generated_by(x, aid)
        existing = G("ledger", f"MATCH (d:Delivery) FILTER d.statement = {q(sid)} RETURN d.id AS id")
        if existing:   # rebuild: the email was already sent — link it, never send again
            G("ledger", f"MATCH (d:Delivery {{id:{q(existing[0]['id'])}}}), (s:Statement {{id:{q(sid)}}}) INSERT (d)-[:DELIVERED]->(s)")
        else:          # forward: send, and record the fact
            DSEQ[0] += 1; did = f"D{DSEQ[0]}"
            G("ledger", f"""MATCH (s:Statement {{id:{q(sid)}}}), (who:Person {{id:{q(r['who'])}}})
INSERT (d:Event:Delivery {{id:{q(did)}, at: {lit(issued + dt.timedelta(minutes=5))}, channel:'email', status:'sent', statement:{q(sid)},
  message_id:{q('<' + sid.replace(':', '-').replace('/', '-') + '.' + did + '@lending-demo.example.com>')}}}), (d)-[:DELIVERED]->(s), (d)-[:SENT_TO]->(who)""")
        STATEMENTS.append((sid, hp, r['id'], first, last))
# ── the clock ────────────────────────────────────────────────────────────
S = lambda s: dt.datetime.fromisoformat(s).replace(tzinfo=SYD); B = lambda s: dt.datetime.fromisoformat(s).replace(tzinfo=BNE)
def forward_plan():
    def l3_create():
        G("ledger", """MATCH (alice:Person {id:'person:alice'}), (carol:Person {id:'person:carol'})
INSERT (l3:Agreement:Loan {id:'loan:L3', principal_cents: 60000, currency:'AUD', rate_pa: 0.08, default_rate_pa: 0.18, grace_days: 28,
  day_count:'ACT/365', interest_charged:'monthly on daily balance', tz:'Australia/Sydney', status:'new', balance_cents: 0}), (l3)-[:LENDER]->(alice), (l3)-[:BORROWER]->(carol)""")
        insert_event('E7', 'Request', 'loan:L3', S('2026-10-02T10:30'), props=", requested_cents: 60000, purpose:'Car', channel:'app'", by='person:carol'); apply('E7')
    def l3_offer():
        G("ledger", """MATCH (l:Loan {id:'loan:L3'}) INSERT (i1:Instalment {id:'loan:L3/i1', due_date: DATE '2026-11-02', amount_cents: 20500}), (i2:Instalment {id:'loan:L3/i2', due_date: DATE '2026-12-02', amount_cents: 20500}),
          (i3:Instalment {id:'loan:L3/i3', due_date: DATE '2027-01-02', amount_cents: 0, amount_rule:'payout', note:'the balance on the day'}), (l)-[:SCHEDULES]->(i1), (l)-[:SCHEDULES]->(i2), (l)-[:SCHEDULES]->(i3)""")
        insert_event('E8', 'Offer', 'loan:L3', S('2026-10-03T14:00'), by='person:alice'); apply('E8')
    def payout(eid, lid, at, frm, to):
        payout_interest(lid, at)
        insert_event(eid, 'Repayment', lid, at, loan(lid)['bal'], ", memo:'Payout'", frm, to); apply(eid)
    return [
     (S('2026-10-02T10:30'), l3_create), (S('2026-10-03T14:00'), l3_offer),
     (S('2026-10-04T19:00'), lambda: (insert_event('E9', 'Sign', 'loan:L3', S('2026-10-04T19:00'), by='person:carol'), apply('E9'))),
     (S('2026-10-05T11:00'), lambda: (insert_event('T8', 'Drawdown', 'loan:L3', S('2026-10-05T11:00'), 60000, frm='acct:alice-everyday', to='acct:carol-everyday'), apply('T8'))),
     (B('2026-11-30T08:31'), lambda: payout('T12', 'loan:L1', B('2026-11-30T08:31'), 'acct:bob-everyday', 'acct:alice-everyday')),
     (S('2026-12-10T12:00'), lambda: (insert_event('T14', 'Repayment', 'loan:L3', S('2026-12-10T12:00'), 41000, frm='acct:carol-everyday', to='acct:alice-everyday'), apply('T14'))),
     (S('2027-01-02T12:00'), lambda: payout('T18', 'loan:L3', S('2027-01-02T12:00'), 'acct:carol-everyday', 'acct:alice-everyday'))]
def run_clock(start, end, plan):
    Q = []; n = 0
    def push(at, pri, fn):
        nonlocal n; n += 1; heapq.heappush(Q, (at.astimezone(UTC), pri, n, fn))
    for at, fn in plan: push(at, 1, fn)
    d = start
    while d <= end:
        push(dt.datetime.combine(d, dt.time(9, 0), BNE), 0, lambda r=dt.datetime.combine(d, dt.time(9, 0), BNE): daily(r))
        if (d + dt.timedelta(days=1)).day == 1:
            for tzn in ('Australia/Brisbane', 'Australia/Sydney'):
                push(dt.datetime.combine(d, dt.time(23, 59, 59), ZoneInfo(tzn)), 2, lambda tzn=tzn, d=d: loan_month_end(tzn, d))
            push(dt.datetime.combine(d, dt.time(23, 59, 59), BNE), 3, lambda d=d: close(d))
            push(dt.datetime.combine(d + dt.timedelta(days=1), dt.time(9, 0), BNE), 4, lambda d=d: issue_statements(d))
        d += dt.timedelta(days=1)
    while Q:
        heapq.heappop(Q)[3]()
if MODE == 'forward':
    plan = [(aware(r['at']), (lambda eid=r['id']: apply(eid))) for r in G("ledger", "MATCH (e:Event)-[:APPLIES_TO]->(:Loan) RETURN e.id AS id, e.at AS at")] + forward_plan()
else:
    plan = [(aware(r['at']), (lambda eid=r['id']: apply(eid))) for r in G("ledger", "MATCH (e:Event)-[:APPLIES_TO]->(:Loan) RETURN e.id AS id, e.at AS at, labels(e) AS lb") if not set(r['lb']) & GENERATED]
run_clock(dt.date(2026, 9, 1), dt.date(2027, 1, 31), plan)
# decisions: caches re-made by their rules
for d in G("decisions", "MATCH (d:Decision) RETURN d.id AS id, d.title AS title, d.statement AS statement, d.rationale AS rationale"):
    st = 'superseded' if G("decisions", f"MATCH (d:Decision {{id:{q(d['id'])}}})<-[:SUPERSEDES]-() RETURN d.id AS i") else 'current'
    h = 'sha-256-64:' + hashlib.sha256('|'.join([d['title'], d['statement'], d['rationale']]).encode()).hexdigest()[:16]   # a hash names its algorithm (editor spec §51)
    G("decisions", f"MATCH (x:Decision {{id:{q(d['id'])}}}) SET x.status = {q(st)}, x.content_hash = {q(h)}")
